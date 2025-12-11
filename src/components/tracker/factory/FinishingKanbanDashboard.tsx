import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Hand, Layers, Circle, Package, FolderOpen, Book, FileText, Scissors } from 'lucide-react';
import { ViewToggle } from '../common/ViewToggle';
import { DtpKanbanColumnWithBoundary } from './DtpKanbanColumnWithBoundary';
import { EnhancedJobDetailsModal } from './EnhancedJobDetailsModal';
import { JobListView } from '../common/JobListView';
import { useAccessibleJobs, AccessibleJob } from '@/hooks/tracker/useAccessibleJobs';
import { ScheduledJobStage } from '@/hooks/tracker/useScheduledJobs';
import { useJobActions } from '@/hooks/tracker/useAccessibleJobs/useJobActions';
import { JobListLoading, JobErrorState } from '../common/JobLoadingStates';
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

// Icon mapping for stages
const getStageIcon = (stageName: string): React.ReactNode => {
  const name = stageName.toLowerCase();
  if (name.includes('handwork') || name.includes('hand work')) return <Hand className="h-4 w-4" />;
  if (name.includes('padding') || name.includes('pad')) return <Layers className="h-4 w-4" />;
  if (name.includes('round') && name.includes('corner')) return <Circle className="h-4 w-4" />;
  if (name.includes('box') && name.includes('glu')) return <Package className="h-4 w-4" />;
  if (name.includes('gathering') || name.includes('gather')) return <FolderOpen className="h-4 w-4" />;
  if (name.includes('saddle') || name.includes('stitch')) return <Book className="h-4 w-4" />;
  if (name.includes('wire') && name.includes('bind')) return <Book className="h-4 w-4" />;
  if (name.includes('binding')) return <Book className="h-4 w-4" />;
  if (name.includes('scoring') || name.includes('folding')) return <FileText className="h-4 w-4" />;
  if (name.includes('cutting') || name.includes('die')) return <Scissors className="h-4 w-4" />;
  return <Layers className="h-4 w-4" />; // Default icon
};

export const FinishingKanbanDashboard: React.FC = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    const saved = localStorage.getItem('finishing-view-mode');
    return (saved === 'card' || saved === 'list') ? saved : 'card';
  });
  const [selectedJob, setSelectedJob] = useState<AccessibleJob | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);

  const { consolidatedStages, isLoading: permissionsLoading } = useUserStagePermissions(user?.id);
  
  const { jobs, isLoading, error, refreshJobs } = useAccessibleJobs({
    permissionType: 'work'
  });

  const { startJob, completeJob } = useJobActions(refreshJobs);

  // Dynamically build queue configs from ALL user's accessible stages (no filtering)
  const QUEUE_CONFIGS: QueueConfig[] = useMemo(() => {
    return consolidatedStages.map(stage => ({
      id: stage.stage_id,
      title: stage.stage_name,
      stageName: stage.stage_name,
      colorClass: 'bg-orange-600',
      backgroundColor: stage.stage_color || '#ea580c',
      icon: getStageIcon(stage.stage_name),
      stageId: stage.stage_id
    }));
  }, [consolidatedStages]);

  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('finishing-view-mode', mode);
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
    if (!job?.current_stage_id) return false;
    return await startJob(jobId, job.current_stage_id);
  };

  const handleCompleteJobWrapper = async (jobId: string): Promise<boolean> => {
    const job = jobs.find(j => j.job_id === jobId);
    if (!job?.current_stage_id) return false;
    return await completeJob(jobId, job.current_stage_id);
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch = searchQuery === '' ||
        job.wo_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.reference.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [jobs, searchQuery]);

  const queueJobs = useMemo(() => {
    return QUEUE_CONFIGS.reduce((acc, config) => {
      acc[config.id] = filteredJobs.filter(job =>
        job.current_stage_id === config.stageId
      );
      return acc;
    }, {} as Record<string, AccessibleJob[]>);
  }, [filteredJobs, QUEUE_CONFIGS]);

  const totalJobs = filteredJobs.length;
  const activeJobs = filteredJobs.filter(job => job.current_stage_status === 'active').length;

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
          <p>No finishing queues available.</p>
          <p className="text-sm mt-2">Contact your administrator for access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-muted/30 overflow-hidden">
      <div className="flex-shrink-0 p-3 sm:p-4 space-y-3 sm:space-y-4 bg-background border-b">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-2xl font-bold">My Stages</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <ViewToggle view={viewMode} onViewChange={handleViewModeChange} />
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">Total: {totalJobs}</Badge>
          <Badge variant="secondary">Active: {activeJobs}</Badge>
          <Badge variant="secondary">Queues: {QUEUE_CONFIGS.length}</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-3 sm:px-4 pb-3 sm:pb-4">
        {viewMode === 'card' ? (
          <div key="card-view" className="overflow-x-auto pb-4 h-full">
            <div className="flex gap-4 min-w-max">
              {QUEUE_CONFIGS.map(config => (
                <div key={config.id} className="w-80 flex-shrink-0">
                  <DtpKanbanColumnWithBoundary
                    title={config.title}
                    jobs={queueJobs[config.id] || []}
                    onStart={startJob}
                    onComplete={completeJob}
                    onJobClick={handleJobClick}
                    colorClass={config.colorClass}
                    backgroundColor={config.backgroundColor}
                    icon={config.icon}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div key="list-view" className="overflow-x-auto pb-4 h-full">
            <div className="flex gap-4 min-w-max">
              {QUEUE_CONFIGS.map(config => {
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
