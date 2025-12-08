import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Scissors, FoldVertical, Repeat, Maximize, PenTool, Zap, Layers } from 'lucide-react';
import { ViewToggle } from '../common/ViewToggle';
import { DtpKanbanColumnWithBoundary } from './DtpKanbanColumnWithBoundary';
import { EnhancedJobDetailsModal } from './EnhancedJobDetailsModal';
import { JobListView } from '../common/JobListView';
import { useAccessibleJobs, AccessibleJob } from '@/hooks/tracker/useAccessibleJobs';
import { ScheduledJobStage } from '@/hooks/tracker/useScheduledJobs';
import { useJobActions } from '@/hooks/tracker/useAccessibleJobs/useJobActions';
import { JobListLoading, JobErrorState } from '../common/JobLoadingStates';
import { ScoringQueueToggleControls } from './ScoringQueueToggleControls';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useUserStagePermissions } from '@/hooks/tracker/useUserStagePermissions';

interface QueueConfig {
  id: string;
  title: string;
  stageName: string;
  colorClass: string;
  backgroundColor: string;
  icon: React.ReactNode;
  stageId: string;
}

// Icon mapping for scoring stages
const getScoringIcon = (stageName: string): React.ReactNode => {
  const name = stageName.toLowerCase();
  if (name.includes('scoring') && name.includes('folding')) return <FoldVertical className="h-4 w-4" />;
  if (name.includes('scoring')) return <Scissors className="h-4 w-4" />;
  if (name.includes('perfing') || name.includes('perf')) return <Repeat className="h-4 w-4" />;
  if (name.includes('creasing') || name.includes('crease')) return <Maximize className="h-4 w-4" />;
  if (name.includes('manual') && name.includes('fold')) return <PenTool className="h-4 w-4" />;
  if (name.includes('auto') && name.includes('fold')) return <Zap className="h-4 w-4" />;
  return <Layers className="h-4 w-4" />; // Default icon
};

