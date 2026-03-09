import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface ScheduledJobStage {
  id: string;
  job_id: string;
  job_table_name: string;
  production_stage_id: string;
  stage_name: string;
  stage_color: string;
  stage_order: number;
  status: 'pending' | 'active' | 'in_progress' | 'completed' | 'skipped' | 'on_hold' | 'changes_requested';
  queue_position?: number;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  scheduled_minutes?: number;
  estimated_duration_minutes?: number;
  schedule_status?: string;
  // Hold-related fields
  completion_percentage?: number;
  remaining_minutes?: number;
  hold_reason?: string;
  held_at?: string;
  // Job details
  wo_no: string;
  customer: string;
  due_date?: string;
  qty: number;
  category_name: string;
  category_color: string;
  // Readiness indicators
  is_ready_now: boolean;
  is_scheduled_later: boolean;
  is_waiting_for_dependencies: boolean;
  // Dependencies
  dependency_group?: string;
  part_assignment?: string;
  // Batch properties
  is_batch_master?: boolean;
  batch_name?: string;
  constituent_job_ids?: string[];
}

export type JobReadinessStatus = 'ready_now' | 'scheduled_later' | 'waiting_dependencies' | 'blocked';

interface UseScheduledJobsOptions {
  production_stage_id?: string;
  department_filter?: string;
  include_all_stages?: boolean;
}

