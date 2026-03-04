import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Loader2, 
  AlertTriangle, 
  Settings, 
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { useAccessibleJobs } from "@/hooks/tracker/useAccessibleJobs";
import { useProductionStages } from "@/hooks/tracker/useProductionStages";
import { useRealTimeJobStages } from "@/hooks/tracker/useRealTimeJobStages";
import { filterActiveJobs } from "@/utils/tracker/jobCompletionUtils";
import StageColumn from "./multistage-kanban/StageColumn";
import ColumnViewToggle from "./multistage-kanban/ColumnViewToggle";
import { arrayMove } from "@/utils/tracker/reorderUtils";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/tracker/useUserRole";

// DnD kit
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { MultiStageKanbanHeader } from "./MultiStageKanbanHeader";
import { MultiStageKanbanColumns } from "./MultiStageKanbanColumns";
import { MultiStageKanbanColumnsProps } from "./MultiStageKanban.types";

export const MultiStageKanban = () => {
  const { isViewer } = useUserRole();
  const { jobs, isLoading: jobsLoading, error: jobsError, refreshJobs } = useAccessibleJobs({
    permissionType: isViewer ? 'view' : 'manage'
  });
  const { stages } = useProductionStages();

  // CRITICAL: Filter out completed jobs and include batch processing jobs
  const activeJobs = React.useMemo(() => {
    console.log('🔄 MultiStageKanban: Processing jobs for kanban', {
      totalJobs: jobs.length,
      firstJobStructure: jobs[0] ? Object.keys(jobs[0]) : 'no jobs'
    });
    
    // Include jobs that are in batch processing as they're still "active" in the workflow
    const filtered = jobs.filter(job => 
      job.status !== 'Completed' && 
      job.status !== 'Cancelled'
    );
    
    console.log('✅ MultiStageKanban: Filtered active jobs', {
      activeJobsCount: filtered.length,
      completedJobsFiltered: jobs.length - filtered.length,
      batchProcessingJobs: filtered.filter(j => j.status === 'In Batch Processing').length
    });
    
    return filtered;
  }, [jobs]);
  
  const { 
    jobStages, 
    isLoading, 
    error, 
    lastUpdate,
    startStage, 
    completeStage, 
    refreshStages,
    getStageMetrics 
  } = useRealTimeJobStages(activeJobs);

  // Enhanced stages list to include virtual batch processing stage
  const enhancedStages = React.useMemo(() => {
    const baseStages = [...stages];
    
    // Add virtual "In Batch Processing" stage if we have jobs in that status
    const batchProcessingJobs = activeJobs.filter(job => job.status === 'In Batch Processing');
    
    if (batchProcessingJobs.length > 0) {
      const virtualBatchStage = {
        id: 'virtual-batch-processing',
        name: 'In Batch Processing',
        color: '#F59E0B',
        order_index: 999, // Place at end
        description: 'Jobs currently being processed in Printstream',
        is_active: true,
        is_virtual: true,
        master_queue_id: null,
        supports_parts: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      baseStages.push(virtualBatchStage);
    }
    
    return baseStages.sort((a, b) => a.order_index - b.order_index);
  }, [stages, activeJobs]);

  // Enhanced job stages to include virtual batch processing instances
  const enhancedJobStages = React.useMemo(() => {
    const baseJobStages = [...jobStages];
    
    // Add virtual job stage instances for batch processing jobs
    const batchJobs = activeJobs.filter(job => job.status === 'In Batch Processing');
    
    batchJobs.forEach((job, index) => {
      baseJobStages.push({
        id: `virtual-batch-${job.job_id}`,
        job_id: job.job_id,
        job_table_name: 'production_jobs',
        production_stage_id: 'virtual-batch-processing',
        stage_order: 999,
        job_order_in_stage: index + 1, // Add the missing required property
        status: 'active',
        started_at: new Date().toISOString(),
        production_job: {
          id: job.job_id,
          wo_no: job.wo_no,
          customer: job.customer,
          due_date: job.due_date
        },
        production_stage: {
          id: 'virtual-batch-processing',
          name: 'In Batch Processing',
          color: '#F59E0B'
        }
      });
    });
    
    return baseJobStages;
  }, [jobStages, activeJobs]);

  React.useEffect(() => {
    if (error) {
      console.error('❌ MultiStageKanban: Real-time job stages error:', error);
    }
    if (jobsError) {
      console.error('❌ MultiStageKanban: Jobs loading error:', jobsError);
    }
  }, [error, jobsError]);

  const [layout, setLayout] = React.useState<"horizontal" | "vertical">("horizontal");
  const [viewMode, setViewMode] = React.useState<"card" | "list">("list");
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);

  const handleViewModeChange = (mode: "card" | "list") => setViewMode(mode);

  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(prev => prev === jobId ? null : jobId);
  };

  const handleStageAction = async (stageId: string, action: 'start' | 'complete' | 'scan') => {
    try {
      console.log('🔄 MultiStageKanban: Stage action', { stageId, action });
      
      // Handle virtual batch processing stage differently
      if (stageId.startsWith('virtual-batch-')) {
        const jobId = stageId.replace('virtual-batch-', '');
        if (action === 'complete') {
          // Here we would integrate with batch completion logic
          toast.info('Batch processing completion - integrate with Printstream');
        }
        return;
      }
      
      if (action === 'start') await startStage(stageId);
      else if (action === 'complete') await completeStage(stageId);
      else if (action === 'scan') toast.info('QR Scanner would open here');
      
      refreshJobs();
    } catch (err) {
      console.error('❌ MultiStageKanban: Error performing stage action:', err);
      toast.error(`Failed to ${action} stage`);
    }
  };

  const handleReorder = async (stageId: string, newOrderIds: string[]) => {
    try {
      console.log('🔄 MultiStageKanban: Reordering stage', { stageId, itemCount: newOrderIds.length });
      
      const updates = newOrderIds.map((jobStageId, idx) => {
        const jobStage = enhancedJobStages.find(js => js.id === jobStageId);
        if (!jobStage) throw new Error("JobStage not found for id: " + jobStageId);
        return {
          id: jobStage.id,
          job_id: jobStage.job_id,
          job_table_name: jobStage.job_table_name,
          production_stage_id: jobStage.production_stage_id,
          stage_order: jobStage.stage_order,
          job_order_in_stage: idx + 1,
          status: jobStage.status,
        };
      });
      
      const { error } = await supabase
        .from("job_stage_instances")
        .upsert(updates, { onConflict: "id" });
        
      if (error) {
        console.error('❌ MultiStageKanban: Failed to persist job order:', error);
        toast.error("Failed to persist job order");
      } else {
        console.log('✅ MultiStageKanban: Job order updated successfully');
      }
    } catch (e) {
      console.error('❌ MultiStageKanban: Reorder error:', e);
      toast.error("Failed to persist job order: " + (e instanceof Error ? e.message : String(e)));
    }
    
    refreshStages();
    refreshJobs();
  };

  const reorderRefs = React.useRef<Record<string, (newOrder: string[]) => void>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (jobsLoading || isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading multi-stage kanban...</span>
      </div>
    );
  }

  if (jobsError || error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <div>
              <p className="font-medium">Error loading multi-stage kanban</p>
              <p className="text-sm mt-1">{jobsError || error}</p>
              <button 
                onClick={() => {
                  refreshJobs();
                  refreshStages();
                }}
                className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const metrics = getStageMetrics();

  return (
    <div className="p-2">
      <MultiStageKanbanHeader
        metrics={{
          uniqueJobs: metrics.uniqueJobs,
          activeStages: metrics.activeStages,
          pendingStages: metrics.pendingStages,
        }}
        lastUpdate={lastUpdate}
        onRefresh={() => { 
          console.log('🔄 MultiStageKanban: Manual refresh triggered');
          refreshStages(); 
          refreshJobs(); 
        }}
        onSettings={() => {}}
        layout={layout}
        onLayoutChange={value => setLayout(value)}
      >
        <ColumnViewToggle viewMode={viewMode} onChange={setViewMode} />
      </MultiStageKanbanHeader>

      <MultiStageKanbanColumns
        stages={enhancedStages}
        jobStages={enhancedJobStages}
        reorderRefs={reorderRefs}
        handleStageAction={handleStageAction}
        viewMode={viewMode}
        enableDnd={viewMode === "card"}
        handleReorder={handleReorder}
        selectedJobId={selectedJobId}
        onSelectJob={handleSelectJob}
        layout={layout}
      />

      {activeJobs.length === 0 && (
        <Card className="text-center py-6">
          <CardContent>
            <p className="text-gray-500 text-lg">No active jobs found</p>
            <p className="text-gray-400">All jobs have been completed</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MultiStageKanban;
