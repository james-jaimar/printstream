import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface BatchAwareProductionJob {
  id: string;
  wo_no: string;
  status: string;
  customer?: string | null;
  reference?: string | null;
  qty?: number | null;
  due_date?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  
  // Batch-specific fields
  batch_ready?: boolean;
  batch_category?: string | null;
  is_batch_master?: boolean;
  batch_name?: string | null;
  constituent_jobs_count?: number;
  batch_status?: string | null;
  batch_created_at?: string | null;
  
  // Workflow context
  current_stage_name?: string | null;
  current_stage_status?: string | null;
  workflow_progress?: number;
  total_stages?: number;
  
  // Additional metadata
  created_at?: string;
  updated_at?: string;
  highlighted?: boolean;
  has_custom_workflow?: boolean;
}

interface UseBatchAwareProductionJobsOptions {
  includeIndividualJobs?: boolean;
  includeBatchMasterJobs?: boolean;
  statusFilter?: string | null;
  batchStatusFilter?: string | null;
}

/**
 * Enhanced hook for fetching production jobs with comprehensive batch context
 * Provides unified view of individual jobs, batch master jobs, and batch relationships
 */
export const useBatchAwareProductionJobs = ({
  includeIndividualJobs = true,
  includeBatchMasterJobs = true,
  statusFilter = null,
  batchStatusFilter = null
}: UseBatchAwareProductionJobsOptions = {}) => {
  const { user } = useAuth();

  const {
    data: jobs = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [
      'batch-aware-production-jobs',
      user?.id,
      includeIndividualJobs,
      includeBatchMasterJobs,
      statusFilter,
      batchStatusFilter
    ],
    queryFn: async (): Promise<BatchAwareProductionJob[]> => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // Fetching batch-aware production jobs

      // Build the base query
      let query = supabase
        .from('production_jobs')
        .select(`
          id,
          wo_no,
          status,
          customer,
          reference,
          qty,
          due_date,
          category_id,
          batch_ready,
          batch_category,
          created_at,
          updated_at,
          highlighted,
          has_custom_workflow,
          categories (
            id,
            name,
            color
          )
        `);

      // Apply filters
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      // Filter by job type based on options
      const conditions = [];
      if (includeIndividualJobs && includeBatchMasterJobs) {
        // Include all jobs
      } else if (includeIndividualJobs) {
        conditions.push('not.wo_no.like.BATCH-%');
      } else if (includeBatchMasterJobs) {
        conditions.push('wo_no.like.BATCH-%');
      } else {
        // Neither selected, return empty
        return [];
      }

      // Apply conditions if any
      conditions.forEach(condition => {
        const [column, operator, value] = condition.split('.');
        if (operator === 'not' && value?.startsWith('wo_no.like.')) {
          query = query.not('wo_no', 'like', value.replace('wo_no.like.', ''));
        } else if (operator === 'like') {
          query = query.like(column, value);
        }
      });

      const { data: productionJobs, error: jobsError } = await query
        .order('created_at', { ascending: false });

      if (jobsError) {
        console.error('❌ Error fetching production jobs:', jobsError);
        throw jobsError;
      }

      if (!productionJobs || productionJobs.length === 0) {
        return [];
      }

      // Get job IDs for additional queries
      const jobIds = productionJobs.map(job => job.id);

      // Fetch batch references
      const { data: batchRefs, error: batchRefsError } = await supabase
        .from('batch_job_references')
        .select('production_job_id, batch_id, status')
        .in('production_job_id', jobIds);

      if (batchRefsError) {
        console.warn('⚠️ Error fetching batch references:', batchRefsError);
      }

      // Get unique batch IDs and fetch batch data separately
      const batchIds = batchRefs ? [...new Set(batchRefs.map(ref => ref.batch_id))] : [];
      let batchData = [];
      
      if (batchIds.length > 0) {
        const { data: batches, error: batchDataError } = await supabase
          .from('batches')
          .select('id, name, status, created_at, date_created')
          .in('id', batchIds);

        if (batchDataError) {
          console.warn('⚠️ Error fetching batch data:', batchDataError);
        } else {
          batchData = batches || [];
        }
      }

      // Fetch current stage information
      const { data: currentStages, error: stagesError } = await supabase
        .from('job_stage_instances')
        .select(`
          job_id,
          status,
          production_stages (
            name
          )
        `)
        .in('job_id', jobIds)
        .eq('job_table_name', 'production_jobs')
        .in('status', ['active', 'pending'])
        .order('stage_order', { ascending: true });

      if (stagesError) {
        console.warn('⚠️ Error fetching stage information:', stagesError);
      }

      // Fetch workflow progress
      const { data: stageProgress, error: progressError } = await supabase
        .from('job_stage_instances')
        .select(`
          job_id,
          status
        `)
        .in('job_id', jobIds)
        .eq('job_table_name', 'production_jobs');

      if (progressError) {
        console.warn('⚠️ Error fetching workflow progress:', progressError);
      }

      // Create lookup maps
      const batchLookup = new Map();
      const stageLookup = new Map();
      const progressLookup = new Map();

      // Process batch references
      if (batchRefs && batchData.length > 0) {
        // Create batch lookup by ID
        const batchInfoMap = new Map();
        batchData.forEach(batch => {
          batchInfoMap.set(batch.id, {
            name: batch.name,
            status: batch.status,
            createdAt: batch.created_at || batch.date_created
          });
        });

        // Map job IDs to batch info
        batchRefs.forEach(ref => {
          const batchInfo = batchInfoMap.get(ref.batch_id);
          if (batchInfo) {
            batchLookup.set(ref.production_job_id, {
              batchName: batchInfo.name,
              batchStatus: batchInfo.status,
              batchCreatedAt: batchInfo.createdAt,
              refStatus: ref.status
            });
          }
        });
      }

      // Process current stages
      if (currentStages) {
        currentStages.forEach(stage => {
          if (!stageLookup.has(stage.job_id)) {
            stageLookup.set(stage.job_id, {
              stageName: stage.production_stages?.name,
              stageStatus: stage.status
            });
          }
        });
      }

      // Process workflow progress
      if (stageProgress) {
        const progressMap = new Map();
        stageProgress.forEach(stage => {
          if (!progressMap.has(stage.job_id)) {
            progressMap.set(stage.job_id, { total: 0, completed: 0 });
          }
          const progress = progressMap.get(stage.job_id);
          progress.total++;
          if (stage.status === 'completed') {
            progress.completed++;
          }
        });

        progressMap.forEach((progress, jobId) => {
          progressLookup.set(jobId, {
            totalStages: progress.total,
            workflowProgress: progress.total > 0 
              ? Math.round((progress.completed / progress.total) * 100) 
              : 0
          });
        });
      }

      // For batch master jobs, get constituent job count using batched queries
      const batchMasterJobs = productionJobs.filter(job => 
        job.wo_no?.startsWith('BATCH-')
      );

      const constituentCountLookup = new Map();
      if (batchMasterJobs.length > 0) {
        const batchNames = batchMasterJobs
          .map(job => job.wo_no?.replace('BATCH-', ''))
          .filter(Boolean) as string[];

        if (batchNames.length > 0) {
          // Single batched query instead of N individual queries
          const { data: matchedBatches } = await supabase
            .from('batches')
            .select('id, name')
            .in('name', batchNames);

          if (matchedBatches && matchedBatches.length > 0) {
            const matchedBatchIds = matchedBatches.map(b => b.id);
            
            // Single query for all constituent refs
            const { data: allConstituentRefs } = await supabase
              .from('batch_job_references')
              .select('batch_id, production_job_id')
              .in('batch_id', matchedBatchIds)
              .eq('status', 'processing');

            // Build lookup: batch name -> count
            const batchNameToId = new Map(matchedBatches.map(b => [b.name, b.id]));
            const batchIdToCount = new Map<string, number>();
            
            if (allConstituentRefs) {
              allConstituentRefs.forEach(ref => {
                batchIdToCount.set(ref.batch_id, (batchIdToCount.get(ref.batch_id) || 0) + 1);
              });
            }

            // Map back to production job IDs
            batchMasterJobs.forEach(job => {
              const batchName = job.wo_no?.replace('BATCH-', '');
              if (batchName) {
                const batchId = batchNameToId.get(batchName);
                if (batchId) {
                  constituentCountLookup.set(job.id, batchIdToCount.get(batchId) || 0);
                }
              }
            });
          }
        }
      }

      // Combine all data
      const enrichedJobs: BatchAwareProductionJob[] = productionJobs.map(job => {
        const batchInfo = batchLookup.get(job.id);
        const stageInfo = stageLookup.get(job.id);
        const progressInfo = progressLookup.get(job.id);
        const constituentCount = constituentCountLookup.get(job.id);

        const isBatchMaster = job.wo_no?.startsWith('BATCH-') || false;

        return {
          id: job.id,
          wo_no: job.wo_no || '',
          status: job.status || 'Unknown',
          customer: job.customer,
          reference: job.reference,
          qty: job.qty,
          due_date: job.due_date,
          category_id: job.category_id,
          category_name: job.categories?.name,
          category_color: job.categories?.color,
          
          // Batch context
          batch_ready: job.batch_ready || false,
          batch_category: job.batch_category,
          is_batch_master: isBatchMaster,
          batch_name: isBatchMaster 
            ? job.wo_no?.replace('BATCH-', '') 
            : batchInfo?.batchName,
          constituent_jobs_count: constituentCount,
          batch_status: batchInfo?.batchStatus,
          batch_created_at: batchInfo?.batchCreatedAt,
          
          // Workflow context
          current_stage_name: stageInfo?.stageName,
          current_stage_status: stageInfo?.stageStatus,
          workflow_progress: progressInfo?.workflowProgress || 0,
          total_stages: progressInfo?.totalStages || 0,
          
          // Metadata
          created_at: job.created_at,
          updated_at: job.updated_at,
          highlighted: job.highlighted || false,
          has_custom_workflow: job.has_custom_workflow || false
        };
      });

      // Apply batch status filter if specified
      let filteredJobs = enrichedJobs;
      if (batchStatusFilter) {
        filteredJobs = enrichedJobs.filter(job => 
          job.batch_status === batchStatusFilter ||
          (batchStatusFilter === 'no_batch' && !job.batch_name)
        );
      }


      return filteredJobs;
    },
    enabled: !!user?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

  // Helper functions
  const getBatchMasterJobs = useCallback(() => {
    return jobs.filter(job => job.is_batch_master);
  }, [jobs]);

  const getIndividualJobs = useCallback(() => {
    return jobs.filter(job => !job.is_batch_master);
  }, [jobs]);

  const getBatchedJobs = useCallback(() => {
    return jobs.filter(job => job.batch_name && !job.is_batch_master);
  }, [jobs]);

  const getUnbatchedJobs = useCallback(() => {
    return jobs.filter(job => !job.batch_name && !job.is_batch_master);
  }, [jobs]);

  const getJobsByBatch = useCallback((batchName: string) => {
    return jobs.filter(job => job.batch_name === batchName);
  }, [jobs]);

  const getJobStats = useCallback(() => {
    return {
      total: jobs.length,
      batchMasters: getBatchMasterJobs().length,
      individualJobs: getIndividualJobs().length,
      batchedJobs: getBatchedJobs().length,
      unbatchedJobs: getUnbatchedJobs().length,
      statusBreakdown: jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }, [jobs, getBatchMasterJobs, getIndividualJobs, getBatchedJobs, getUnbatchedJobs]);

  // Update job status with batch awareness
  const updateJobStatus = useCallback(async (
    jobId: string, 
    newStatus: string,
    updateBatch: boolean = false
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('production_jobs')
        .update({ 
          status: newStatus, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', jobId);

      if (error) {
        console.error('❌ Error updating job status:', error);
        toast.error('Failed to update job status');
        return false;
      }

      // If this is a batch master job and updateBatch is true, update constituent jobs
      if (updateBatch) {
        const job = jobs.find(j => j.id === jobId);
        if (job?.is_batch_master && job.batch_name) {
          const { data: batch } = await supabase
            .from('batches')
            .select('id')
            .eq('name', job.batch_name)
            .single();

          if (batch) {
            const { data: constituentJobs } = await supabase
              .from('batch_job_references')
              .select('production_job_id')
              .eq('batch_id', batch.id);

            if (constituentJobs) {
              const updatePromises = constituentJobs.map(ref =>
                supabase
                  .from('production_jobs')
                  .update({ 
                    status: newStatus, 
                    updated_at: new Date().toISOString() 
                  })
                  .eq('id', ref.production_job_id)
              );

              await Promise.all(updatePromises);
            }
          }
        }
      }

      // Refresh data to reflect changes
      refetch();
      toast.success('Job status updated successfully');
      return true;
    } catch (err) {
      console.error('❌ Error updating job status:', err);
      toast.error('Failed to update job status');
      return false;
    }
  }, [jobs, refetch]);

  const refreshJobs = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    jobs,
    isLoading,
    error: error?.message || null,
    
    // Data accessors
    getBatchMasterJobs,
    getIndividualJobs,
    getBatchedJobs,
    getUnbatchedJobs,
    getJobsByBatch,
    getJobStats,
    
    // Actions
    updateJobStatus,
    refreshJobs,
    refetch
  };
};