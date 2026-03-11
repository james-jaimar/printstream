/**
 * Hook for AI Layout Optimization
 * 
 * AI-only layout engine. Queries existing runs (printing/completed only)
 * to subtract already-printed quantities before sending to the AI.
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  getSlotConfig,
  calculateFramesForSlot,
  calculateMeters,
  calculateProductionTime,
  calculateRunPrintTime,
} from '@/utils/labels/layoutOptimizer';
import type { 
  LabelItem, 
  LabelDieline, 
  LayoutOption,
  ProposedRun,
  SlotAssignment,
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
 * Query existing runs for an order — ONLY count runs that are actually printing or completed.
 * Planned/saved runs are NOT counted to avoid corrupting input on regeneration.
 */
async function getAlreadyPrintedQuantities(orderId: string): Promise<Map<string, number>> {
  const printed = new Map<string, number>();
  
  try {
    const { data, error } = await supabase
      .from('label_runs')
      .select('slot_assignments')
      .eq('order_id', orderId)
      .in('status', ['printing', 'completed']);
    
    if (error || !data?.length) return printed;
    
    for (const run of data) {
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

export function useLayoutOptimizer({ orderId, items, dieline, savedLayout, qtyPerRoll }: UseLayoutOptimizerProps) {
  const [options, setOptions] = useState<LayoutOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<LayoutOption | null>(
    savedLayout ?? null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSavedLayout, setHasSavedLayout] = useState(!!savedLayout);
  const [maxOverrun, setMaxOverrun] = useState(250);
  
  const { mutateAsync: createRun, isPending: isCreating } = useCreateLabelRun();

  /**
   * Generate layout — AI-only, single call, direct mapping
   */
  const generateOptions = useCallback(async () => {
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
      // Step 1: Query already-printed quantities (printing/completed only)
      const printedMap = await getAlreadyPrintedQuantities(orderId);
      
      // Step 2: Subtract printed from requested
      const adjustedItems = items.map(item => {
        const printed = printedMap.get(item.id) || 0;
        return { ...item, quantity: Math.max(0, item.quantity - printed) };
      }).filter(item => item.quantity > 0);
      
      if (adjustedItems.length === 0) {
        toast.info('All items have already been printed — no layout needed');
        setIsGenerating(false);
        return;
      }
      
      if (printedMap.size > 0) {
        const totalPrinted = Array.from(printedMap.values()).reduce((s, v) => s + v, 0);
        toast.info(`${printedMap.size} item(s) partially printed (${totalPrinted.toLocaleString()} labels). Planning remaining.`);
      }
      
      // Step 3: Call AI edge function
      const { data, error } = await supabase.functions.invoke('label-optimize', {
        body: {
          items: adjustedItems.map(i => ({ id: i.id, name: i.name, quantity: i.quantity })),
          dieline,
          max_overrun: maxOverrun,
          qty_per_roll: qtyPerRoll ?? undefined,
        }
      });
      
      if (error) throw error;
      if (!data?.layout?.runs) throw new Error('No layout returned from AI');
      
      // Step 4: Map AI response directly to LayoutOption
      const config = getSlotConfig(dieline);
      
      const runs: ProposedRun[] = data.layout.runs.map((aiRun: any, idx: number) => {
        const slotAssignments: SlotAssignment[] = aiRun.slot_assignments.map((slot: any, slotIdx: number) => ({
          slot: slotIdx,
          item_id: slot.item_id,
          quantity_in_slot: slot.quantity_in_slot,
          needs_rotation: items.find(i => i.id === slot.item_id)?.needs_rotation || false,
        }));
        
        const maxSlotQty = Math.max(...slotAssignments.map(a => a.quantity_in_slot));
        const frames = calculateFramesForSlot(maxSlotQty, config);
        const meters = calculateMeters(frames, config);
        
        return {
          run_number: idx + 1,
          slot_assignments: slotAssignments,
          meters,
          frames,
          actual_labels_per_slot: frames * config.labelsPerSlotPerFrame,
          reasoning: aiRun.reasoning,
        };
      });
      
      const totalMeters = runs.reduce((s, r) => s + r.meters, 0);
      const totalFrames = runs.reduce((s, r) => s + r.frames, 0);
      const totalLabelsNeeded = adjustedItems.reduce((s, i) => s + i.quantity, 0);
      const theoreticalMinFrames = Math.ceil(totalLabelsNeeded / config.labelsPerFrame);
      const theoreticalMinMeters = calculateMeters(theoreticalMinFrames, config);
      
      const option: LayoutOption = {
        id: 'ai-layout',
        runs,
        total_meters: totalMeters,
        total_frames: totalFrames,
        total_waste_meters: Math.max(0, Math.round((totalMeters - theoreticalMinMeters) * 100) / 100),
        reasoning: data.layout.overall_reasoning || 'AI-optimized layout',
        trade_offs: data.layout.trade_offs,
        warnings: data.warnings,
      };
      
      setOptions([option]);
      setSelectedOption(option);
      
      if (data.warnings?.length > 0) {
        toast.warning(`Layout has ${data.warnings.length} warning(s) — review before applying`);
      } else {
        toast.success('AI layout computed');
      }
    } catch (error: any) {
      console.error('Layout generation failed:', error);
      if (error.message?.includes('429') || error.status === 429) {
        toast.error('AI rate limit reached — try again shortly');
      } else if (error.message?.includes('402') || error.status === 402) {
        toast.error('AI credits exhausted');
      } else {
        toast.error('Layout generation failed');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [items, dieline, maxOverrun, qtyPerRoll, orderId]);

  /**
   * Apply selected layout — creates runs in database
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
   * Get production time estimate
   */
  const getProductionTime = useCallback((option: LayoutOption) => {
    return calculateProductionTime(option.runs);
  }, []);

  /**
   * Save selected layout to the order
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
   * Clear saved layout
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

  const summary = useMemo(() => {
    if (!selectedOption) return null;
    return {
      totalRuns: selectedOption.runs.length,
      totalMeters: selectedOption.total_meters,
      totalFrames: selectedOption.total_frames,
      wasteMeters: selectedOption.total_waste_meters,
      estimatedMinutes: calculateProductionTime(selectedOption.runs),
    };
  }, [selectedOption]);

  const canGenerate = useMemo(() => {
    return dieline !== null && items.length > 0;
  }, [dieline, items]);

  return {
    options,
    selectedOption,
    isGenerating,
    isApplying: isCreating,
    summary,
    canGenerate,
    isSaving,
    hasSavedLayout,
    maxOverrun,
    
    generateOptions,
    selectOption: setSelectedOption,
    applyLayout,
    getProductionTime,
    saveLayout,
    clearSavedLayout,
    setMaxOverrun,
  };
}
