
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface ReworkStageQuantity {
  stageInstanceId: string;
  stageName: string;
  stageOrder: number;
  productionStageId: string;
  originalQuantity: number;
  reworkQuantity: number;
}

interface PartialReworkRequest {
  jobId: string;
  jobTableName: string;
  shortfallQty: number;
  originalQty: number;
  reason: string;
  targetStageOrder: number;
  stageQuantities: ReworkStageQuantity[];
}

interface PartialReworkResult {
  success: boolean;
  createdStageIds: string[];
  reworkPercentage: number;
}

export const usePartialRework = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();

  /**
   * Fetch all stages for a job from a target stage onward,
   * pre-calculating rework quantities based on shortfall percentage.
   */
  const calculateReworkStages = useCallback(async (
    jobId: string,
    jobTableName: string,
    originalQty: number,
    shortfallQty: number,
    targetStageOrder: number = 1
  ): Promise<ReworkStageQuantity[]> => {
    const { data: stages, error } = await supabase
      .from('job_stage_instances')
      .select(`
        id,
        stage_order,
        quantity,
        production_stage_id,
        production_stage:production_stages(name)
      `)
      .eq('job_id', jobId)
      .eq('job_table_name', jobTableName)
      .gte('stage_order', targetStageOrder)
      .order('stage_order', { ascending: true });

    if (error) {
      console.error('Error fetching stages for rework:', error);
      return [];
    }

    const percentage = (shortfallQty / originalQty) * 100;

    return (stages || []).map(stage => ({
      stageInstanceId: stage.id,
      stageName: (stage.production_stage as any)?.name || 'Unknown Stage',
      stageOrder: stage.stage_order,
      productionStageId: stage.production_stage_id,
      originalQuantity: stage.quantity || originalQty,
      reworkQuantity: Math.ceil((stage.quantity || originalQty) * (percentage / 100))
    }));
  }, []);

  /**
   * Execute partial rework: create new rework stage instances
   * with reduced quantities from a target stage onward.
   */
  const executePartialRework = useCallback(async (
    request: PartialReworkRequest
  ): Promise<PartialReworkResult> => {
    if (!user?.id) {
      toast.error('Authentication required');
      return { success: false, createdStageIds: [], reworkPercentage: 0 };
    }

    setIsProcessing(true);
    try {
      const reworkPercentage = (request.shortfallQty / request.originalQty) * 100;

      // Create new rework stage instances
      const newStages = request.stageQuantities.map(sq => ({
        job_id: request.jobId,
        job_table_name: request.jobTableName,
        production_stage_id: sq.productionStageId,
        stage_order: sq.stageOrder,
        quantity: sq.reworkQuantity,
        status: 'pending',
        is_rework: true,
        rework_count: 1,
        rework_reason: request.reason,
        notes: `Partial rework: ${request.shortfallQty} units (${reworkPercentage.toFixed(2)}%) - ${request.reason}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        job_order_in_stage: 0
      }));

      const { data: created, error: createError } = await supabase
        .from('job_stage_instances')
        .insert(newStages)
        .select('id');

      if (createError) throw createError;

      // Update job-level rework metadata
      await supabase
        .from('production_jobs')
        .update({
          rework_qty: request.shortfallQty,
          rework_percentage: reworkPercentage,
          rework_requested_at: new Date().toISOString(),
          rework_requested_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.jobId);

      const createdStageIds = (created || []).map(s => s.id);

      toast.success(
        `Partial rework created: ${request.shortfallQty} units across ${createdStageIds.length} stages`
      );

      return { success: true, createdStageIds, reworkPercentage };
    } catch (err) {
      console.error('Error executing partial rework:', err);
      toast.error('Failed to create partial rework');
      return { success: false, createdStageIds: [], reworkPercentage: 0 };
    } finally {
      setIsProcessing(false);
    }
  }, [user?.id]);

  /**
   * Schedule rework stages after creation.
   */
  const scheduleReworkStages = useCallback(async (
    stageIds: string[],
    schedulingOption: 'expedite' | 'tomorrow' | 'custom' | 'unscheduled',
    customDateTime?: Date,
    jobId?: string,
    expediteReason?: string
  ): Promise<boolean> => {
    if (!user?.id) return false;

    setIsProcessing(true);
    try {
      switch (schedulingOption) {
        case 'expedite': {
          if (!jobId) return false;
          const { error } = await supabase.rpc('expedite_job_factory_wide', {
            p_job_id: jobId,
            p_expedite_reason: expediteReason || 'Partial rework expedited'
          });
          if (error) throw error;
          toast.success('Rework stages expedited across all departments');
          break;
        }
        case 'tomorrow': {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(7, 0, 0, 0);

          const { error } = await supabase
            .from('job_stage_instances')
            .update({
              scheduled_start_at: tomorrow.toISOString(),
              updated_at: new Date().toISOString()
            })
            .in('id', stageIds);
          if (error) throw error;
          toast.success('Rework scheduled for tomorrow morning (07:00)');
          break;
        }
        case 'custom': {
          if (!customDateTime) return false;
          const { error } = await supabase
            .from('job_stage_instances')
            .update({
              scheduled_start_at: customDateTime.toISOString(),
              updated_at: new Date().toISOString()
            })
            .in('id', stageIds);
          if (error) throw error;
          toast.success(`Rework scheduled for ${customDateTime.toLocaleDateString()} ${customDateTime.toLocaleTimeString()}`);
          break;
        }
        case 'unscheduled':
          toast.info('Rework stages added to queue (unscheduled)');
          break;
      }
      return true;
    } catch (err) {
      console.error('Error scheduling rework stages:', err);
      toast.error('Failed to schedule rework stages');
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user?.id]);

  /**
   * Set payment hold on a job.
   */
  const setPaymentHold = useCallback(async (
    jobId: string,
    reason?: string
  ): Promise<boolean> => {
    if (!user?.id) return false;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('production_jobs')
        .update({
          payment_status: 'awaiting_payment',
          payment_hold_reason: reason || 'Awaiting payment',
          payment_held_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) throw error;
      toast.success('Job placed on payment hold');
      return true;
    } catch (err) {
      console.error('Error setting payment hold:', err);
      toast.error('Failed to set payment hold');
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user?.id]);

  /**
   * Release a job from payment hold.
   */
  const releasePaymentHold = useCallback(async (
    jobId: string
  ): Promise<boolean> => {
    if (!user?.id) return false;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('production_jobs')
        .update({
          payment_status: 'paid',
          payment_released_at: new Date().toISOString(),
          payment_released_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) throw error;
      toast.success('Job released for production');
      return true;
    } catch (err) {
      console.error('Error releasing payment hold:', err);
      toast.error('Failed to release payment hold');
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user?.id]);

  return {
    isProcessing,
    calculateReworkStages,
    executePartialRework,
    scheduleReworkStages,
    setPaymentHold,
    releasePaymentHold
  };
};
