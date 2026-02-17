import { useState, useCallback, useRef, useEffect } from 'react';
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
  completedRunIds: string[];
}

const initialProgress: BatchImposeProgress = {
  current: 0,
  total: 0,
  currentRunNumber: 0,
  status: 'idle',
  errors: [],
  completedRunIds: [],
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 min per run
const MAX_CONSECUTIVE_FAILURES = 2;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Poll a single run until it leaves 'imposing' status */
async function waitForRunCompletion(runId: string): Promise<'approved' | 'failed'> {
  const start = Date.now();

  while (Date.now() - start < MAX_POLL_DURATION_MS) {
    await delay(POLL_INTERVAL_MS);

    const { data } = await supabase
      .from('label_runs')
      .select('status')
      .eq('id', runId)
      .single();

    if (!data) continue;

    if (data.status === 'approved') return 'approved';
    if (data.status === 'planned') return 'failed'; // VPS reset it
  }

  return 'failed'; // timeout
}

export function useBatchImpose(
  orderId: string,
  runs: LabelRun[],
  items: LabelItem[],
  dieline: LabelDieline | null | undefined
) {
  const [progress, setProgress] = useState<BatchImposeProgress>(initialProgress);
  const isImposing = progress.status === 'imposing';
  const abortRef = useRef(false);

  const impose = useCallback(async () => {
    if (!dieline || runs.length === 0) return;

    const plannedRuns = runs.filter(r => r.status === 'planned');
    if (plannedRuns.length === 0) {
      toast.info('No planned runs to impose');
      return;
    }

    abortRef.current = false;

    setProgress({
      current: 0,
      total: plannedRuns.length,
      currentRunNumber: plannedRuns[0].run_number,
      status: 'imposing',
      errors: [],
      completedRunIds: [],
    });

    const errors: { runNumber: number; error: string }[] = [];
    const completedRunIds: string[] = [];
    let consecutiveFailures = 0;

    for (let i = 0; i < plannedRuns.length; i++) {
      if (abortRef.current) break;

      const run = plannedRuns[i];

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const remaining = plannedRuns.length - i;
        toast.error(`Aborting: ${remaining} runs skipped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        for (let j = i; j < plannedRuns.length; j++) {
          errors.push({ runNumber: plannedRuns[j].run_number, error: 'Skipped — aborted after consecutive failures' });
        }
        break;
      }

      // Update progress: starting this run
      setProgress(prev => ({
        ...prev,
        current: i,
        currentRunNumber: run.run_number,
      }));

      try {
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
          bleed_left_mm: dieline.bleed_left_mm ?? 0,
          bleed_right_mm: dieline.bleed_right_mm ?? 0,
          bleed_top_mm: dieline.bleed_top_mm ?? 0,
          bleed_bottom_mm: dieline.bleed_bottom_mm ?? 0,
        };

        const request: ImpositionRequest = {
          run_id: run.id,
          order_id: orderId,
          dieline: dielineConfig,
          slot_assignments: slotAssignments,
          include_dielines: true,
          meters_to_print: 0, // Single frame only — printer handles repetition
        };

        const result = await createImposition(request);

        // Wait for VPS to finish (poll until status changes from 'imposing')
        if (result.status === 'processing') {
          toast.info(`Run ${run.run_number} sent to VPS, waiting for completion...`);
          const outcome = await waitForRunCompletion(run.id);

          if (outcome === 'approved') {
            completedRunIds.push(run.id);
            consecutiveFailures = 0;
            toast.success(`Run ${run.run_number} imposed ✓ (${i + 1}/${plannedRuns.length})`);
          } else {
            errors.push({ runNumber: run.run_number, error: 'VPS processing failed or timed out' });
            consecutiveFailures++;
            toast.error(`Run ${run.run_number} failed`);
          }
        } else {
          // Completed synchronously
          completedRunIds.push(run.id);
          consecutiveFailures = 0;
          toast.success(`Run ${run.run_number} imposed ✓ (${i + 1}/${plannedRuns.length})`);
        }

      } catch (err: any) {
        console.error(`Imposition failed for run ${run.run_number}:`, err);
        errors.push({ runNumber: run.run_number, error: err.message || 'Unknown error' });
        consecutiveFailures++;
        toast.error(`Run ${run.run_number} failed: ${err.message}`);
      }

      // Update progress after each run
      setProgress(prev => ({
        ...prev,
        current: i + 1,
        errors: [...errors],
        completedRunIds: [...completedRunIds],
      }));
    }

    // Final state
    setProgress({
      current: plannedRuns.length,
      total: plannedRuns.length,
      currentRunNumber: plannedRuns[plannedRuns.length - 1].run_number,
      status: errors.length > 0 ? 'error' : 'complete',
      errors,
      completedRunIds,
    });

    if (errors.length === 0) {
      toast.success(`All ${plannedRuns.length} runs imposed successfully`);
    } else {
      toast.error(`${errors.length} of ${plannedRuns.length} runs failed`);
    }
  }, [orderId, runs, items, dieline]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setProgress(initialProgress);
  }, []);

  return { impose, isImposing, progress, reset };
}