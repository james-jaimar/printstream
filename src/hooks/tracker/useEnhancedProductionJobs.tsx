import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTabVisibility } from "@/hooks/useTabVisibility";
import { toast } from "sonner";
import { formatWONumber } from "@/utils/woNumberFormatter";
import { processJobsArray, RawJobData } from "./useAccessibleJobs/jobDataProcessor";

interface UseEnhancedProductionJobsOptions {
  fetchAllJobs?: boolean;
}

// OPTIMIZED: Specific columns instead of SELECT *
const JOBS_SELECT = `
  id, wo_no, customer, status, due_date, reference,
  created_at, updated_at, is_expedited, has_custom_workflow,
  manual_due_date, proof_approved_at, category_id, user_id,
  categories(id, name, description, color, sla_target_days)
`;

const STAGES_SELECT = `
  id, job_id, status, stage_order, started_at, completed_at,
  scheduled_start_at, estimated_duration_minutes, part_assignment,
  production_stage_id, job_table_name,
  production_stages(id, name, description, color, supports_parts)
`;

export const useEnhancedProductionJobs = (options: UseEnhancedProductionJobsOptions = {}) => {
  const { user, isLoading: authLoading } = useAuth();
  const { isVisible } = useTabVisibility();
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { fetchAllJobs = false } = options;
  
  const subscriptionRef = useRef<any>(null);
  const debouncedRefetchRef = useRef<NodeJS.Timeout | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      console.log("🔍 Fetching enhanced production jobs with optimized columns...", { fetchAllJobs, userId: user?.id });

      // OPTIMIZED: Build the query with specific columns
      let query = supabase
        .from('production_jobs')
        .select(JOBS_SELECT)
        .order('created_at', { ascending: false });

      // Only filter by user if fetchAllJobs is false
      if (!fetchAllJobs && user?.id) {
        query = query.eq('user_id', user.id);
      }

      const { data: jobsData, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
      }

      console.log("📊 Raw jobs data:", jobsData?.length || 0, "jobs", { fetchAllJobs });

      if (!Array.isArray(jobsData)) {
        console.error("Expected array but got:", jobsData);
        setJobs([]);
        setIsLoading(false);
        return;
      }

      // OPTIMIZED: Fetch job stage instances with specific columns
      const jobIds = jobsData.map(job => job.id);
      let stagesData: any[] = [];
      
      if (jobIds.length > 0) {
        const { data: stagesResult, error: stagesError } = await supabase
          .from('job_stage_instances')
          .select(STAGES_SELECT)
          .in('job_id', jobIds)
          .eq('job_table_name', 'production_jobs')
          .order('stage_order', { ascending: true });

        if (stagesError) {
          console.error("❌ Error fetching stages:", stagesError);
        } else {
          stagesData = stagesResult || [];
          console.log("📊 Job stage instances:", stagesData.length);
        }
      }

      // Process jobs with enhanced stage information
      const enhancedJobsData = jobsData.map(job => {
        const formattedWoNo = formatWONumber(job.wo_no);
        
        // Get stages for this job
        const jobStages = stagesData.filter(stage => stage.job_id === job.id);
        const hasWorkflow = jobStages.length > 0;
        
        // Find current active stage
        const activeStage = jobStages.find(s => s.status === 'active');
        const pendingStages = jobStages.filter(s => s.status === 'pending');
        const completedStages = jobStages.filter(s => s.status === 'completed');
        
        // CRITICAL FIX: Properly determine current stage
        let currentStage = job.status || 'Unknown';
        let currentStageId = null;
        
        if (activeStage) {
          currentStage = activeStage.production_stages?.name || 'Active Stage';
          currentStageId = activeStage.production_stage_id;
        } else if (pendingStages.length > 0) {
          const firstPending = pendingStages.sort((a, b) => a.stage_order - b.stage_order)[0];
          currentStage = firstPending.production_stages?.name || 'Pending Stage';
          currentStageId = firstPending.production_stage_id;
        } else if (hasWorkflow && completedStages.length === jobStages.length && jobStages.length > 0) {
          currentStage = 'Completed';
        } else if (!hasWorkflow) {
          currentStage = job.status || 'DTP';
        }
        
        // Calculate workflow progress
        const totalStages = jobStages.length;
        const workflowProgress = totalStages > 0 ? Math.round((completedStages.length / totalStages) * 100) : 0;
        
        // Create properly structured stages array
        const processedStages = jobStages.map(stage => ({
          ...stage,
          production_stage_id: stage.production_stage_id,
          stage_id: stage.production_stage_id,
          stage_name: stage.production_stages?.name || 'Unknown Stage',
          stage_color: stage.production_stages?.color || '#6B7280',
          status: stage.status
        }));

        // Convert to RawJobData format for the centralized processor
        const rawJobData: RawJobData = {
          ...job,
          id: job.id,
          job_id: job.id,
          wo_no: formattedWoNo,
          current_stage: currentStage,
          current_stage_id: currentStageId,
          current_stage_name: currentStage,
          workflow_progress: workflowProgress,
          total_stages: totalStages,
          completed_stages: completedStages.length,
          has_custom_workflow: job.has_custom_workflow,
          manual_due_date: job.manual_due_date,
          due_date: job.due_date,
          stages: processedStages,
          job_stage_instances: jobStages
        };

        return rawJobData;
      });

      // Use centralized processor to handle custom workflow dates consistently
      console.log("🔧 Processing enhanced jobs with centralized processor...");
      const processedJobs = processJobsArray(enhancedJobsData);

      // Convert back to enhanced format with additional fields
      const finalJobs = processedJobs.map((processedJob, index) => {
        const originalData = enhancedJobsData[index];
        
        return {
          ...processedJob,
          has_workflow: originalData.stages?.length > 0,
          stages: originalData.stages,
          job_stage_instances: originalData.job_stage_instances,
          category_id: processedJob.category_id || null,
          is_active: originalData.stages?.some((s: any) => s.status === 'active') || false,
          is_pending: !originalData.stages?.some((s: any) => s.status === 'active') && originalData.stages?.some((s: any) => s.status === 'pending') || false,
          is_completed: originalData.stages?.length > 0 && originalData.stages?.every((s: any) => s.status === 'completed') || false,
          stage_status: originalData.stages?.some((s: any) => s.status === 'active') ? 'active' : (originalData.stages?.some((s: any) => s.status === 'pending') ? 'pending' : 'unknown')
        };
      });

      console.log("✅ Enhanced production jobs processed:", finalJobs.length, "jobs");
      setJobs(finalJobs);
    } catch (err) {
      console.error('❌ Error fetching enhanced production jobs:', err);
      const errorMessage = err instanceof Error ? err.message : "Failed to load jobs";
      setError(errorMessage);
      toast.error("Failed to load production jobs");
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllJobs, user?.id]);

  // OPTIMIZED: Debounced refetch handler
  const debouncedRefetch = useCallback(() => {
    // Skip if tab is hidden
    if (!isVisible) {
      console.log('📡 useEnhancedProductionJobs: Skipping refetch (tab hidden)');
      return;
    }

    // Debounce: wait 3 seconds before refetching
    if (debouncedRefetchRef.current) {
      clearTimeout(debouncedRefetchRef.current);
    }

    debouncedRefetchRef.current = setTimeout(() => {
      console.log('📡 useEnhancedProductionJobs: Debounced refetch triggered');
      fetchJobs();
    }, 3000);
  }, [isVisible, fetchJobs]);

  const startStage = useCallback(async (jobId: string, stageId: string) => {
    try {
      console.log('Starting stage:', { jobId, stageId });
      
      const { error } = await supabase
        .from('job_stage_instances')
        .update({ 
          status: 'active',
          started_at: new Date().toISOString(),
          started_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', stageId)
        .eq('status', 'pending');

      if (error) throw error;

      toast.success("Stage started successfully");
      await fetchJobs();
      return true;
    } catch (err) {
      console.error('Error starting stage:', err);
      toast.error("Failed to start stage");
      return false;
    }
  }, [user?.id, fetchJobs]);

  const completeStage = useCallback(async (jobId: string, stageId: string) => {
    try {
      console.log('🔄 [useEnhancedProductionJobs] Completing stage:', { jobId, stageId });
      
      const { getStageInfoForProofCheck, triggerProofCompletionCalculation } = await import('./utils/proofStageUtils');
      const stageInfo = await getStageInfoForProofCheck(stageId);
      
      const { data: parallelCheck } = await supabase
        .from('job_stage_instances')
        .select('part_assignment')
        .eq('job_id', jobId)
        .eq('job_table_name', 'production_jobs')
        .neq('part_assignment', 'both');
      
      const hasParallelComponents = parallelCheck && parallelCheck.length > 0;
      
      let error;
      if (hasParallelComponents) {
        const result = await supabase.rpc('advance_parallel_job_stage' as any, {
          p_job_id: jobId,
          p_job_table_name: 'production_jobs',
          p_current_stage_id: stageId
        });
        error = result.error;
      } else {
        const result = await supabase.rpc('advance_job_stage', {
          p_job_id: jobId,
          p_job_table_name: 'production_jobs',
          p_current_stage_id: stageId
        });
        error = result.error;
      }

      if (error) throw error;

      if (stageInfo?.isProof && jobId) {
        await triggerProofCompletionCalculation(jobId, 'production_jobs');
      }

      toast.success("Stage completed successfully");
      await fetchJobs();
      return true;
    } catch (err) {
      console.error('❌ [useEnhancedProductionJobs] Error completing stage:', err);
      toast.error("Failed to complete stage");
      return false;
    }
  }, [fetchJobs]);

  const recordQRScan = useCallback(async (jobId: string, stageId: string, qrData?: any) => {
    try {
      console.log('Recording QR scan:', { jobId, stageId, qrData });
      
      const { error } = await supabase
        .from('job_stage_instances')
        .update({ 
          qr_scan_data: qrData || { scanned_at: new Date().toISOString() },
          updated_at: new Date().toISOString()
        })
        .eq('id', stageId);

      if (error) throw error;

      toast.success("QR scan recorded successfully");
      await fetchJobs();
      return true;
    } catch (err) {
      console.error('Error recording QR scan:', err);
      toast.error("Failed to record QR scan");
      return false;
    }
  }, [fetchJobs]);

  // Initial data load
  useEffect(() => {
    if (!authLoading) {
      fetchJobs();
    }
  }, [authLoading, fetchJobs]);

  // OPTIMIZED: Real-time subscription with visibility check and debouncing
  useEffect(() => {
    // Cleanup when tab hidden or component unmounts
    if (!isVisible) {
      if (subscriptionRef.current) {
        console.log("📡 useEnhancedProductionJobs: Removing subscription (tab hidden)");
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      if (debouncedRefetchRef.current) {
        clearTimeout(debouncedRefetchRef.current);
      }
      return;
    }

    // Don't create duplicate subscriptions
    if (subscriptionRef.current) return;

    console.log("📡 useEnhancedProductionJobs: Setting up real-time subscription");

    const channel = supabase
      .channel(`enhanced_production_jobs_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'production_jobs',
        },
        (payload) => {
          console.log('📡 Production jobs changed:', payload.eventType);
          debouncedRefetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_stage_instances',
        },
        (payload) => {
          console.log('📡 Job stage instances changed:', payload.eventType);
          debouncedRefetch();
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      console.log("📡 useEnhancedProductionJobs: Cleaning up subscription");
      if (debouncedRefetchRef.current) {
        clearTimeout(debouncedRefetchRef.current);
      }
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [isVisible, debouncedRefetch]);

  const refreshJobs = useCallback(() => {
    // Clear any pending debounced fetches for immediate refresh
    if (debouncedRefetchRef.current) {
      clearTimeout(debouncedRefetchRef.current);
    }
    fetchJobs();
  }, [fetchJobs]);

  return {
    jobs,
    isLoading: isLoading || authLoading,
    error,
    refreshJobs,
    startStage,
    completeStage,
    recordQRScan
  };
};
