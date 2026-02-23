/**
 * Hook for AI Layout Optimization
 * 
 * Provides React interface for the layout optimizer service.
 * Fires both local algorithm AND AI edge function in parallel,
 * merging the AI-computed layout as a first-class option.
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  generateLayoutOptions as generateOptions,
  calculateProductionTime,
  calculateRunPrintTime,
  getSlotConfig,
  calculateFramesForSlot,
  calculateMeters,
  scoreLayout,
  DEFAULT_MAX_OVERRUN
} from '@/utils/labels/layoutOptimizer';
import { 
  type LabelItem, 
  type LabelDieline, 
  type LayoutOption,
  type ProposedRun,
  type SlotAssignment,
  type OptimizationWeights,
  DEFAULT_OPTIMIZATION_WEIGHTS 
} from '@/types/labels';
import { useCreateLabelRun } from './useLabelRuns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseLayoutOptimizerProps {
  orderId: string;
  items: LabelItem[];
  dieline: LabelDieline | null;
  savedLayout?: LayoutOption | null;
  qtyPerRoll?: number | null;
}

/**
 * Convert AI response runs into a proper LayoutOption
 */
function buildAILayoutOption(
  aiRuns: Array<{
    slot_assignments: Array<{ item_id: string; quantity_in_slot: number }>;
    reasoning: string;
  }>,
  aiReasoning: string,
  aiWastePercent: number,
  dieline: LabelDieline,
  items: LabelItem[],
  weights: OptimizationWeights,
  qtyPerRoll?: number
): LayoutOption | null {
  try {
    const config = getSlotConfig(dieline);
    const totalLabelsNeeded = items.reduce((sum, i) => sum + i.quantity, 0);
    const theoreticalMinFrames = Math.ceil(totalLabelsNeeded / config.labelsPerFrame);
    const theoreticalMinMeters = calculateMeters(theoreticalMinFrames, config);

    const proposedRuns: ProposedRun[] = aiRuns.map((aiRun, idx) => {
      const slotAssignments: SlotAssignment[] = aiRun.slot_assignments.map((slot, slotIdx) => ({
        slot: slotIdx,
        item_id: slot.item_id,
        quantity_in_slot: slot.quantity_in_slot,
        needs_rotation: items.find(i => i.id === slot.item_id)?.needs_rotation || false,
      }));

      const maxSlotQty = Math.max(...slotAssignments.map(a => a.quantity_in_slot));
      const frames = calculateFramesForSlot(maxSlotQty, config);
      const meters = calculateMeters(frames, config);
      const actualLabelsPerSlot = frames * config.labelsPerSlotPerFrame;

      return {
        run_number: idx + 1,
        slot_assignments: slotAssignments,
        meters,
        frames,
        actual_labels_per_slot: actualLabelsPerSlot,
        labels_per_output_roll: actualLabelsPerSlot,
        needs_rewinding: qtyPerRoll ? actualLabelsPerSlot < (qtyPerRoll - 50) : false,
      };
    });

    const totalMeters = proposedRuns.reduce((sum, r) => sum + r.meters, 0);
    const totalFrames = proposedRuns.reduce((sum, r) => sum + r.frames, 0);
    const wasteMeters = Math.max(0, totalMeters - theoreticalMinMeters);

    const materialEfficiency = totalMeters > 0
      ? Math.max(0, 1 - (wasteMeters / totalMeters))
      : 0;
    const printEfficiency = 1 / (1 + proposedRuns.length * 0.1);
    let laborEfficiency = 1 / (1 + proposedRuns.length * 0.15);

    if (qtyPerRoll && qtyPerRoll > 0) {
      const rewindingRuns = proposedRuns.filter(r => r.needs_rewinding);
      if (rewindingRuns.length > 0) {
        const rewindPenalty = (rewindingRuns.length / proposedRuns.length) * 0.4;
        laborEfficiency = Math.max(0, laborEfficiency - rewindPenalty);
      }
    }

    const partial = {
      id: 'ai-computed',
      runs: proposedRuns,
      total_meters: totalMeters,
      total_frames: totalFrames,
      total_waste_meters: Math.round(wasteMeters * 100) / 100,
      material_efficiency_score: materialEfficiency,
      print_efficiency_score: printEfficiency,
      labor_efficiency_score: laborEfficiency,
      reasoning: `🤖 AI-Computed: ${aiReasoning}`,
    };

    return {
      ...partial,
      overall_score: scoreLayout(partial, weights),
    };
  } catch (error) {
    console.error('Failed to build AI layout option:', error);
    return null;
  }
}