export const ScoringKanbanDashboard: React.FC = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    const saved = localStorage.getItem('scoring-view-mode');
    return (saved === 'card' || saved === 'list') ? saved : 'card';
  });
  const [selectedJob, setSelectedJob] = useState<AccessibleJob | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [enabledStageNames, setEnabledStageNames] = useState<string[]>([]);

  const { consolidatedStages, isLoading: permissionsLoading } = useUserStagePermissions(user?.id);
  
  const { jobs, isLoading, error, refreshJobs } = useAccessibleJobs({
    permissionType: 'work'
  });

  const { startJob, completeJob } = useJobActions(refreshJobs);

  // Dynamically build queue configs from user's accessible stages
  const QUEUE_CONFIGS: QueueConfig[] = useMemo(() => {
    return consolidatedStages
      .filter(stage => {
        const name = stage.stage_name.toLowerCase();
        // Include stages related to scoring, folding, perfing, creasing
        return name.includes('scoring') || 
               name.includes('folding') || 
               name.includes('perfing') || 
               name.includes('perf') ||
               name.includes('creasing') ||
               name.includes('crease');
      })
      .map(stage => ({
        id: stage.stage_id,
        title: stage.stage_name,
        stageName: stage.stage_name,
        colorClass: 'bg-purple-600',
        backgroundColor: stage.stage_color || '#9333ea',
        icon: getScoringIcon(stage.stage_name),
        stageId: stage.stage_id
      }));
  }, [consolidatedStages]);

  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('scoring-view-mode', mode);
  };

  const handleRefresh = async () => {
    await refreshJobs();
  };

  const handleJobClick = (job: AccessibleJob) => {
    setSelectedJob(job);
    setShowJobModal(true);
  };

  const handleCloseModal = () => {
    setShowJobModal(false);
    setSelectedJob(null);
  };

  // Convert AccessibleJob to ScheduledJobStage for EnhancedJobDetailsModal
  const convertToScheduledJobStage = (job: AccessibleJob): ScheduledJobStage => {
    return {
      id: job.current_stage_id || job.job_id,
      job_id: job.job_id,
      job_table_name: 'production_jobs',
      production_stage_id: job.current_stage_id || '',
      stage_name: job.current_stage_name,
      stage_color: job.current_stage_color,
      stage_order: job.current_stage_order || 0,
      status: job.current_stage_status as any,
      wo_no: job.wo_no,
      customer: job.customer,
      due_date: job.due_date,
      qty: job.qty,
      category_name: job.category_name,
      category_color: job.category_color,
      is_ready_now: true,
      is_scheduled_later: false,
      is_waiting_for_dependencies: false,
    };
  };

  // Wrapper functions for start/complete that handle stageId
  const handleStartJobWrapper = async (jobId: string): Promise<boolean> => {
    const job = jobs.find(j => j.job_id === jobId);
    if (!job || !job.current_stage_id) return false;
    
    const result = await startJob(jobId, job.current_stage_id);
    if (result) {
      await refreshJobs();
    }
    return result;
  };

  const handleCompleteJobWrapper = async (jobId: string): Promise<boolean> => {
    const job = jobs.find(j => j.job_id === jobId);
    if (!job || !job.current_stage_id) return false;
    
    const result = await completeJob(jobId, job.current_stage_id);
    if (result) {
      await refreshJobs();
    }
    return result;
  };

  // Filter jobs by search and queue
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch = !searchQuery || 
        job.wo_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.customer.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesSearch;
    });
  }, [jobs, searchQuery]);

  // Organize jobs by queue
  const queueJobs = useMemo(() => {
    const queues: Record<string, AccessibleJob[]> = {};
    
    QUEUE_CONFIGS.forEach(config => {
      queues[config.id] = filteredJobs.filter(job => 
        job.current_stage_id === config.stageId
      );
    });
    
    return queues;
  }, [filteredJobs, QUEUE_CONFIGS]);

  // Count total jobs and queue groups
  const totalJobs = filteredJobs.length;
  const activeQueueCount = QUEUE_CONFIGS.filter(config => 
    (queueJobs[config.id]?.length || 0) > 0
  ).length;

  if (isLoading || permissionsLoading) {
    return <JobListLoading />;
  }

  if (error) {
    return <JobErrorState error={error} onRetry={handleRefresh} onRefresh={refreshJobs} />;
  }

  if (QUEUE_CONFIGS.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <p>No scoring queues available.</p>
          <p className="text-sm mt-2">Contact your administrator for access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 p-3 sm:p-4 border-b bg-card">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <ViewToggle view={viewMode} onViewChange={handleViewModeChange} />
            
            <ScoringQueueToggleControls 
              onQueueFiltersChange={setEnabledStageNames}
            />
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="whitespace-nowrap">
                {totalJobs} Jobs
              </Badge>
              <Badge variant="outline" className="whitespace-nowrap">
                {activeQueueCount} Queues
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area - Card or List View */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'card' ? (
          <div key="card-view" className="overflow-x-auto pb-4 h-full">
            <div className="flex gap-4 min-w-max p-4">
              {QUEUE_CONFIGS.map(config => {
                if (!enabledStageNames.includes(config.stageName) && enabledStageNames.length > 0) {
                  return null;
                }

                const jobsForQueue = queueJobs[config.id] || [];
                
                return (
                  <div key={config.id} className="w-80 flex-shrink-0">
                    <DtpKanbanColumnWithBoundary
                      title={config.title}
                      jobs={jobsForQueue}
                      onStart={startJob}
                      onComplete={completeJob}
                      onJobClick={handleJobClick}
                      colorClass={config.colorClass}
                      backgroundColor={config.backgroundColor}
                      icon={config.icon}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div key="list-view" className="overflow-x-auto pb-4 h-full">
            <div className="flex gap-4 min-w-max">
              {QUEUE_CONFIGS.map(config => {
                if (!enabledStageNames.includes(config.stageName) && enabledStageNames.length > 0) {
                  return null;
                }

                const jobsForQueue = queueJobs[config.id] || [];
                
                return (
                  <div key={config.id} className="w-80 flex-shrink-0 flex flex-col space-y-2">
                    <div 
                      className="flex-shrink-0 px-3 py-2 text-white rounded-md"
                      style={{ backgroundColor: config.backgroundColor }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {config.icon}
                          <span className="font-medium text-sm truncate">{config.title} ({jobsForQueue.length})</span>
                        </div>
                        <span className="text-xs opacity-80">Sorted by: Priority</span>
                      </div>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="pr-4">
                        <JobListView
                          jobs={jobsForQueue}
                          onStart={startJob}
                          onComplete={completeJob}
                          onJobClick={handleJobClick}
                        />
                      </div>
                    </ScrollArea>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Job Details Modal */}
      {selectedJob && (
        <EnhancedJobDetailsModal
          job={convertToScheduledJobStage(selectedJob)}
          isOpen={showJobModal}
          onClose={handleCloseModal}
          onStartJob={handleStartJobWrapper}
          onCompleteJob={handleCompleteJobWrapper}
        />
      )}
    </div>
  );
};
