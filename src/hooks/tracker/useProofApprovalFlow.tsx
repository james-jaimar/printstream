// src/hooks/tracker/useProofApprovalFlow.tsx - COMPLETE REPLACEMENT

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scheduleJobs } from "@/utils/scheduler";
import { toast } from "sonner";

/**
 * Hook for handling the proof approval flow and triggering queue-based due date calculations
 */
export const useProofApprovalFlow = () => {
  /**
   * Trigger queue-based scheduling after proof approval
   */
  const triggerQueueBasedCalculation = useCallback(async (jobId: string) => {
    try {
      console.log(`🎯 Triggering scheduling for job ${jobId} after proof approval`);

      // Force reschedule this specific job to clear any stale scheduling data
      // This appends to existing schedule tails without disrupting other jobs
      const result = await scheduleJobs([jobId], true);

      if (!result) {
        console.error("Error triggering scheduler: No result returned");
        toast.error("Failed to schedule job after proof approval");
        return false;
      }

      console.log(`✅ Job scheduled successfully:`, result);
      toast.success("Job added to production schedule");
      return true;
    } catch (error) {
      console.error("Error in triggerQueueBasedCalculation:", error);
      toast.error("Failed to schedule job");
      return false;
    }
  }, []);

  /**
   * Complete proof stage AND explicitly trigger scheduler (matching online approval pattern)
   */
  const completeProofStage = useCallback(async (jobId: string, stageId: string) => {
    try {
      console.log(`📋 [DTP MANUAL] Completing proof stage for job ${jobId}`);

      // STEP 1: Complete the proof stage
      const { error: completeError } = await supabase
        .from("job_stage_instances")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by: (await supabase.auth.getUser()).data.user?.id,
          proof_approved_manually_at: new Date().toISOString(),
        })
        .eq("id", stageId);

      if (completeError) {
        throw completeError;
      }

      // Invalidate all active proof links so reminder emails stop
      const { error: proofLinkError } = await supabase
        .from('proof_links')
        .update({
          is_used: true,
          invalidated_at: new Date().toISOString(),
          invalidated_by: (await supabase.auth.getUser()).data.user?.id || null
        })
        .eq('job_id', jobId)
        .eq('is_used', false);

      if (proofLinkError) {
        console.warn('⚠️ [DTP MANUAL] Failed to invalidate proof links:', proofLinkError);
      } else {
        console.log(`✅ [DTP MANUAL] Proof links invalidated for job ${jobId}`);
      }

      console.log(`✅ [DTP MANUAL] Proof stage completed for job ${jobId}`);

      // STEP 2: Explicitly call scheduler to append job (matching online approval pattern)
      console.log(`🚀 [DTP MANUAL] Calling scheduler_append_jobs for job ${jobId}`);

      const { error: scheduleError } = await supabase.rpc("scheduler_append_jobs", {
        p_job_ids: [jobId],
        p_only_if_unset: true,
      });

      if (scheduleError) {
        console.error("⚠️ [DTP MANUAL] Failed to append to schedule:", scheduleError);
        toast.error("Proof approved but scheduling failed - please reschedule manually");
        return false;
      }

      console.log(`✅ [DTP MANUAL] Job ${jobId} appended to production schedule`);
      toast.success("Proof approved - job added to production schedule");
      return true;
    } catch (error) {
      console.error("❌ [DTP MANUAL] Error completing proof stage:", error);
      toast.error("Failed to complete proof stage");
      return false;
    }
  }, []);

  /**
   * Trigger 3 AM recalculation for all jobs
   */
  const trigger3amRecalculation = useCallback(async () => {
    try {
      console.log(`🌅 Triggering 3 AM recalculation...`);

      const { data, error } = await supabase.functions.invoke("calculate-due-dates", {
        body: {
          priority: "low",
          triggerReason: "3am_recalculation",
        },
      });

      if (error) {
        console.error("Error in 3 AM recalculation:", error);
        return false;
      }

      console.log(`✅ 3 AM recalculation completed:`, data);
      return true;
    } catch (error) {
      console.error("Error in trigger3amRecalculation:", error);
      return false;
    }
  }, []);

  return {
    triggerQueueBasedCalculation,
    completeProofStage,
    trigger3amRecalculation,
  };
};