export function useLayoutOptimizer({ orderId, items, dieline, savedLayout, qtyPerRoll }: UseLayoutOptimizerProps) {
  const [options, setOptions] = useState<LayoutOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<LayoutOption | null>(
    savedLayout ? savedLayout as LayoutOption : null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [weights, setWeights] = useState<OptimizationWeights>(DEFAULT_OPTIMIZATION_WEIGHTS);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSavedLayout, setHasSavedLayout] = useState(!!savedLayout);
  const [maxOverrun, setMaxOverrun] = useState(DEFAULT_MAX_OVERRUN);
  
  const { mutateAsync: createRun, isPending: isCreating } = useCreateLabelRun();

  /**
   * Fetch AI-computed layout from edge function
   */
  const fetchAILayout = useCallback(async (
    itemsToUse: LabelItem[],
    dielineToUse: LabelDieline,
    weightsToUse: OptimizationWeights,
    currentMaxOverrun: number
  ): Promise<LayoutOption | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('label-optimize', {
        body: { 
          items: itemsToUse, 
          dieline: dielineToUse, 
          constraints: { max_overrun: currentMaxOverrun } 
        }
      });

      if (error) throw error;

      if (data?.layout?.runs) {
        const aiOption = buildAILayoutOption(
          data.layout.runs,
          data.layout.overall_reasoning || 'AI-optimized layout',
          data.layout.estimated_waste_percent || 0,
          dielineToUse,
          itemsToUse,
          weightsToUse,
          qtyPerRoll ?? undefined
        );

        if (data.validation && !data.validation.valid) {
          console.warn('AI layout validation warnings:', data.validation.warnings);
        }

        return aiOption;
      }
      return null;
    } catch (error: any) {
      console.error('AI layout error:', error);
      if (error.message?.includes('429') || error.status === 429) {
        toast.error('AI rate limit reached. Using algorithmic layouts only.');
      } else if (error.message?.includes('402') || error.status === 402) {
        toast.error('AI credits exhausted. Using algorithmic layouts only.');
      }
      // Don't show generic error — algorithmic fallback is fine
      return null;
    }
  }, [qtyPerRoll]);

  /**
   * Generate layout options — fires algorithm + AI in parallel
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
    setIsLoadingAI(true);
    
    // Fire algorithm immediately
    let algorithmicOptions: LayoutOption[] = [];
    try {
      algorithmicOptions = generateOptions({
        items: itemsToUse,
        dieline: dielineToUse,
        weights: weightsToUse,
        qtyPerRoll: qtyPerRoll ?? undefined,
        maxOverrun,
      });
    } catch (error) {
      console.error('Algorithmic layout generation failed:', error);
    }

    // Show algorithmic results immediately
    setOptions(algorithmicOptions);
    if (algorithmicOptions.length > 0) {
      setSelectedOption(algorithmicOptions[0]);
    }
    setIsGenerating(false);

    // Fire AI in parallel — merge when done
    fetchAILayout(itemsToUse, dielineToUse, weightsToUse, maxOverrun)
      .then(aiOption => {
        if (aiOption) {
          setOptions(prev => {
            const merged = [aiOption, ...prev.filter(o => o.id !== 'ai-computed')];
            // Re-sort by score
            merged.sort((a, b) => b.overall_score - a.overall_score);
            return merged;
          });
          // Auto-select AI option if it scores highest
          setSelectedOption(current => {
            if (!current || aiOption.overall_score >= current.overall_score) {
              return aiOption;
            }
            return current;
          });
          toast.success('AI layout computed');
        }
      })
      .finally(() => setIsLoadingAI(false));

  }, [items, dieline, weights, qtyPerRoll, maxOverrun, fetchAILayout]);

  /**
   * Apply selected layout - creates runs in database
   */
  const applyLayout = useCallback(async () => {
    if (!selectedOption) {
      toast.error('Please select a layout option first');
      return false;
    }
    
    try {
      for (const run of selectedOption.runs) {
        await createRun({
          order_id: orderId,
          slot_assignments: run.slot_assignments,
          meters_to_print: run.meters,
          frames_count: run.frames,
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

  /**
   * Save selected layout to the order in database
   */
  const saveLayout = useCallback(async () => {
    if (!selectedOption) {
      toast.error('Please select a layout option first');
      return false;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('label_orders')
        .update({ saved_layout: selectedOption as any })
        .eq('id', orderId);
      
      if (error) throw error;
      
      setHasSavedLayout(true);
      toast.success('Layout saved for quoting');
      return true;
    } catch (error) {
      console.error('Failed to save layout:', error);
      toast.error('Failed to save layout');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [selectedOption, orderId]);

  /**
   * Clear saved layout from the order
   */
  const clearSavedLayout = useCallback(async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('label_orders')
        .update({ saved_layout: null })
        .eq('id', orderId);
      
      if (error) throw error;
      
      setHasSavedLayout(false);
      setSelectedOption(null);
      setOptions([]);
      toast.success('Saved layout cleared');
    } catch (error) {
      console.error('Failed to clear layout:', error);
      toast.error('Failed to clear layout');
    } finally {
      setIsSaving(false);
    }
  }, [orderId]);

  return {
    // State
    options,
    selectedOption,
    isGenerating,
    isApplying: isCreating,
    weights,
    summary,
    canGenerate,
    isLoadingAI,
    isSaving,
    hasSavedLayout,
    maxOverrun,
    
    // Actions
    generateOptions: generateLayoutOptions,
    selectOption: setSelectedOption,
    applyLayout,
    updateWeights: setWeights,
    getProductionTime,
    saveLayout,
    clearSavedLayout,
    setMaxOverrun
  };
}
