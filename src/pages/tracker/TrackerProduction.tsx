import React, { useState, useMemo, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccessibleJobs } from "@/hooks/tracker/useAccessibleJobs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useJobStageInstancesMap } from "@/hooks/tracker/useJobStageInstancesMap";
import { getJobWorkflowStages, shouldJobAppearInWorkflowStage } from "@/utils/productionWorkflowUtils";
import { ProductionHeader } from "@/components/tracker/production/ProductionHeader";
import { ProductionStats } from "@/components/tracker/production/ProductionStats";
import { ProductionSorting } from "@/components/tracker/production/ProductionSorting";
import { CategoryInfoBanner } from "@/components/tracker/production/CategoryInfoBanner";
import { ProductionJobsView } from "@/components/tracker/production/ProductionJobsView";
import { DynamicProductionSidebar } from "@/components/tracker/production/DynamicProductionSidebar";
import { MasterOrderModal } from "@/components/tracker/modals/MasterOrderModal";
import { TrackerErrorBoundary } from "@/components/tracker/error-boundaries/TrackerErrorBoundary";
import { DataLoadingFallback } from "@/components/tracker/error-boundaries/DataLoadingFallback";
import { RefreshIndicator } from "@/components/tracker/RefreshIndicator";
import JobPartAssignmentManager from "@/components/jobs/JobPartAssignmentManager";
// Removed complex workflow utilities - using direct stage fields instead
import type { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";

interface TrackerProductionContext {
  activeTab: string;
  filters: any;
  selectedStageId?: string;
  onStageSelect?: (stageId: string | null) => void;
  onFilterChange?: (filters: any) => void;
  setSidebarData?: (data: any) => void;
}

const TrackerProduction = () => {
  const context = useOutletContext<TrackerProductionContext>();
  const isMobile = useIsMobile();
  
  // Cache key to force fresh data fetching on mount
  const [cacheKey] = useState(() => Date.now());
  
  const { 
    jobs, 
    isLoading, 
    error,
    startJob,
    completeJob,
    refreshJobs,
    invalidateCache
  } = useAccessibleJobs({
    permissionType: 'manage'
  });

  const [sortBy, setSortBy] = useState<'wo_no' | 'due_date'>('wo_no');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedStageName, setSelectedStageName] = useState<string | null>(null);
  
  const [selectedJob, setSelectedJob] = useState<AccessibleJob | null>(null);
  const [partAssignmentJob, setPartAssignmentJob] = useState<AccessibleJob | null>(null);
  const [lastUpdate] = useState<Date>(new Date());

  // Direct query to job_stage_instances for accurate stage counts
  // Shows each job ONLY in its CURRENT stage (lowest order pending/active stage)
  const { data: stageCounts } = useQuery({
    queryKey: ['production-stage-counts', cacheKey],
    queryFn: async () => {
      // Step 1: Get all active (non-completed/cancelled) job IDs
      const { data: activeJobs, error: activeError } = await supabase
        .from('production_jobs')
        .select('id')
        .not('status', 'in', '("Completed","Cancelled")');
      
      if (activeError) throw activeError;
      
      const activeJobIds = new Set((activeJobs || []).map(j => j.id));
      
      if (activeJobIds.size === 0) {
        return new Map();
      }
      
      // Step 2: Get all pending/active stage instances with order_index
      const { data, error } = await supabase
        .from('job_stage_instances')
        .select(`
          job_id,
          production_stage_id,
          status,
          stage_order,
          production_stages!inner(id, name, color, order_index)
        `)
        .eq('job_table_name', 'production_jobs')
        .in('status', ['pending', 'active', 'scheduled', 'held']);
      
      if (error) throw error;
      
      // Step 3: For each job, find its CURRENT stage (lowest order pending/active stage)
      const jobCurrentStage = new Map<string, {
        stage_id: string;
        stage_name: string;
        stage_color: string;
        order_index: number;
      }>();
      
      data?.forEach((instance: any) => {
        if (!activeJobIds.has(instance.job_id)) return;
        
        const stage = instance.production_stages;
        const stageOrder = instance.stage_order ?? stage.order_index ?? 999;
        const existing = jobCurrentStage.get(instance.job_id);
        
        // Keep only the lowest order stage per job (that's the current stage)
        if (!existing || stageOrder < existing.order_index) {
          jobCurrentStage.set(instance.job_id, {
            stage_id: instance.production_stage_id,
            stage_name: stage.name,
            stage_color: stage.color || '#6B7280',
            order_index: stageOrder
          });
        }
      });
      
      // Step 4: Aggregate counts by stage (each job counted only once)
      const counts = new Map<string, { 
        stage_id: string; 
        stage_name: string; 
        stage_color: string; 
        order_index: number;
        count: number 
      }>();
      
      jobCurrentStage.forEach((currentStage) => {
        const current = counts.get(currentStage.stage_id) || { 
          stage_id: currentStage.stage_id,
          stage_name: currentStage.stage_name,
          stage_color: currentStage.stage_color,
          order_index: currentStage.order_index,
          count: 0 
        };
        current.count++;
        counts.set(currentStage.stage_id, current);
      });
      
      return counts;
    },
    staleTime: 30000,
  });

  // Optimized single-query approach: fetch all stages for jobs in the selected stage
  // Eliminates query waterfall for instant parallel processing display
  const { data: jobStageInstancesMap } = useJobStageInstancesMap(
    [], // Empty array when using filterByStageId
    !!selectedStageId, // Only fetch when a specific stage is selected
    cacheKey,
    selectedStageId // Filter by stage in the query itself
  );

  // Enhance jobs with parallel stage data when available
  const enhancedJobs = useMemo(() => {
    if (!jobStageInstancesMap || jobStageInstancesMap.size === 0) {
      return jobs;
    }

    return jobs.map(job => {
      const stageInstances = jobStageInstancesMap.get(job.job_id);
      if (!stageInstances) return job;

      const workflowStages = getJobWorkflowStages(stageInstances, job.job_id);
      
      return {
        ...job,
        parallel_stages: workflowStages
      };
    });
  }, [jobs, jobStageInstancesMap]);

  // Build map of jobs by stage (including parallel stages)
  const jobsByStage = useMemo(() => {
    const map = new Map<string, AccessibleJob[]>();
    
    enhancedJobs.forEach(job => {
      // If job has parallel stages computed, use them
      if (job.parallel_stages && job.parallel_stages.length > 0) {
        job.parallel_stages.forEach(parallelStage => {
          const stageJobs = map.get(parallelStage.stage_id) || [];
          stageJobs.push(job);
          map.set(parallelStage.stage_id, stageJobs);
        });
      } else {
        // Fallback: use current stage only
        if (job.current_stage_id) {
          const stageJobs = map.get(job.current_stage_id) || [];
          stageJobs.push(job);
          map.set(job.current_stage_id, stageJobs);
        }
      }
    });
    
    return map;
  }, [enhancedJobs]);

  // Filter jobs based on selected stage - only show jobs where this is their CURRENT stage
  const filteredJobs = useMemo(() => {
    if (!selectedStageId) return enhancedJobs;
    
    return enhancedJobs.filter(job => {
      // If job has parallel stages, find the current stage (lowest order pending/active)
      if (job.parallel_stages && job.parallel_stages.length > 0) {
        // Filter to only pending/active stages
        const pendingStages = job.parallel_stages.filter(
          s => ['pending', 'active', 'scheduled', 'held'].includes(s.stage_status || '')
        );
        
        if (pendingStages.length === 0) return false;
        
        // Sort by stage_order to find the current (lowest order) stage
        const sortedStages = [...pendingStages].sort(
          (a, b) => (a.stage_order || 0) - (b.stage_order || 0)
        );
        
        // Current stage is the lowest order pending stage
        const currentStage = sortedStages[0];
        return currentStage.stage_id === selectedStageId;
      }
      
      // Fallback: use current_stage_id directly
      return job.current_stage_id === selectedStageId;
    });
  }, [enhancedJobs, selectedStageId]);
  // Enhanced sorting with batch processing awareness
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      let aValue, bValue;
      
      if (sortBy === 'wo_no') {
        aValue = a.wo_no || '';
        bValue = b.wo_no || '';
        const comparison = aValue.localeCompare(bValue);
        return sortOrder === 'asc' ? comparison : -comparison;
      } else if (sortBy === 'due_date') {
        aValue = a.due_date ? new Date(a.due_date).getTime() : 0;
        bValue = b.due_date ? new Date(b.due_date).getTime() : 0;
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });
  }, [filteredJobs, sortBy, sortOrder]);

  const jobsWithoutCategory = useMemo(() => {
    return enhancedJobs.filter(job => !job.category_id);
  }, [enhancedJobs]);

  // Build consolidated stages from direct stage counts query
  const consolidatedStages = useMemo(() => {
    // Primary: Use direct stage counts from job_stage_instances query
    if (stageCounts && stageCounts.size > 0) {
      return Array.from(stageCounts.values())
        .filter(stage => stage.count > 0)
        .map(stage => ({
          stage_id: stage.stage_id,
          stage_name: stage.stage_name,
          stage_color: stage.stage_color,
          order_index: stage.order_index,
          job_count: stage.count
        }))
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    }
    
    // Fallback: Build from jobsByStage if query hasn't loaded yet
    const fallbackCounts = new Map<string, { 
      stage_id: string; 
      stage_name: string; 
      stage_color: string; 
      job_count: number 
    }>();
    
    jobsByStage.forEach((stageJobs, stageId) => {
      if (stageJobs.length === 0) return;
      
      let stageName = null;
      let stageColor = null;
      
      for (const job of stageJobs) {
        if (job.parallel_stages && job.parallel_stages.length > 0) {
          const matchingParallelStage = job.parallel_stages.find(
            ps => ps.stage_id === stageId
          );
          if (matchingParallelStage) {
            stageName = matchingParallelStage.stage_name;
            stageColor = matchingParallelStage.stage_color;
            break;
          }
        }
        if (job.current_stage_id === stageId && job.current_stage_name) {
          stageName = job.current_stage_name;
          stageColor = job.current_stage_color;
          break;
        }
      }
      
      if (stageName) {
        fallbackCounts.set(stageId, {
          stage_id: stageId,
          stage_name: stageName,
          stage_color: stageColor || '#6B7280',
          job_count: stageJobs.length
        });
      }
    });
    
    return Array.from(fallbackCounts.values()).sort((a, b) => 
      a.stage_name.localeCompare(b.stage_name)
    );
  }, [stageCounts, jobsByStage]);
  const handleSidebarStageSelect = (stageId: string | null) => {
    if (!stageId) {
      setSelectedStageId(null);
      setSelectedStageName(null);
      return;
    }
    const stage = (consolidatedStages as any[]).find((s: any) => s.stage_id === stageId);
    setSelectedStageId(stageId);
    setSelectedStageName(stage?.stage_name ?? null);
  };

  const handleJobClick = (job: AccessibleJob) => {
    setSelectedJob(job);
  };

  const handleCloseModal = () => {
    setSelectedJob(null);
  };

  const handleStageAction = async (jobId: string, stageId: string, action: 'start' | 'complete' | 'qr-scan') => {
    try {
      if (action === 'start') {
        const success = await startJob(jobId, stageId);
        if (success) {
          toast.success('Stage started successfully');
        }
      } else if (action === 'complete') {
        const success = await completeJob(jobId, stageId);
        if (success) {
          toast.success('Stage completed successfully');
        }
      } else if (action === 'qr-scan') {
        toast.info('QR scan action triggered');
      }
      
      await refreshJobs();
      
    } catch (error) {
      console.error('Error performing stage action:', error);
      toast.error('Failed to perform stage action');
    }
  };

  const handleQRScan = (data: any) => {
    if (data?.jobId && data?.stageId) {
      handleStageAction(data.jobId, data.stageId, data.action || 'qr-scan');
    }
  };

  const handleQRScanner = () => {
    if (isMobile) {
      toast.info('QR scanner is available in the header');
    } else {
      toast.info('QR scanner functionality - to be implemented');
    }
  };

  const handleConfigureStages = () => {
    toast.info('Stage configuration - navigate to Admin section');
  };

  const handleSort = (field: 'wo_no' | 'due_date') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleRefresh = async () => {
    console.log("🔄 TrackerProduction refresh triggered");
    invalidateCache();
    await refreshJobs();
  };

  const handleModalRefresh = async () => {
    console.log("🔄 Modal refresh triggered - updating main view");
    await handleRefresh();
  };

  if (error) {
    return (
      <div className="flex-1 p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Error loading production data</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
            <RefreshIndicator
              lastUpdated={lastUpdate}
              isRefreshing={isLoading}
              onRefresh={handleRefresh}
              getTimeSinceLastUpdate={() => lastUpdate ? `${Math.floor((Date.now() - lastUpdate.getTime()) / 60000)}m ago` : null}
            />
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading production data...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full">
        <div className="w-64 border-r bg-white overflow-y-auto">
          <DynamicProductionSidebar
            selectedStageId={selectedStageId ?? undefined}
            onStageSelect={handleSidebarStageSelect}
            consolidatedStages={consolidatedStages}
            activeJobs={jobs}
          />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <TrackerErrorBoundary componentName="Production Header">
            <div className="border-b bg-white p-2 sm:p-2">
              <div className="flex items-center justify-between">
                <ProductionHeader
                  isMobile={isMobile}
                  onQRScan={handleQRScan}
                  onStageAction={handleStageAction}
                  onConfigureStages={handleConfigureStages}
                  onQRScanner={handleQRScanner}
                />
                <RefreshIndicator
                  lastUpdated={lastUpdate}
                  isRefreshing={isLoading}
                  onRefresh={handleRefresh}
                  getTimeSinceLastUpdate={() => lastUpdate ? `${Math.floor((Date.now() - lastUpdate.getTime()) / 60000)}m ago` : null}
                />
              </div>
            </div>
          </TrackerErrorBoundary>

          <div className="flex-1 overflow-hidden p-1 sm:p-2">
            <div className="h-full flex flex-col space-y-2">
              <TrackerErrorBoundary componentName="Production Stats">
                <ProductionStats 
                  jobs={jobs}
                  jobsWithoutCategory={jobsWithoutCategory}
                />
              </TrackerErrorBoundary>
              
              <TrackerErrorBoundary componentName="Category Info Banner">
                <CategoryInfoBanner 
                  jobsWithoutCategoryCount={jobsWithoutCategory.length}
                />
              </TrackerErrorBoundary>
              
              <TrackerErrorBoundary componentName="Production Sorting">
                <ProductionSorting
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
              </TrackerErrorBoundary>
              
              <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-auto bg-white rounded-lg border">
                  <TrackerErrorBoundary 
                    componentName="Jobs View"
                    fallback={
                      <DataLoadingFallback
                        componentName="production jobs"
                        onRetry={handleRefresh}
                        showDetails={false}
                      />
                    }
                  >
                    <div className="flex gap-4 items-center text-xs font-bold px-2 py-1 border-b bg-gray-50">
                      <span className="w-8 text-center">Due</span>
                      <span className="flex-1">Job Name / Number</span>
                      <span className="w-32">Due Date</span>
                      <span className="w-40">Current Stage</span>
                      <span className="w-24">Progress</span>
                      <span className="w-24 text-right">Actions</span>
                    </div>
                    <ProductionJobsView
                      jobs={sortedJobs}
                      selectedStage={selectedStageName}
                      isLoading={isLoading}
                      onJobClick={handleJobClick}
                      onStageAction={handleStageAction}
                      disableSpecifications={!selectedStageId}
                    />
                  </TrackerErrorBoundary>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedJob && (
        <MasterOrderModal
          isOpen={true}
          onClose={handleCloseModal}
          job={selectedJob}
          onRefresh={handleModalRefresh}
        />
      )}

      {partAssignmentJob && (
        <JobPartAssignmentManager
          jobId={partAssignmentJob.id}
          jobTableName="production_jobs"
          open={true}
          onClose={() => setPartAssignmentJob(null)}
        />
      )}
    </>
  );
};

export default TrackerProduction;
