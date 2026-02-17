import { useState, useCallback, useRef } from 'react';
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
const MAX_CONSECUTIVE_FAILURES = 999; // Effectively disabled — never abort early
const INVOCATION_TIMEOUT_MS = 30_000; // 30s client-side timeout for edge function

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Wrap a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/** Poll a single run until it leaves 'imposing' status */
async function waitForRunCompletion(runId: string): Promise<'approved' | 'failed'> {
  const start = Date.now();
  let pollCount = 0;

  while (Date.now() - start < MAX_POLL_DURATION_MS) {
    await delay(POLL_INTERVAL_MS);
    pollCount++;

    const { data } = await supabase
      .from('label_runs')
      .select('status')
      .eq('id', runId)
      .single();

    if (!data) {
      console.warn(`[BatchImpose] Poll #${pollCount} for ${runId}: no data returned`);
      continue;
    }

    console.log(`[BatchImpose] Poll #${pollCount} for ${runId}: status=${data.status}`);

    if (data.status === 'approved') return 'approved';
    if (data.status === 'planned') return 'failed'; // VPS reset it
  }

  console.error(`[BatchImpose] Poll timeout for ${runId} after ${pollCount} polls`);
  return 'failed'; // timeout
}

/** Persist error details on a failed run so they're visible in the UI */
async function persistRunError(runId: string, errorMessage: string) {
  try {
    await supabase
      .from('label_runs')
      .update({
        status: 'planned',
        ai_reasoning: `[IMPO ERROR] ${errorMessage}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);
    console.log(`[BatchImpose] Persisted error for run ${runId}: ${errorMessage}`);
  } catch (e) {
    console.error(`[BatchImpose] Failed to persist error for run ${runId}:`, e);
  }
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

  const impose = useCallback(async (forceAll = false) => {
    if (!dieline || runs.length === 0) return;

    let targetRuns: LabelRun[];
    if (forceAll) {
      const runsToReset = runs.filter(r => r.status !== 'planned');
      for (const run of runsToReset) {
        await supabase
          .from('label_runs')
          .update({ status: 'planned', imposed_pdf_url: null, imposed_pdf_with_dielines_url: null, updated_at: new Date().toISOString() })
          .eq('id', run.id);
      }
      targetRuns = runs;
    } else {
      targetRuns = runs.filter(r => r.status === 'planned');
    }

    if (targetRuns.length === 0) {
      toast.info('No runs to impose');
      return;
    }

    console.log(`[BatchImpose] Starting batch: ${targetRuns.length} runs targeted`);
    console.log(`[BatchImpose] Run IDs:`, targetRuns.map(r => `#${r.run_number} (${r.id})`));

    abortRef.current = false;

    setProgress({
      current: 0,
      total: targetRuns.length,
      currentRunNumber: targetRuns[0].run_number,
      status: 'imposing',
      errors: [],
      completedRunIds: [],
    });

    const errors: { runNumber: number; error: string }[] = [];
    const completedRunIds: string[] = [];
    let consecutiveFailures = 0;

    for (let i = 0; i < targetRuns.length; i++) {
      if (abortRef.current) {
        console.log(`[BatchImpose] Aborted by user at run ${i + 1}/${targetRuns.length}`);
        break;
      }

      const run = targetRuns[i];

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const remaining = targetRuns.length - i;
        console.error(`[BatchImpose] ABORT: ${remaining} runs skipped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        toast.error(`Aborting: ${remaining} runs skipped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        for (let j = i; j < targetRuns.length; j++) {
          errors.push({ runNumber: targetRuns[j].run_number, error: 'Skipped — aborted after consecutive failures' });
        }
        break;
      }

      console.log(`[BatchImpose] === Run ${i + 1}/${targetRuns.length}: #${run.run_number} (${run.id}) ===`);

      setProgress(prev => ({
        ...prev,
        current: i,
        currentRunNumber: run.run_number,
      }));

      try {
        const slotAssignments: ImpositionSlot[] = ((run.slot_assignments || []) as any[]).map(slot => {
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
          meters_to_print: 0,
        };

        console.log(`[BatchImpose] Invoking createImposition for run #${run.run_number}...`);
        const result = await withTimeout(
          createImposition(request),
          INVOCATION_TIMEOUT_MS,
          `Edge function invocation for run #${run.run_number}`
        );
        console.log(`[BatchImpose] createImposition response for run #${run.run_number}:`, JSON.stringify(result));

        if (result.status === 'processing') {
          console.log(`[BatchImpose] Run #${run.run_number} sent to VPS, polling for completion...`);
          const outcome = await waitForRunCompletion(run.id);
          console.log(`[BatchImpose] Poll outcome for run #${run.run_number}: ${outcome}`);

          if (outcome === 'approved') {
            completedRunIds.push(run.id);
            consecutiveFailures = 0;
            toast.success(`Run ${run.run_number} imposed ✓ (${i + 1}/${targetRuns.length})`);
          } else {
            const errMsg = 'VPS processing failed or timed out during polling';
            errors.push({ runNumber: run.run_number, error: errMsg });
            consecutiveFailures++;
            await persistRunError(run.id, errMsg);
            toast.error(`Run ${run.run_number} failed: ${errMsg}`);
          }
        } else {
          completedRunIds.push(run.id);
          consecutiveFailures = 0;
          console.log(`[BatchImpose] Run #${run.run_number} completed immediately`);
          toast.success(`Run ${run.run_number} imposed ✓ (${i + 1}/${targetRuns.length})`);
        }

      } catch (err: any) {
        const errMsg = err.message || 'Unknown error';
        console.error(`[BatchImpose] FAILED run #${run.run_number}:`, errMsg, err);
        errors.push({ runNumber: run.run_number, error: errMsg });
        consecutiveFailures++;
        await persistRunError(run.id, errMsg);
        toast.error(`Run ${run.run_number} failed: ${errMsg}`);
      }

      setProgress(prev => ({
        ...prev,
        current: i + 1,
        errors: [...errors],
        completedRunIds: [...completedRunIds],
      }));

      // Give VPS breathing room between runs
      if (i < targetRuns.length - 1) {
        console.log(`[BatchImpose] Waiting 3s before next run...`);
        await delay(3000);
      }
    }

    // Final state
    setProgress({
      current: targetRuns.length,
      total: targetRuns.length,
      currentRunNumber: targetRuns[targetRuns.length - 1].run_number,
      status: errors.length > 0 ? 'error' : 'complete',
      errors,
      completedRunIds,
    });

    console.log(`[BatchImpose] Batch complete: ${completedRunIds.length} succeeded, ${errors.length} failed`);
    if (errors.length > 0) {
      console.log(`[BatchImpose] Failed runs:`, errors);
    }

    if (errors.length === 0) {
      toast.success(`All ${targetRuns.length} runs imposed successfully`);
    } else {
      toast.error(`${errors.length} of ${targetRuns.length} runs failed`);
    }
  }, [orderId, runs, items, dieline]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setProgress(initialProgress);
  }, []);

  return { impose, isImposing, progress, reset };
}
