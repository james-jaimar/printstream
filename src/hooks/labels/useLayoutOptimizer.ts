/**
 * Hook for AI Layout Optimization
 * 
 * Provides React interface for the layout optimizer service
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  generateLayoutOptions, 
  estimateProductionTime, 
  validateLayout 
} from '@/services/labels/layoutOptimizer';
import { 
  type LabelItem, 
  type LabelDieline, 
  type LayoutOption,
  type OptimizationWeights,
  DEFAULT_OPTIMIZATION_WEIGHTS 
} from '@/types/labels';
import { useCreateLabelRun } from './useLabelRuns';
import { toast } from 'sonner';

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
  
  const { mutateAsync: createRun, isPending: isCreating } = useCreateLabelRun();

  /**
   * Generate layout options based on current items and dieline
   */
  const generateOptions = useCallback(() => {
    if (!dieline) {
      toast.error('Please select a dieline before generating layouts');
      return;
    }
    
    if (items.length === 0) {
      toast.error('Please add items before generating layouts');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const generatedOptions = generateLayoutOptions({
        items,
        dieline,
        weights
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
   * Apply selected layout - creates runs in database
   */
  const applyLayout = useCallback(async () => {
    if (!selectedOption) {
      toast.error('Please select a layout option first');
      return false;
    }
    
    const validation = validateLayout(selectedOption, items);
    if (!validation.valid) {
      toast.error(`Layout validation failed: ${validation.errors.join(', ')}`);
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
          estimated_duration_minutes: estimateProductionTime({ 
            ...selectedOption, 
            runs: [run] 
          }),
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
  }, [selectedOption, items, orderId, createRun]);

  /**
   * Get production time estimate for an option
   */
  const getProductionTime = useCallback((option: LayoutOption) => {
    return estimateProductionTime(option);
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
      estimatedMinutes: estimateProductionTime(selectedOption),
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
    
    // Actions
    generateOptions,
    selectOption: setSelectedOption,
    applyLayout,
    updateWeights: setWeights,
    getProductionTime
  };
}
