import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DieCuttingMachine {
  id: string;
  name: string;
  machine_type: string;
  status: string;
  location: string | null;
  max_concurrent_jobs: number | null;
  notes: string | null;
  sort_order: number | null;
}

export interface DieCuttingJob {
  stage_instance_id: string;
  job_id: string;
  wo_no: string;
  customer: string | null;
  reference: string | null;
  category_name: string | null;
  category_color: string | null;
  due_date: string | null;
  qty: number | null;
  status: string;
  allocated_machine_id: string | null;
  started_at: string | null;
  started_by: string | null;
  stage_order: number;
  production_stage_id: string;
}

export const useDieCuttingMachines = () => {
  const [machines, setMachines] = useState<DieCuttingMachine[]>([]);
  const [jobs, setJobs] = useState<DieCuttingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all active die cutting machines
  const fetchMachines = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('die_cutting_machines')
        .select('*')
        .eq('status', 'active')
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;
      setMachines(data || []);
    } catch (err) {
      console.error('Error fetching die cutting machines:', err);
      setError('Failed to load machines');
    }
  }, []);

  // Fetch jobs where Die Cutting is the CURRENT stage (first pending/active stage)
  const fetchJobs = useCallback(async () => {
    try {
      // First get die cutting production stage IDs
      const { data: dieCuttingStages, error: stagesError } = await supabase
        .from('production_stages')
        .select('id')
        .ilike('name', '%die cut%')
        .eq('is_active', true);

      if (stagesError) throw stagesError;

      if (!dieCuttingStages || dieCuttingStages.length === 0) {
        setJobs([]);
        return;
      }

      const dieCuttingStageIds = dieCuttingStages.map(s => s.id);

      // Fetch ALL pending/active stages to determine current stage per job
      const { data: allPendingStages, error: pendingError } = await supabase
        .from('job_stage_instances')
        .select(`
          id,
          job_id,
          production_stage_id,
          status,
          allocated_machine_id,
          started_at,
          started_by,
          stage_order,
          quantity
        `)
        .eq('job_table_name', 'production_jobs')
        .in('status', ['pending', 'active', 'queued'])
        .order('stage_order', { ascending: true });

      if (pendingError) throw pendingError;

      if (!allPendingStages || allPendingStages.length === 0) {
        setJobs([]);
        return;
      }

      // Group by job_id and find the FIRST (current) stage for each job
      const jobCurrentStages = new Map<string, typeof allPendingStages[0]>();
      allPendingStages.forEach(stage => {
        // Only set if this job doesn't have a current stage yet (first one wins due to ordering)
        if (!jobCurrentStages.has(stage.job_id)) {
          jobCurrentStages.set(stage.job_id, stage);
        }
      });

      // Filter to only jobs where the current stage is a Die Cutting stage
      const dieCuttingCurrentStages = Array.from(jobCurrentStages.values())
        .filter(stage => dieCuttingStageIds.includes(stage.production_stage_id));

      if (dieCuttingCurrentStages.length === 0) {
        setJobs([]);
        return;
      }

      // Get job details for these jobs - only approved orders (proof_approved_at is not null)
      const jobIds = dieCuttingCurrentStages.map(s => s.job_id);
      const { data: productionJobs, error: jobsError } = await supabase
        .from('production_jobs')
        .select(`
          id,
          wo_no,
          customer,
          reference,
          due_date,
          qty,
          category_id,
          proof_approved_at,
          categories:category_id (
            name,
            color
          )
        `)
        .in('id', jobIds)
        .not('proof_approved_at', 'is', null);

      if (jobsError) throw jobsError;

      // Combine the data - only include jobs that passed the proof_approved_at filter
      const approvedJobIds = new Set(productionJobs?.map(j => j.id) || []);
      const filteredStages = dieCuttingCurrentStages.filter(s => approvedJobIds.has(s.job_id));
      const jobsMap = new Map(productionJobs?.map(j => [j.id, j]) || []);
      
      const combinedJobs: DieCuttingJob[] = filteredStages.map(si => {
        const job = jobsMap.get(si.job_id);
        const category = job?.categories as { name: string; color: string } | null;
        
        return {
          stage_instance_id: si.id,
          job_id: si.job_id,
          wo_no: job?.wo_no || 'Unknown',
          customer: job?.customer || null,
          reference: job?.reference || null,
          category_name: category?.name || null,
          category_color: category?.color || null,
          due_date: job?.due_date || null,
          qty: si.quantity || job?.qty || null,
          status: si.status,
          allocated_machine_id: si.allocated_machine_id,
          started_at: si.started_at,
          started_by: si.started_by,
          stage_order: si.stage_order,
          production_stage_id: si.production_stage_id
        };
      });

      setJobs(combinedJobs);
    } catch (err) {
      console.error('Error fetching die cutting jobs:', err);
      setError('Failed to load jobs');
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      await Promise.all([fetchMachines(), fetchJobs()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchMachines, fetchJobs]);

  // Assign a job to a machine
  const assignJobToMachine = useCallback(async (
    stageInstanceId: string, 
    machineId: string | null
  ): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({ 
          allocated_machine_id: machineId,
          updated_at: new Date().toISOString()
        })
        .eq('id', stageInstanceId);

      if (updateError) throw updateError;

      // Update local state
      setJobs(prev => prev.map(job => 
        job.stage_instance_id === stageInstanceId 
          ? { ...job, allocated_machine_id: machineId }
          : job
      ));

      const machineName = machineId 
        ? machines.find(m => m.id === machineId)?.name || 'machine'
        : 'Unassigned';
      
      toast.success(`Job moved to ${machineName}`);
      return true;
    } catch (err) {
      console.error('Error assigning job to machine:', err);
      toast.error('Failed to assign job to machine');
      return false;
    }
  }, [machines]);

  // Bulk assign jobs to a machine
  const bulkAssignJobs = useCallback(async (
    stageInstanceIds: string[], 
    machineId: string | null
  ): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({ 
          allocated_machine_id: machineId,
          updated_at: new Date().toISOString()
        })
        .in('id', stageInstanceIds);

      if (updateError) throw updateError;

      // Update local state
      setJobs(prev => prev.map(job => 
        stageInstanceIds.includes(job.stage_instance_id)
          ? { ...job, allocated_machine_id: machineId }
          : job
      ));

      const machineName = machineId 
        ? machines.find(m => m.id === machineId)?.name || 'machine'
        : 'Unassigned';
      
      toast.success(`${stageInstanceIds.length} jobs moved to ${machineName}`);
      return true;
    } catch (err) {
      console.error('Error bulk assigning jobs:', err);
      toast.error('Failed to move jobs');
      return false;
    }
  }, [machines]);

  // Start a job
  const startJob = useCallback(async (stageInstanceId: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({ 
          status: 'active',
          started_at: new Date().toISOString(),
          started_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', stageInstanceId);

      if (updateError) throw updateError;

      setJobs(prev => prev.map(job => 
        job.stage_instance_id === stageInstanceId 
          ? { ...job, status: 'active', started_at: new Date().toISOString() }
          : job
      ));

      toast.success('Job started');
      return true;
    } catch (err) {
      console.error('Error starting job:', err);
      toast.error('Failed to start job');
      return false;
    }
  }, []);

  // Complete a job
  const completeJob = useCallback(async (stageInstanceId: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', stageInstanceId);

      if (updateError) throw updateError;

      // Remove from local state since it's completed
      setJobs(prev => prev.filter(job => job.stage_instance_id !== stageInstanceId));

      toast.success('Job completed');
      return true;
    } catch (err) {
      console.error('Error completing job:', err);
      toast.error('Failed to complete job');
      return false;
    }
  }, []);

  // Refresh all data
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchMachines(), fetchJobs()]);
    setIsLoading(false);
  }, [fetchMachines, fetchJobs]);

  // Get jobs for a specific machine (or unassigned)
  const getJobsForMachine = useCallback((machineId: string | null) => {
    return jobs.filter(job => job.allocated_machine_id === machineId);
  }, [jobs]);

  // Get unassigned jobs
  const unassignedJobs = jobs.filter(job => job.allocated_machine_id === null);

  return {
    machines,
    jobs,
    unassignedJobs,
    isLoading,
    error,
    assignJobToMachine,
    bulkAssignJobs,
    startJob,
    completeJob,
    refreshData,
    getJobsForMachine
  };
};