export const useScheduledJobs = (options: UseScheduledJobsOptions = {}) => {
  const { user } = useAuth();
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJobStage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Destructure options to avoid dependency issues
  const { production_stage_id, department_filter, include_all_stages } = options;

  const fetchScheduledJobs = useCallback(async () => {
    if (!user?.id) return;

    // Skip fetch if no production_stage_id is provided (unless explicitly allowed)
    if (!production_stage_id && !include_all_stages) {
      console.log('⏸️ Skipping fetch - no production_stage_id selected and include_all_stages=false');
      setScheduledJobs([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log('🔄 Fetching scheduled jobs with options:', { production_stage_id, department_filter, include_all_stages });
      console.log('📊 Initial filter state - production_stage_id:', production_stage_id);

      // Query job_stage_instances with scheduling data and job details
      let query = supabase
        .from('job_stage_instances')
        .select(`
          id,
          job_id,
          job_table_name,
          production_stage_id,
          stage_order,
          status,
          quantity,
          queue_position,
          scheduled_start_at,
          scheduled_end_at,
          scheduled_minutes,
          estimated_duration_minutes,
          schedule_status,
          dependency_group,
          part_assignment,
          production_stages!inner (
            name,
            color
          )
        `)
        .eq('job_table_name', 'production_jobs')
        .in('status', ['pending', 'active', 'on_hold', 'in_progress', 'scheduled']);

      // Filter by production stage if specified
      if (production_stage_id) {
        console.log('🎯 Applying production_stage_id filter:', production_stage_id);
        query = query.eq('production_stage_id', production_stage_id);
      }

      // Add ordering: scheduled jobs first (by start time), then by queue position, then by stage order
      query = query.order('scheduled_start_at', { ascending: true, nullsFirst: false })
                   .order('queue_position', { ascending: true, nullsFirst: false })
                   .order('stage_order', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      console.log('📊 Raw job stage instances fetched:', data?.length || 0);

      // Get job details with enhanced error handling and debugging
      const jobIds = data?.map(stage => stage.job_id) || [];
      let jobDetailsMap = new Map();
      
      console.log('🔍 Fetching job details for job IDs:', jobIds);
      
      if (jobIds.length > 0) {
        const { data: jobsData, error: jobsError } = await supabase
          .from('production_jobs')
          .select(`
            id,
            wo_no,
            customer,
            due_date,
            qty,
            status,
            category_id,
            is_batch_master,
            batch_category,
            categories (
              name,
              color
            )
          `)
          .in('id', jobIds);

        if (jobsError) {
          console.error('❌ Error fetching job details:', jobsError);
          // Don't throw - allow partial data display with fallbacks
        } else if (jobsData) {
          console.log('✅ Fetched job details:', jobsData.length, 'jobs');
          jobsData.forEach(job => {
            console.log(`📋 Job mapping: ID=${job.id} -> WO=${job.wo_no}, Customer=${job.customer}, Qty=${job.qty}`);
            jobDetailsMap.set(job.id, job);
          });
          
          // Debug: Check for missing mappings
          jobIds.forEach(jobId => {
            if (!jobDetailsMap.has(jobId)) {
              console.warn(`⚠️ Missing job data for ID: ${jobId}`);
            }
          });
        }
      }

      // Process and enhance job data with readiness indicators
      const processedJobs: ScheduledJobStage[] = (data || []).map((stage: any) => {
        const jobData = jobDetailsMap.get(stage.job_id);
        const stageData = stage.production_stages;
        const categoryData = jobData?.categories;

        // Normalize status: treat 'in_progress' as 'active'
        const normalizedStatus = stage.status === 'in_progress' ? 'active' : stage.status;

        // Simplified readiness logic - operators can start any pending job
        let is_ready_now = false;
        let is_scheduled_later = false;
        let is_waiting_for_dependencies = false;

        if (normalizedStatus === 'active' || normalizedStatus === 'on_hold') {
          is_ready_now = true;
        } else if (normalizedStatus === 'pending') {
          if (stage.scheduled_start_at) {
            // All scheduled jobs are considered ready (operators can start anytime)
            is_ready_now = true;
          } else {
            // Truly unscheduled jobs (waiting for proof/dependencies)
            is_waiting_for_dependencies = true;
          }
        }

        return {
          id: stage.id,
          job_id: stage.job_id,
          job_table_name: stage.job_table_name,
          production_stage_id: stage.production_stage_id,
          stage_name: stageData?.name || 'Unknown Stage',
          stage_color: stageData?.color || '#6B7280',
          stage_order: stage.stage_order,
          status: normalizedStatus,
          queue_position: stage.queue_position,
          scheduled_start_at: stage.scheduled_start_at,
          scheduled_end_at: stage.scheduled_end_at,
          scheduled_minutes: stage.scheduled_minutes,
          estimated_duration_minutes: stage.estimated_duration_minutes,
          schedule_status: stage.schedule_status,
          dependency_group: stage.dependency_group,
          part_assignment: stage.part_assignment,
          // Job details - better fallbacks and debugging
          wo_no: (() => {
            const woNo = jobData?.wo_no;
            if (!woNo) {
              console.error(`❌ Missing wo_no for job ID: ${stage.job_id}, jobData:`, jobData);
              return `MISSING-${stage.job_id.substring(0, 8)}`;
            }
            return woNo;
          })(),
          customer: (() => {
            const customer = jobData?.customer;
            if (!customer) {
              console.error(`❌ Missing customer for job ID: ${stage.job_id}, jobData:`, jobData);
              return 'NO CUSTOMER DATA';
            }
            return customer;
          })(),
          due_date: jobData?.due_date,
          qty: (() => {
            // Use stage-specific quantity if available, fallback to job quantity
            const stageQty = stage.quantity;
            const jobQty = jobData?.qty;
            
            if (stageQty !== null && stageQty !== undefined) {
              return stageQty;
            }
            
            if (jobQty !== null && jobQty !== undefined) {
              console.warn(`⚠️ Using job qty fallback for stage ID: ${stage.id}, job: ${stage.job_id}`);
              return jobQty;
            }
            
            console.error(`❌ Missing qty for stage ID: ${stage.id}, job ID: ${stage.job_id}, jobData:`, jobData);
            return 0;
          })(),
          category_name: categoryData?.name || 'Uncategorized',
          category_color: categoryData?.color || '#6B7280',
          // Batch properties
          is_batch_master: jobData?.is_batch_master || false,
          batch_name: jobData?.batch_category,
          // Readiness indicators
          is_ready_now,
          is_scheduled_later,
          is_waiting_for_dependencies
        };
      });

      setScheduledJobs(processedJobs);
      setLastUpdate(new Date());

      console.log(`✅ Fetched ${processedJobs.length} scheduled job stages`);

    } catch (err) {
      console.error('❌ Error fetching scheduled jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load scheduled jobs');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, production_stage_id, department_filter, include_all_stages]);

  // Initial fetch
  useEffect(() => {
    fetchScheduledJobs();
  }, [fetchScheduledJobs]);

  // Real-time subscription for schedule updates with debounced fetching
  useEffect(() => {
    if (!user?.id) return;

    // Skip subscription if no production_stage_id (unless explicitly allowed)
    if (!production_stage_id && !include_all_stages) {
      console.log('⏸️ Skipping real-time subscription - no production_stage_id selected');
      return;
    }

    const channelName = production_stage_id 
      ? `scheduled-jobs-${production_stage_id}`
      : 'scheduled-jobs-all';
    
    const filterString = production_stage_id
      ? `job_table_name=eq.production_jobs,production_stage_id=eq.${production_stage_id}`
      : `job_table_name=eq.production_jobs`;

    console.log('📡 Setting up real-time subscription:', { channelName, filter: filterString });
    
    let debounceTimeout: NodeJS.Timeout;
    let messageCount = 0;
    
    const debouncedFetch = () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        console.log('🔄 Debounced fetch triggered by real-time update');
        fetchScheduledJobs();
      }, 500);
    };

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_stage_instances',
          filter: filterString
        },
        (payload) => {
          messageCount++;
          console.log(`🔄 Real-time update #${messageCount} received:`, payload.eventType);
          debouncedFetch();
        }
      )
      .subscribe();

    return () => {
      console.log(`🔌 Unsubscribing from ${channelName} (received ${messageCount} messages)`);
      clearTimeout(debounceTimeout);
      supabase.removeChannel(channel);
    };
  }, [user?.id, production_stage_id, fetchScheduledJobs]);

  // Group jobs by readiness status
  const jobsByReadiness = useMemo(() => {
    const ready = scheduledJobs.filter(job => job.is_ready_now);
    const scheduledLater = scheduledJobs.filter(job => job.is_scheduled_later);
    const waitingDependencies = scheduledJobs.filter(job => job.is_waiting_for_dependencies);
    
    return {
      ready_now: ready,
      scheduled_later: scheduledLater,
      waiting_dependencies: waitingDependencies
    };
  }, [scheduledJobs]);

  // Job actions - allow starting any pending job
  const startScheduledJob = useCallback(async (stageId: string): Promise<boolean> => {
    try {
      const job = scheduledJobs.find(j => j.id === stageId);
      if (!job) {
        toast.error('Job not found');
        return false;
      }

      if (job.status !== 'pending') {
        toast.error('Job must be pending to start');
        return false;
      }

      const { error } = await supabase
        .from('job_stage_instances')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
          started_by: user?.id
        })
        .eq('id', stageId);

      if (error) throw error;

      toast.success(`Started job ${job.wo_no} - ${job.stage_name}`);
      await fetchScheduledJobs();
      return true;
    } catch (error) {
      console.error('❌ Error starting scheduled job:', error);
      toast.error('Failed to start job');
      return false;
    }
  }, [scheduledJobs, user?.id, fetchScheduledJobs]);

  const completeScheduledJob = useCallback(async (stageId: string, notes?: string): Promise<boolean> => {
    try {
      const job = scheduledJobs.find(j => j.id === stageId);
      if (!job) {
        toast.error('Job not found');
        return false;
      }

      if (job.status !== 'active') {
        toast.error('Job must be active to complete');
        return false;
      }

      // First, try the RPC approach
      try {
        console.log('🔄 Attempting RPC completion for job:', job.wo_no);
        
        // Use appropriate completion function based on job type
        const { data: parallelCheck } = await supabase
          .from('job_stage_instances')
          .select('part_assignment')
          .eq('job_id', job.job_id)
          .eq('job_table_name', 'production_jobs')
          .neq('part_assignment', 'both')
          .limit(1);
        
        const hasParallelComponents = parallelCheck && parallelCheck.length > 0;
        
        let error;
        if (hasParallelComponents) {
          const result = await supabase.rpc('advance_parallel_job_stage' as any, {
            p_job_id: job.job_id,
            p_job_table_name: job.job_table_name,
            p_current_stage_id: job.production_stage_id,
            p_completed_by: user?.id,
            p_notes: notes
          });
          error = result.error;
        } else {
          const result = await supabase.rpc('advance_job_stage', {
            p_job_id: job.job_id,
            p_job_table_name: job.job_table_name,
            p_current_stage_id: job.production_stage_id,
            p_completed_by: user?.id,
            p_notes: notes
          });
          error = result.error;
        }

        if (error) {
          throw new Error(`RPC Error: ${error.message}`);
        }

        console.log('✅ RPC completion successful');
        toast.success(`Completed job ${job.wo_no} - ${job.stage_name}`);
        await fetchScheduledJobs();
        return true;

      } catch (rpcError) {
        const errorMsg = rpcError instanceof Error ? rpcError.message : String(rpcError);
        console.warn('⚠️ RPC completion failed, falling back to direct update:', errorMsg);
        
        // Check if it's the ambiguous column error or similar DB error
        if (errorMsg.includes('ambiguous') || errorMsg.includes('actual_duration_minutes') || errorMsg.includes('RPC Error')) {
          console.log('🔄 Using direct database update fallback (admin approach)');
          
          // Get stage start time to calculate actual duration
          const { data: stageData, error: stageError } = await supabase
            .from('job_stage_instances')
            .select(`
              id,
              started_at,
              job_id,
              job_table_name,
              production_stage:production_stages(name)
            `)
            .eq('id', stageId)
            .single();

          if (stageError) throw new Error(`Failed to get stage data: ${stageError.message}`);

          // Calculate actual duration in minutes
          let actualDurationMinutes = 1; // Default minimum
          if (stageData.started_at) {
            const startTime = new Date(stageData.started_at).getTime();
            const endTime = new Date().getTime();
            actualDurationMinutes = Math.max(1, Math.floor((endTime - startTime) / 60000));
          }

          const isProofStage = stageData?.production_stage?.name?.toLowerCase().includes('proof');
          
          // Direct database update (same approach as admin UI)
          const updateData = {
            status: 'completed',
            completed_at: new Date().toISOString(),
            completed_by: user?.id,
            notes: notes || null,
            actual_duration_minutes: actualDurationMinutes,
            updated_at: new Date().toISOString(),
            ...(isProofStage && { proof_approved_manually_at: new Date().toISOString() })
          };

          const { error: updateError } = await supabase
            .from('job_stage_instances')
            .update(updateData)
            .eq('id', stageId)
            .eq('status', 'active');

          if (updateError) {
            throw new Error(`Fallback update failed: ${updateError.message}`);
          }

          console.log('✅ Fallback completion successful');
          toast.success(`Completed ${job.wo_no} - ${job.stage_name} (took ${actualDurationMinutes} min)`);
          await fetchScheduledJobs();
          return true;
        } else {
          // Re-throw non-DB errors
          throw rpcError;
        }
      }

    } catch (error) {
      console.error('❌ Error completing scheduled job:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to complete job';
      toast.error(errorMessage);
      return false;
    }
  }, [scheduledJobs, user?.id, fetchScheduledJobs]);

  return {
    scheduledJobs,
    jobsByReadiness,
    isLoading,
    error,
    lastUpdate,
    // Actions
    startScheduledJob,
    completeScheduledJob,
    refreshJobs: fetchScheduledJobs
  };
};