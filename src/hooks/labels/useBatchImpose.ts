import { useState, useCallback } from 'react';
import { createImposition, type ImpositionRequest, type DielineConfig, type ImpositionSlot } from '@/services/labels/vpsApiService';
import { supabase } from '@/integrations/supabase/client';
import type { LabelRun, LabelItem, LabelDieline } from '@/types/labels';
import { toast } from 'sonner';

export interface BatchImposeProgress {
  current: number;
  total: number;
  currentRunNumber: number;
  status: 'idle' | 'imposing' | 'complete' | 'error';
  errors: { runNumber: number; error: string }[];
}

const initialProgress: BatchImposeProgress = {
  current: 0,
  total: 0,
  currentRunNumber: 0,
  status: 'idle',
  errors: [],
};

export function useBatchImpose(
  orderId: string,
  runs: LabelRun[],
  items: LabelItem[],
  dieline: LabelDieline | null | undefined
) {
  const [progress, setProgress] = useState<BatchImposeProgress>(initialProgress);
  const isImposing = progress.status === 'imposing';

  const impose = useCallback(async () => {
    if (!dieline || runs.length === 0) return;

    const plannedRuns = runs.filter(r => r.status === 'planned');
    if (plannedRuns.length === 0) {
      toast.info('No planned runs to impose');
      return;
    }

    setProgress({
      current: 0,
      total: plannedRuns.length,
      currentRunNumber: plannedRuns[0].run_number,
      status: 'imposing',
      errors: [],
    });

    const errors: { runNumber: number; error: string }[] = [];

    for (let i = 0; i < plannedRuns.length; i++) {
      const run = plannedRuns[i];

      setProgress(prev => ({
        ...prev,
        current: i,
        currentRunNumber: run.run_number,
      }));

      try {
        // Build slot assignments with pdf_url from items
        const slotAssignments: ImpositionSlot[] = (run.slot_assignments || []).map(slot => {
          const item = items.find(it => it.id === slot.item_id);
          return {
            slot: slot.slot,
            item_id: slot.item_id,
            quantity_in_slot: slot.quantity_in_slot,
            needs_rotation: slot.needs_rotation,
            pdf_url: item?.print_pdf_url || '',
          };
        });

        const dielineConfig: DielineConfig = {
          roll_width_mm: dieline.roll_width_mm,
          label_width_mm: dieline.label_width_mm,
          label_height_mm: dieline.label_height_mm,
          columns_across: dieline.columns_across,
          rows_around: dieline.rows_around,
          horizontal_gap_mm: dieline.horizontal_gap_mm,
          vertical_gap_mm: dieline.vertical_gap_mm,
          corner_radius_mm: dieline.corner_radius_mm ?? undefined,
        };

        const request: ImpositionRequest = {
          run_id: run.id,
          order_id: orderId,
          dieline: dielineConfig,
          slot_assignments: slotAssignments,
          include_dielines: true,
          meters_to_print: run.meters_to_print || 1,
        };

        await createImposition(request);

        // Update run status to approved
        await supabase
          .from('label_runs')
          .update({ status: 'approved' })
          .eq('id', run.id);

      } catch (err: any) {
        console.error(`Imposition failed for run ${run.run_number}:`, err);
        errors.push({ runNumber: run.run_number, error: err.message || 'Unknown error' });
      }
    }

    setProgress({
      current: plannedRuns.length,
      total: plannedRuns.length,
      currentRunNumber: plannedRuns[plannedRuns.length - 1].run_number,
      status: errors.length > 0 ? 'error' : 'complete',
      errors,
    });

    if (errors.length === 0) {
      toast.success(`All ${plannedRuns.length} runs imposed successfully`);
    } else {
      toast.error(`${errors.length} of ${plannedRuns.length} runs failed imposition`);
    }
  }, [orderId, runs, items, dieline]);

  const reset = useCallback(() => {
    setProgress(initialProgress);
  }, []);

  return { impose, isImposing, progress, reset };
}
