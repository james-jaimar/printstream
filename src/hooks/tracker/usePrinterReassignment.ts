import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PrinterStage {
  id: string;
  name: string;
  color: string | null;
  size_class: string | null;
}

export interface PendingPrintJob {
  stage_instance_id: string;
  job_id: string;
  wo_no: string;
  customer: string | null;
  reference: string | null;
  quantity: number | null;
  due_date: string | null;
  stage_spec_name: string | null;
  stage_spec_id: string | null;
  scheduled_start_at: string | null;
  estimated_duration_minutes: number | null;
}

export interface StageSpecification {
  id: string;
  name: string;
  description: string | null;
}

export interface ReassignmentParams {
  sourceStageId: string;
  targetStageId: string;
  targetStageSpecId: string;
  stageInstanceIds: string[];
}

/**
 * Calculate quantity multiplier based on size class transition.
 * A2 → A3 = 2x (double sheets), A3 → A2 = 0.5x (halve sheets), same = 1x
 */
export const getQuantityMultiplier = (
  sourceSizeClass: string | null,
  targetSizeClass: string | null
): number => {
  if (!sourceSizeClass || !targetSizeClass) return 1;
  if (sourceSizeClass === targetSizeClass) return 1;
  if (sourceSizeClass === 'A2' && targetSizeClass === 'A3') return 2;
  if (sourceSizeClass === 'A3' && targetSizeClass === 'A2') return 0.5;
  return 1;
};

export const usePrinterReassignment = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [printerStages, setPrinterStages] = useState<PrinterStage[]>([]);
  const [pendingJobs, setPendingJobs] = useState<PendingPrintJob[]>([]);
  const [targetSpecs, setTargetSpecs] = useState<StageSpecification[]>([]);

  const fetchPrinterStages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('production_stages')
        .select('id, name, color, size_class')
        .ilike('name', '%printing%')
        .eq('is_active', true)
        .order('order_index');

      if (error) throw error;
      setPrinterStages((data as PrinterStage[]) || []);
      return (data as PrinterStage[]) || [];
    } catch (error) {
      console.error('Error fetching printer stages:', error);
      toast.error('Failed to load printer stages');
      return [];
    }
  }, []);

  const fetchPendingJobsForStage = useCallback(async (stageId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('job_stage_instances')
        .select(`
          id,
          job_id,
          quantity,
          scheduled_start_at,
          estimated_duration_minutes,
          stage_specification_id,
          stage_specifications (
            name
          ),
          production_jobs!fk_job_stage_instances_production_jobs (
            wo_no,
            customer,
            reference,
            due_date
          )
        `)
        .eq('production_stage_id', stageId)
        .in('status', ['pending', 'active'])
        .order('scheduled_start_at', { ascending: true, nullsFirst: false });

      if (error) throw error;

      const mappedJobs: PendingPrintJob[] = (data || []).map((item: any) => ({
        stage_instance_id: item.id,
        job_id: item.job_id,
        wo_no: item.production_jobs?.wo_no || 'Unknown',
        customer: item.production_jobs?.customer || null,
        reference: item.production_jobs?.reference || null,
        quantity: item.quantity,
        due_date: item.production_jobs?.due_date || null,
        stage_spec_name: item.stage_specifications?.name || null,
        stage_spec_id: item.stage_specification_id,
        scheduled_start_at: item.scheduled_start_at,
        estimated_duration_minutes: item.estimated_duration_minutes
      }));

      setPendingJobs(mappedJobs);
      return mappedJobs;
    } catch (error) {
      console.error('Error fetching pending jobs:', error);
      toast.error('Failed to load pending jobs');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSpecsForStage = useCallback(async (stageId: string) => {
    try {
      const { data, error } = await supabase
        .from('stage_specifications')
        .select('id, name, description')
        .eq('production_stage_id', stageId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setTargetSpecs(data || []);
      return data || [];
    } catch (error) {
      console.error('Error fetching stage specifications:', error);
      toast.error('Failed to load printer specifications');
      return [];
    }
  }, []);

  const reassignJobs = useCallback(async (
    params: ReassignmentParams,
    multiplier: number = 1
  ): Promise<boolean> => {
    const { targetStageId, targetStageSpecId, stageInstanceIds } = params;
    
    if (stageInstanceIds.length === 0) {
      toast.error('No jobs selected');
      return false;
    }

    setIsLoading(true);
    try {
      // If multiplier !== 1, update each job individually with adjusted quantity/duration
      if (multiplier !== 1) {
        for (const instanceId of stageInstanceIds) {
          const job = pendingJobs.find(j => j.stage_instance_id === instanceId);
          const adjustedQuantity = job?.quantity != null
            ? Math.ceil(job.quantity * multiplier)
            : null;
          const adjustedDuration = job?.estimated_duration_minutes != null
            ? Math.ceil(job.estimated_duration_minutes * multiplier)
            : null;

          const { error } = await supabase
            .from('job_stage_instances')
            .update({
              production_stage_id: targetStageId,
              stage_specification_id: targetStageSpecId,
              hp12000_paper_size_id: null,
              scheduled_start_at: null,
              scheduled_end_at: null,
              schedule_status: 'pending',
              ...(adjustedQuantity !== null && { quantity: adjustedQuantity }),
              ...(adjustedDuration !== null && { estimated_duration_minutes: adjustedDuration }),
              updated_at: new Date().toISOString()
            })
            .eq('id', instanceId);

          if (error) throw error;
        }
      } else {
        // Bulk update when no quantity change needed
        const { error } = await supabase
          .from('job_stage_instances')
          .update({
            production_stage_id: targetStageId,
            stage_specification_id: targetStageSpecId,
            hp12000_paper_size_id: null,
            scheduled_start_at: null,
            scheduled_end_at: null,
            schedule_status: 'pending',
            updated_at: new Date().toISOString()
          })
          .in('id', stageInstanceIds);

        if (error) throw error;
      }

      toast.success(`Successfully moved ${stageInstanceIds.length} job(s) to new printer`);

      // Auto-trigger reschedule
      try {
        await supabase.functions.invoke('simple-scheduler', {
          body: { commit: true, nuclear: true }
        });
        toast.success('Schedule rebuilt successfully');
      } catch (scheduleError) {
        console.error('Error triggering reschedule:', scheduleError);
        toast.warning('Jobs moved but auto-reschedule failed. Please reschedule manually.');
      }

      return true;
    } catch (error) {
      console.error('Error reassigning jobs:', error);
      toast.error('Failed to reassign jobs');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [pendingJobs]);

  return {
    isLoading,
    printerStages,
    pendingJobs,
    targetSpecs,
    fetchPrinterStages,
    fetchPendingJobsForStage,
    fetchSpecsForStage,
    reassignJobs,
    getQuantityMultiplier
  };
};
