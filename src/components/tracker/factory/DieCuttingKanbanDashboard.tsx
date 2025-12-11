import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Scissors, Inbox, Settings, ArrowRightLeft } from 'lucide-react';
import { ViewToggle } from '../common/ViewToggle';
import { useDieCuttingMachines, DieCuttingJob } from '@/hooks/tracker/useDieCuttingMachines';
import { DieCuttingJobCard } from './DieCuttingJobCard';
import { DieCuttingReassignmentModal } from '../jobs/DieCuttingReassignmentModal';
import { EnhancedJobDetailsModal } from './EnhancedJobDetailsModal';
import { ScheduledJobStage } from '@/hooks/tracker/useScheduledJobs';
import { JobListLoading, JobErrorState } from '../common/JobLoadingStates';
import { useAuth } from '@/hooks/useAuth';

export const DieCuttingKanbanDashboard: React.FC = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    const saved = localStorage.getItem('die-cutting-view-mode');
    return (saved === 'card' || saved === 'list') ? saved : 'card';
  });
  const [selectedJob, setSelectedJob] = useState<DieCuttingJob | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showReassignmentModal, setShowReassignmentModal] = useState(false);

  const {
    machines,
    jobs,
    unassignedJobs,
    isLoading,
    error,
    assignJobToMachine,
    startJob,
    completeJob,
    refreshData,
    getJobsForMachine
  } = useDieCuttingMachines();

  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('die-cutting-view-mode', mode);
  };

  const handleJobClick = (job: DieCuttingJob) => {
    setSelectedJob(job);
    setShowJobModal(true);
  };

  const handleCloseModal = () => {
    setShowJobModal(false);
    setSelectedJob(null);
  };

  const handleAssignToMachine = async (job: DieCuttingJob, machineId: string | null) => {
    await assignJobToMachine(job.stage_instance_id, machineId);
  };

  // Convert DieCuttingJob to ScheduledJobStage for EnhancedJobDetailsModal
  const convertToScheduledJobStage = (job: DieCuttingJob): ScheduledJobStage => {
    return {
      id: job.stage_instance_id,
      job_id: job.job_id,
      job_table_name: 'production_jobs',
      production_stage_id: job.production_stage_id,
      stage_name: 'Die Cutting',
      stage_color: '#6366f1',
      stage_order: job.stage_order,
      status: job.status as any,
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

  const handleStartJob = async (jobId: string): Promise<boolean> => {
    const job = jobs.find(j => j.job_id === jobId);
    if (!job) return false;
    return await startJob(job.stage_instance_id);
  };

  const handleCompleteJob = async (jobId: string): Promise<boolean> => {
    const job = jobs.find(j => j.job_id === jobId);
    if (!job) return false;
    return await completeJob(job.stage_instance_id);
  };

  // Filter jobs by search query
  const filterJobs = (jobList: DieCuttingJob[]) => {
    if (!searchQuery) return jobList;
    const query = searchQuery.toLowerCase();
    return jobList.filter(job =>
      job.wo_no.toLowerCase().includes(query) ||
      job.customer?.toLowerCase().includes(query) ||
      job.reference?.toLowerCase().includes(query)
    );
  };

  const filteredUnassigned = filterJobs(unassignedJobs);

  // Stats
  const totalJobs = jobs.length;
  const activeJobs = jobs.filter(job => job.status === 'active').length;
  const unassignedCount = unassignedJobs.length;

  if (isLoading) {
    return <JobListLoading />;
  }

  if (error) {
    return <JobErrorState error={error} onRetry={refreshData} onRefresh={refreshData} />;
  }

  return (
    <div className="flex flex-col h-full bg-muted/30 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-3 sm:p-4 space-y-3 sm:space-y-4 bg-background border-b">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Scissors className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Die Cutting Department</h2>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <Button 
              onClick={() => setShowReassignmentModal(true)} 
              variant="outline" 
              size="sm"
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Move Jobs
            </Button>
            <ViewToggle view={viewMode} onViewChange={handleViewModeChange} />
            <Button onClick={refreshData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">Total: {totalJobs}</Badge>
          <Badge variant="secondary">Active: {activeJobs}</Badge>
          <Badge variant="destructive">Unassigned: {unassignedCount}</Badge>
          <Badge variant="secondary">Machines: {machines.length}</Badge>
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 overflow-hidden px-3 sm:px-4 pb-3 sm:pb-4">
        <div className="h-full overflow-auto">
          <div 
            className="grid gap-4 h-full"
            style={{ 
              gridTemplateColumns: `repeat(${machines.length + 1}, minmax(280px, 1fr))` 
            }}
          >
            {/* Unassigned Column */}
            <div className="flex flex-col min-h-0">
              <div className="flex-shrink-0 px-3 py-2 bg-destructive text-destructive-foreground rounded-t-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-4 w-4" />
                    <span className="font-medium text-sm">Unassigned ({filteredUnassigned.length})</span>
                  </div>
                </div>
              </div>
              <Card className="flex-1 rounded-t-none border-t-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <CardContent className="p-2 space-y-2">
                    {filteredUnassigned.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8 text-sm">
                        No unassigned jobs
                      </div>
                    ) : (
                      filteredUnassigned.map(job => (
                        <DieCuttingJobCard
                          key={job.stage_instance_id}
                          job={job}
                          machines={machines}
                          onJobClick={() => handleJobClick(job)}
                          onAssignToMachine={(machineId) => handleAssignToMachine(job, machineId)}
                          onStart={() => startJob(job.stage_instance_id)}
                          onComplete={() => completeJob(job.stage_instance_id)}
                          viewMode={viewMode}
                        />
                      ))
                    )}
                  </CardContent>
                </ScrollArea>
              </Card>
            </div>

            {/* Machine Columns */}
            {machines.map(machine => {
              const machineJobs = filterJobs(getJobsForMachine(machine.id));
              const activeCount = machineJobs.filter(j => j.status === 'active').length;
              
              return (
                <div key={machine.id} className="flex flex-col min-h-0">
                  <div 
                    className="flex-shrink-0 px-3 py-2 text-white rounded-t-md"
                    style={{ backgroundColor: '#6366f1' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Scissors className="h-4 w-4" />
                        <span className="font-medium text-sm truncate">{machine.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs bg-white/20">
                          {machineJobs.length}
                        </Badge>
                        {activeCount > 0 && (
                          <Badge variant="default" className="text-xs bg-green-500">
                            {activeCount} active
                          </Badge>
                        )}
                      </div>
                    </div>
                    {machine.location && (
                      <div className="text-xs opacity-80 mt-1">{machine.location}</div>
                    )}
                  </div>
                  <Card className="flex-1 rounded-t-none border-t-0 overflow-hidden">
                    <ScrollArea className="h-full">
                      <CardContent className="p-2 space-y-2">
                        {machineJobs.length === 0 ? (
                          <div className="text-center text-muted-foreground py-8 text-sm">
                            No jobs assigned
                          </div>
                        ) : (
                          machineJobs.map(job => (
                            <DieCuttingJobCard
                              key={job.stage_instance_id}
                              job={job}
                              machines={machines}
                              onJobClick={() => handleJobClick(job)}
                              onAssignToMachine={(machineId) => handleAssignToMachine(job, machineId)}
                              onStart={() => startJob(job.stage_instance_id)}
                              onComplete={() => completeJob(job.stage_instance_id)}
                              viewMode={viewMode}
                            />
                          ))
                        )}
                      </CardContent>
                    </ScrollArea>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Job Details Modal */}
      {selectedJob && (
        <EnhancedJobDetailsModal
          job={convertToScheduledJobStage(selectedJob)}
          isOpen={showJobModal}
          onClose={handleCloseModal}
          onStartJob={handleStartJob}
          onCompleteJob={handleCompleteJob}
        />
      )}

      {/* Reassignment Modal */}
      <DieCuttingReassignmentModal
        isOpen={showReassignmentModal}
        onClose={() => setShowReassignmentModal(false)}
        onComplete={refreshData}
        machines={machines}
        jobs={jobs}
      />
    </div>
  );
};
