/**
 * Hook for AI Layout Optimization
 * 
 * AI-only layout engine. Queries existing runs to subtract already-printed
 * quantities before sending to the AI. Falls back to individual runs if AI fails.
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  calculateProductionTime,
  calculateRunPrintTime,
  getSlotConfig,
  calculateFramesForSlot,
  calculateMeters,
  scoreLayout,
  createSingleItemRun,
  DEFAULT_MAX_OVERRUN
} from '@/utils/labels/layoutOptimizer';
import { 
  type LabelItem, 
  type LabelDieline, 
  type LayoutOption,
  type LayoutDebugInfo,
  type LayoutTradeOffs,
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
 * Query existing runs for an order and compute already-printed quantities per item
 */
async function getAlreadyPrintedQuantities(orderId: string): Promise<Map<string, number>> {
  const printed = new Map<string, number>();
  
  try {
    const { data: existingRuns, error } = await supabase
      .from('label_runs')
      .select('slot_assignments')
      .eq('order_id', orderId);
    
    if (error) {
      console.error('Error fetching existing runs:', error);
      return printed;
    }
    
    if (!existingRuns || existingRuns.length === 0) return printed;
    
    for (const run of existingRuns) {
      const slots = run.slot_assignments as unknown as Array<{ item_id: string; quantity_in_slot: number }>;
      if (!Array.isArray(slots)) continue;
      
      for (const slot of slots) {
        if (slot.item_id && slot.quantity_in_slot > 0) {
          printed.set(slot.item_id, (printed.get(slot.item_id) || 0) + slot.quantity_in_slot);
        }
      }
    }
  } catch (err) {
    console.error('Failed to query existing runs:', err);
  }
  
  return printed;
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
  qtyPerRoll?: number,
  aiTradeOffs?: LayoutTradeOffs,
  debugInfo?: LayoutDebugInfo
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
        reasoning: aiRun.reasoning,
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
      trade_offs: aiTradeOffs,
      debug_info: debugInfo,
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

/**
 * Build a fallback layout using individual runs (one item per run)
 */
function buildFallbackLayout(
  items: LabelItem[],
  dieline: LabelDieline,
  weights: OptimizationWeights,
  qtyPerRoll?: number
): LayoutOption {
  const config = getSlotConfig(dieline);
  const totalLabelsNeeded = items.reduce((sum, i) => sum + i.quantity, 0);
  const theoreticalMinFrames = Math.ceil(totalLabelsNeeded / config.labelsPerFrame);
  const theoreticalMinMeters = calculateMeters(theoreticalMinFrames, config);

  const runs = items.map((item, idx) => createSingleItemRun(item, idx + 1, config));
  const totalMeters = runs.reduce((sum, r) => sum + r.meters, 0);
  const totalFrames = runs.reduce((sum, r) => sum + r.frames, 0);
  const wasteMeters = Math.max(0, totalMeters - theoreticalMinMeters);

  const materialEfficiency = totalMeters > 0 ? Math.max(0, 1 - (wasteMeters / totalMeters)) : 0;
  const printEfficiency = 1 / (1 + runs.length * 0.1);
  let laborEfficiency = 1 / (1 + runs.length * 0.15);

  if (qtyPerRoll && qtyPerRoll > 0) {
    const rewindingRuns = runs.filter(r => {
      const actualPerSlot = r.frames * config.labelsPerSlotPerFrame;
      return actualPerSlot < (qtyPerRoll - 50);
    });
    if (rewindingRuns.length > 0) {
      const rewindPenalty = (rewindingRuns.length / runs.length) * 0.4;
      laborEfficiency = Math.max(0, laborEfficiency - rewindPenalty);
    }
  }

  const partial = {
    id: 'fallback-individual',
    runs,
    total_meters: totalMeters,
    total_frames: totalFrames,
    total_waste_meters: Math.round(wasteMeters * 100) / 100,
    material_efficiency_score: materialEfficiency,
    print_efficiency_score: printEfficiency,
    labor_efficiency_score: laborEfficiency,
    reasoning: '⚙️ Fallback: Each item on its own run (AI was unavailable)',
  };

  return {
    ...partial,
    overall_score: scoreLayout(partial, weights),
  };
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
    currentMaxOverrun: number,
    alreadyPrinted: Array<{ item_id: string; printed_qty: number }>
  ): Promise<LayoutOption | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('label-optimize', {
        body: { 
          items: itemsToUse, 
          dieline: dielineToUse, 
          constraints: { max_overrun: currentMaxOverrun },
          qty_per_roll: qtyPerRoll ?? undefined,
          label_width_mm: dielineToUse.label_width_mm,
          label_height_mm: dielineToUse.label_height_mm,
          already_printed: alreadyPrinted.length > 0 ? alreadyPrinted : undefined,
        }
      });

      if (error) throw error;

      if (data?.layout?.runs) {
        const validationWarnings: string[] = data.validation?.warnings || [];

        const reasoning = data.layout.overall_reasoning || 'AI-optimized layout';

        // Build debug info for UI inspection
        const debugInfo: LayoutDebugInfo = {
          validation_warnings: validationWarnings,
          correction_notes: [],
          input_items: itemsToUse.map(i => ({ id: i.id, name: i.name, quantity: i.quantity })),
        };

        const aiOption = buildAILayoutOption(
          data.layout.runs,
          reasoning,
          data.layout.estimated_waste_percent || 0,
          dielineToUse,
          itemsToUse,
          weightsToUse,
          qtyPerRoll ?? undefined,
          data.layout.trade_offs,
          debugInfo
        );

        if (data.validation && !data.validation.valid) {
          console.warn('AI layout validation warnings:', validationWarnings);
          toast.warning('AI layout has validation warnings — review before applying');
        }

        return aiOption;
      }
      return null;
    } catch (error: any) {
      console.error('AI layout error:', error);
      if (error.message?.includes('429') || error.status === 429) {
        toast.error('AI rate limit reached. Using fallback layout.');
      } else if (error.message?.includes('402') || error.status === 402) {
        toast.error('AI credits exhausted. Using fallback layout.');
      }
      return null;
    }
  }, [qtyPerRoll]);

  /**
   * Generate layout options — AI-only with fallback
   */
  const generateLayoutOptions = useCallback(async (
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
    
    try {
      // Step 1: Query already-printed quantities for this order
      const printedMap = await getAlreadyPrintedQuantities(orderId);
      
      // Step 2: Subtract already-printed from item quantities
      const alreadyPrinted: Array<{ item_id: string; printed_qty: number }> = [];
      const adjustedItems: LabelItem[] = [];
      
      for (const item of itemsToUse) {
        const printed = printedMap.get(item.id) || 0;
        const remaining = Math.max(0, item.quantity - printed);
        
        if (printed > 0) {
          alreadyPrinted.push({ item_id: item.id, printed_qty: printed });
        }
        
        if (remaining > 0) {
          adjustedItems.push({ ...item, quantity: remaining });
        }
        // Skip fully-printed items entirely
      }
      
      if (adjustedItems.length === 0) {
        toast.info('All items have already been printed — no layout needed');
        setIsGenerating(false);
        setIsLoadingAI(false);
        return;
      }
      
      if (alreadyPrinted.length > 0) {
        const totalPrinted = alreadyPrinted.reduce((s, a) => s + a.printed_qty, 0);
        toast.info(`${alreadyPrinted.length} item(s) partially printed (${totalPrinted.toLocaleString()} labels). Planning for remaining quantities.`);
      }
      
      // Step 3: Call AI with adjusted quantities
      const aiOption = await fetchAILayout(adjustedItems, dielineToUse, weightsToUse, maxOverrun, alreadyPrinted);
      
      if (aiOption) {
        setOptions([aiOption]);
        setSelectedOption(aiOption);
        toast.success('AI layout computed');
      } else {
        // Fallback: individual runs
        const fallback = buildFallbackLayout(adjustedItems, dielineToUse, weightsToUse, qtyPerRoll ?? undefined);
        setOptions([fallback]);
        setSelectedOption(fallback);
        toast.warning('AI unavailable — using fallback layout (one run per item)');
      }
    } catch (error) {
      console.error('Layout generation failed:', error);
      toast.error('Layout generation failed');
    } finally {
      setIsGenerating(false);
      setIsLoadingAI(false);
    }

  }, [items, dieline, weights, qtyPerRoll, maxOverrun, fetchAILayout, orderId]);

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
