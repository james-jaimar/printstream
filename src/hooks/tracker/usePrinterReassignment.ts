import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PrinterStage {
  id: string;
  name: string;
  color: string | null;
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

export const usePrinterReassignment = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [printerStages, setPrinterStages] = useState<PrinterStage[]>([]);
  const [pendingJobs, setPendingJobs] = useState<PendingPrintJob[]>([]);
  const [targetSpecs, setTargetSpecs] = useState<StageSpecification[]>([]);

  // Fetch all printing stages
  const fetchPrinterStages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('production_stages')
        .select('id, name, color')
        .ilike('name', '%printing%')
        .eq('is_active', true)
        .order('order_index');

      if (error) throw error;
      setPrinterStages(data || []);
      return data || [];
    } catch (error) {
      console.error('Error fetching printer stages:', error);
      toast.error('Failed to load printer stages');
      return [];
    }
  }, []);

  // Fetch pending jobs for a specific printer stage
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
        scheduled_start_at: item.scheduled_start_at
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

  // Fetch available stage specifications for target printer
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

  // Perform the bulk reassignment
  const reassignJobs = useCallback(async (params: ReassignmentParams): Promise<boolean> => {
    const { targetStageId, targetStageSpecId, stageInstanceIds } = params;
    
    if (stageInstanceIds.length === 0) {
      toast.error('No jobs selected');
      return false;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('job_stage_instances')
        .update({
          production_stage_id: targetStageId,
          stage_specification_id: targetStageSpecId,
          hp12000_paper_size_id: null, // Clear HP12000-specific field
          scheduled_start_at: null,    // Reset scheduling
          scheduled_end_at: null,
          schedule_status: 'pending',
          updated_at: new Date().toISOString()
        })
        .in('id', stageInstanceIds);

      if (error) throw error;

      toast.success(`Successfully moved ${stageInstanceIds.length} job(s) to new printer`);
      return true;
    } catch (error) {
      console.error('Error reassigning jobs:', error);
      toast.error('Failed to reassign jobs');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    printerStages,
    pendingJobs,
    targetSpecs,
    fetchPrinterStages,
    fetchPendingJobsForStage,
    fetchSpecsForStage,
    reassignJobs
  };
};
