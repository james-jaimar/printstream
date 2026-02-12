/**
 * Hook for AI Layout Optimization
 * 
 * Provides React interface for the layout optimizer service
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  generateLayoutOptions as generateOptions,
  calculateProductionTime,
  calculateRunPrintTime
} from '@/utils/labels/layoutOptimizer';
import { 
  type LabelItem, 
  type LabelDieline, 
  type LayoutOption,
  type OptimizationWeights,
  DEFAULT_OPTIMIZATION_WEIGHTS 
} from '@/types/labels';
import { useCreateLabelRun } from './useLabelRuns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AISuggestion {
  recommendation: 'ganged' | 'individual' | 'hybrid';
  reasoning: string;
  estimated_waste_percent: number;
  suggested_run_count: number;
  efficiency_tips?: string[];
}

interface UseLayoutOptimizerProps {
  orderId: string;
  items: LabelItem[];
  dieline: LabelDieline | null;
}

export function useLayoutOptimizer({ orderId, items, dieline }: UseLayoutOptimizerProps) {
  const [options, setOptions] = useState<LayoutOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<LayoutOption | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [weights, setWeights] = useState<OptimizationWeights>(DEFAULT_OPTIMIZATION_WEIGHTS);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  
  const { mutateAsync: createRun, isPending: isCreating } = useCreateLabelRun();

  /**
   * Generate layout options based on current items and dieline
   */
  const generateLayoutOptions = useCallback((
    customItems?: LabelItem[],
    customDieline?: LabelDieline,
    customWeights?: OptimizationWeights
  ) => {
    const itemsToUse = customItems ?? items;
    const dielineToUse = customDieline ?? dieline;
    const weightsToUse = customWeights ?? weights;
    
    if (!dielineToUse) {
      toast.error('Please select a dieline before generating layouts');
      return;
    }
    
    if (itemsToUse.length === 0) {
      toast.error('Please add items before generating layouts');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const generatedOptions = generateOptions({
        items: itemsToUse,
        dieline: dielineToUse,
        weights: weightsToUse
      });
      
      setOptions(generatedOptions);
      
      // Auto-select the best option
      if (generatedOptions.length > 0) {
        setSelectedOption(generatedOptions[0]);
      }
      
      toast.success(`Generated ${generatedOptions.length} layout options`);
    } catch (error) {
      console.error('Layout generation failed:', error);
      toast.error('Failed to generate layout options');
    } finally {
      setIsGenerating(false);
    }
  }, [items, dieline, weights]);

  /**
   * Fetch AI suggestion for layout optimization
   */
  const fetchAISuggestion = useCallback(async (
    customItems?: LabelItem[],
    customDieline?: LabelDieline,
    constraints?: { rush_job?: boolean; prefer_ganging?: boolean }
  ) => {
    const itemsToUse = customItems ?? items;
    const dielineToUse = customDieline ?? dieline;
    
    if (!dielineToUse || itemsToUse.length === 0) {
      toast.error('Please add items and select a dieline first');
      return;
    }
    
    setIsLoadingAI(true);
    setAiSuggestion(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('label-optimize', {
        body: { items: itemsToUse, dieline: dielineToUse, constraints }
      });

      if (error) throw error;

      if (data?.suggestion) {
        setAiSuggestion(data.suggestion);
        toast.success('AI analysis complete');
      } else {
        toast.info('AI could not generate a suggestion');
      }
    } catch (error: any) {
      console.error('AI optimization error:', error);
      
      if (error.message?.includes('429') || error.status === 429) {
        toast.error('AI rate limit reached. Please try again later.');
      } else if (error.message?.includes('402') || error.status === 402) {
        toast.error('AI credits exhausted. Please add funds.');
      } else {
        toast.error('AI optimization failed');
      }
    } finally {
      setIsLoadingAI(false);
    }
  }, [items, dieline]);

  /**
   * Apply selected layout - creates runs in database
   */
  const applyLayout = useCallback(async () => {
    if (!selectedOption) {
      toast.error('Please select a layout option first');
      return false;
    }
    
    try {
      // Create runs sequentially to maintain order
      for (const run of selectedOption.runs) {
        await createRun({
          order_id: orderId,
          slot_assignments: run.slot_assignments,
          meters_to_print: run.meters,
          frames_count: run.frames,
          // Store per-run print time only (no make-ready; that's order-level)
          estimated_duration_minutes: calculateRunPrintTime(run),
          ai_optimization_score: selectedOption.overall_score,
          ai_reasoning: selectedOption.reasoning,
        });
      }
      
      toast.success(`Created ${selectedOption.runs.length} production runs`);
      return true;
    } catch (error) {
      console.error('Failed to apply layout:', error);
      toast.error('Failed to create production runs');
      return false;
    }
  }, [selectedOption, orderId, createRun]);

  /**
   * Get production time estimate for an option
   */
  const getProductionTime = useCallback((option: LayoutOption) => {
    return calculateProductionTime(option.runs);
  }, []);

  /**
   * Computed values
   */
  const summary = useMemo(() => {
    if (!selectedOption) return null;
    
    return {
      totalRuns: selectedOption.runs.length,
      totalMeters: selectedOption.total_meters,
      totalFrames: selectedOption.total_frames,
      wasteMeters: selectedOption.total_waste_meters,
      estimatedMinutes: calculateProductionTime(selectedOption.runs),
      overallScore: selectedOption.overall_score
    };
  }, [selectedOption]);

  const canGenerate = useMemo(() => {
    return dieline !== null && items.length > 0;
  }, [dieline, items]);

  return {
    // State
    options,
    selectedOption,
    isGenerating,
    isApplying: isCreating,
    weights,
    summary,
    canGenerate,
    aiSuggestion,
    isLoadingAI,
    
    // Actions
    generateOptions: generateLayoutOptions,
    selectOption: setSelectedOption,
    applyLayout,
    updateWeights: setWeights,
    getProductionTime,
    fetchAISuggestion
  };
}
