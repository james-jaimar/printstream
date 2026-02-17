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
  /** Run IDs currently being processed async by VPS */
  pendingRunIds: string[];
}

const initialProgress: BatchImposeProgress = {
  current: 0,
  total: 0,
  currentRunNumber: 0,
  status: 'idle',
  errors: [],
  pendingRunIds: [],
};

const DELAY_BETWEEN_RUNS_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 2;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes max wait

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function useBatchImpose(
  orderId: string,
  runs: LabelRun[],
  items: LabelItem[],
  dieline: LabelDieline | null | undefined
) {
  const [progress, setProgress] = useState<BatchImposeProgress>(initialProgress);
  const isImposing = progress.status === 'imposing';
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((pendingRunIds: string[], plannedRuns: LabelRun[], errors: { runNumber: number; error: string }[]) => {
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      // Timeout check
      if (Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS) {
        stopPolling();
        setProgress(prev => ({
          ...prev,
          status: 'error',
          errors: [...prev.errors, ...prev.pendingRunIds.map(id => {
            const run = plannedRuns.find(r => r.id === id);
            return { runNumber: run?.run_number || 0, error: 'Timed out waiting for VPS' };
          })],
          pendingRunIds: [],
        }));
        toast.error('Some runs timed out waiting for VPS processing');
        return;
      }

      // Check status of pending runs
      const { data: runStatuses } = await supabase
        .from('label_runs')
        .select('id, status, run_number, frames_count, meters_to_print')
        .in('id', pendingRunIds);

      if (!runStatuses) return;

      const stillPending: string[] = [];
      const newErrors: { runNumber: number; error: string }[] = [];
      let completedCount = 0;

      for (const run of runStatuses) {
        if (run.status === 'approved') {
          completedCount++;
        } else if (run.status === 'imposing') {
          stillPending.push(run.id);
        } else if (run.status === 'planned') {
          // VPS failed and edge function reset status
          newErrors.push({ runNumber: run.run_number, error: 'VPS processing failed' });
        }
      }

      const allErrors = [...errors, ...newErrors];

      if (stillPending.length === 0) {
        // All done
        stopPolling();
        const totalCompleted = plannedRuns.length - allErrors.length;
        setProgress({
          current: plannedRuns.length,
          total: plannedRuns.length,
          currentRunNumber: plannedRuns[plannedRuns.length - 1].run_number,
          status: allErrors.length > 0 ? 'error' : 'complete',
          errors: allErrors,
          pendingRunIds: [],
        });

        if (allErrors.length === 0) {
          toast.success(`All ${plannedRuns.length} runs imposed successfully`);
        } else {
          toast.error(`${allErrors.length} of ${plannedRuns.length} runs failed imposition`);
        }
      } else {
        setProgress(prev => ({
          ...prev,
          pendingRunIds: stillPending,
          errors: allErrors,
        }));
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

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
      pendingRunIds: [],
    });

    const errors: { runNumber: number; error: string }[] = [];
    const pendingRunIds: string[] = [];
    let consecutiveFailures = 0;

    for (let i = 0; i < plannedRuns.length; i++) {
      const run = plannedRuns[i];

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const remaining = plannedRuns.length - i;
        toast.error(`Aborting: ${remaining} runs skipped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. VPS may be down.`);
        for (let j = i; j < plannedRuns.length; j++) {
          errors.push({ runNumber: plannedRuns[j].run_number, error: 'Skipped — aborted after consecutive failures' });
        }
        break;
      }

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
        };

        const request: ImpositionRequest = {
          run_id: run.id,
          order_id: orderId,
          dieline: dielineConfig,
          slot_assignments: slotAssignments,
          include_dielines: true,
          meters_to_print: run.meters_to_print || 1,
        };

        const result = await createImposition(request);

        // If response indicates async processing, track it
        if (result.status === 'processing') {
          pendingRunIds.push(run.id);
        }
        // If it completed synchronously (small job), it's already updated in DB

        consecutiveFailures = 0;

      } catch (err: any) {
        console.error(`Imposition failed for run ${run.run_number}:`, err);
        const errorMsg = err.message || 'Unknown error';
        errors.push({ runNumber: run.run_number, error: errorMsg });
        consecutiveFailures++;
      }

      // Delay between runs to let VPS clear memory
      if (i < plannedRuns.length - 1) {
        await delay(DELAY_BETWEEN_RUNS_MS);
      }
    }

    // If there are pending async runs, start polling
    if (pendingRunIds.length > 0) {
      setProgress(prev => ({
        ...prev,
        current: plannedRuns.length,
        currentRunNumber: plannedRuns[plannedRuns.length - 1].run_number,
        pendingRunIds,
        errors,
      }));
      startPolling(pendingRunIds, plannedRuns, errors);
    } else {
      // All completed synchronously or failed
      setProgress({
        current: plannedRuns.length,
        total: plannedRuns.length,
        currentRunNumber: plannedRuns[plannedRuns.length - 1].run_number,
        status: errors.length > 0 ? 'error' : 'complete',
        errors,
        pendingRunIds: [],
      });

      if (errors.length === 0) {
        toast.success(`All ${plannedRuns.length} runs imposed successfully`);
      } else {
        toast.error(`${errors.length} of ${plannedRuns.length} runs failed imposition`);
      }
    }
  }, [orderId, runs, items, dieline, startPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setProgress(initialProgress);
  }, [stopPolling]);

  return { impose, isImposing, progress, reset };
}
