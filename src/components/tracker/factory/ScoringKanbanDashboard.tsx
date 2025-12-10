import React, { useState, useCallback, useMemo } from "react";
import { Scissors, FoldVertical, RefreshCw } from "lucide-react";
import { useAccessibleJobs, AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";
import { useJobActions } from "@/hooks/tracker/useAccessibleJobs/useJobActions";
import { useAuth } from "@/hooks/useAuth";
import { useUserStagePermissions } from "@/hooks/tracker/useUserStagePermissions";
import { DtpKanbanColumnWithBoundary } from "./DtpKanbanColumnWithBoundary";
import { DtpJobModal } from "./dtp/DtpJobModal";
import { TrackerErrorBoundary } from "../error-boundaries/TrackerErrorBoundary";
import { GlobalBarcodeListener } from "./GlobalBarcodeListener";
import { ViewToggle } from "../common/ViewToggle";
import { JobListView } from "../common/JobListView";
import { sortJobsByWorkflowPriority } from "@/utils/tracker/workflowStateUtils";
import { toast } from "sonner";
import { JobListLoading, JobErrorState } from "../common/JobLoadingStates";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Icon mapping for scoring stages
const getScoringIcon = (stageName: string): React.ReactNode => {
  const name = stageName.toLowerCase();
  if (name.includes('scoring') && name.includes('folding')) return <FoldVertical className="h-4 w-4" />;
  if (name.includes('scoring')) return <Scissors className="h-4 w-4" />;
  if (name.includes('folding')) return <FoldVertical className="h-4 w-4" />;
  return <Scissors className="h-4 w-4" />;
};

const getScoringIconLarge = (stageName: string): React.ReactNode => {
  const name = stageName.toLowerCase();
  if (name.includes('scoring') && name.includes('folding')) return <FoldVertical className="h-8 w-8 text-purple-600" />;
  if (name.includes('scoring')) return <Scissors className="h-8 w-8 text-purple-600" />;
  if (name.includes('folding')) return <FoldVertical className="h-8 w-8 text-indigo-600" />;
  return <Scissors className="h-8 w-8 text-purple-600" />;
};

export const ScoringKanbanDashboard: React.FC = () => {
  const { user } = useAuth();
  const { consolidatedStages, isLoading: permissionsLoading } = useUserStagePermissions(user?.id);
  
  const { 
    jobs, 
    isLoading, 
    error, 
    refreshJobs,
    hasOptimisticUpdates,
    hasPendingUpdates
  } = useAccessibleJobs({
    permissionType: 'view'
  });

  const { 
    startJob, 
    completeJob,
    hasOptimisticUpdates: hasJobActionUpdates 
  } = useJobActions(refreshJobs);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<AccessibleJob | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // Get scoring-related stages from user's accessible stages
  const scoringStages = useMemo(() => {
    if (!consolidatedStages) return [];
    return consolidatedStages.filter(stage => {
      const name = stage.stage_name.toLowerCase();
      return name.includes('scoring') || name.includes('folding');
    });
  }, [consolidatedStages]);

  // Categorize jobs by stage
  const categorizedJobs = useMemo(() => {
    if (!jobs || jobs.length === 0 || scoringStages.length === 0) {
      return {};
    }

    try {
      let filtered = jobs;

      if (searchQuery) {
        filtered = filtered.filter(job => {
          const woMatch = job.wo_no?.toLowerCase().includes(searchQuery.toLowerCase());
          const customerMatch = job.customer && job.customer.toLowerCase().includes(searchQuery.toLowerCase());
          const referenceMatch = job.reference && job.reference.toLowerCase().includes(searchQuery.toLowerCase());
          
          return woMatch || customerMatch || referenceMatch;
        });
      }

      // Categorize by each scoring stage
      const result: Record<string, AccessibleJob[]> = {};
      
      scoringStages.forEach(stage => {
        const stageJobs = filtered.filter(job => {
          const stageName = job.current_stage_name?.toLowerCase() || '';
          return stageName === stage.stage_name.toLowerCase();
        });
        result[stage.stage_id] = sortJobsByWorkflowPriority(stageJobs);
      });
      
      return result;
    } catch (error) {
      console.error("❌ Error categorizing jobs:", error);
      toast.error("Error processing jobs data");
      return {};
    }
  }, [jobs, searchQuery, scoringStages]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshJobs();
      toast.success("Jobs refreshed successfully");
    } catch (error) {
      console.error("❌ Refresh failed:", error);
      toast.error("Failed to refresh jobs");
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  }, [refreshJobs]);

  const handleJobClick = useCallback((job: AccessibleJob) => {
    setSelectedJob(job);
    setShowJobModal(true);
    setScanCompleted(false);
  }, []);

  const openModalForStart = useCallback(async (jobId: string, _stageId: string) => {
    const jobToOpen = jobs.find(j => j.job_id === jobId);
    if (jobToOpen) {
      setSelectedJob(jobToOpen);
      setShowJobModal(true);
      setScanCompleted(false);
    }
    return true;
  }, [jobs]);

  const openModalForComplete = useCallback(async (jobId: string, _stageId: string) => {
    const jobToOpen = jobs.find(j => j.job_id === jobId);
    if (jobToOpen) {
      setSelectedJob(jobToOpen);
      setShowJobModal(true);
      setScanCompleted(false);
    }
    return true;
  }, [jobs]);

  const handleCloseModal = useCallback(() => {
    setShowJobModal(false);
    setSelectedJob(null);
    setScanCompleted(false);
  }, []);

  React.useEffect(() => {
    if (selectedJob && jobs.length > 0) {
      const updatedJob = jobs.find(j => j.job_id === selectedJob.job_id);
      if (updatedJob && JSON.stringify(updatedJob) !== JSON.stringify(selectedJob)) {
        setSelectedJob(updatedJob);
      }
    }
  }, [jobs, selectedJob]);

  const handleBarcodeDetected = (barcodeData: string) => {
    if (!selectedJob) return;
    
    const cleanScanned = barcodeData.trim().toUpperCase();
    const cleanExpected = (selectedJob.wo_no || '').trim().toUpperCase();
    
    const scannedNumbers = cleanScanned.replace(/^[A-Z]+/, '').replace(/\D/g, '');
    const expectedNumbers = cleanExpected.replace(/^[A-Z]+/, '').replace(/\D/g, '');
    
    const isMatch = scannedNumbers && expectedNumbers && scannedNumbers === expectedNumbers;
    
    if (isMatch) {
      setScanCompleted(true);
      toast.success(`Work order ${selectedJob.wo_no} verified - ready to proceed`);
    } else {
      toast.error(`Wrong barcode scanned. Expected: ${cleanExpected}, Got: ${barcodeData}`);
    }
  };

  if (isLoading || permissionsLoading) {
    return (
      <JobListLoading 
        message="Loading scoring & folding jobs..."
        showProgress={true}
      />
    );
  }

  if (error) {
    return (
      <JobErrorState
        error={error}
        onRetry={handleRefresh}
        onRefresh={refreshJobs}
        title="Scoring & Folding Dashboard Error"
      />
    );
  }

  // Calculate totals
  const totalsByStage = scoringStages.map(stage => ({
    stage,
    count: categorizedJobs[stage.stage_id]?.length || 0
  }));
  
  const totalJobs = totalsByStage.reduce((sum, t) => sum + t.count, 0);
  const activeJobs = jobs.filter(j => j.current_stage_status === 'active').length;
  const urgentJobs = jobs.filter(j => {
    const dueDate = j.due_date ? new Date(j.due_date) : null;
    return dueDate && dueDate < new Date();
  }).length;

  // Build subtitle
  const subtitleParts = totalsByStage.filter(t => t.count > 0).map(t => `${t.count} ${t.stage.stage_name}`);
  const subtitle = subtitleParts.length > 0 
    ? `Showing ${subtitleParts.join(' and ')} jobs`
    : 'No jobs found';

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {showJobModal && selectedJob && (
        <GlobalBarcodeListener onBarcodeDetected={handleBarcodeDetected} minLength={5} />
      )}
      
      <div className="flex-shrink-0 p-3 sm:p-4 space-y-3 sm:space-y-4 bg-white border-b">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scoring & Folding</h1>
            <p className="text-sm text-gray-600">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <ViewToggle 
              view={viewMode} 
              onViewChange={setViewMode}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="Search jobs, customers, references..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Summary Cards - Dynamic based on stages */}
        <div className={`grid gap-3 ${scoringStages.length <= 2 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-' + Math.min(scoringStages.length + 2, 6)}`}>
          {totalsByStage.map(({ stage, count }) => (
            <Card key={stage.stage_id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{stage.stage_name}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                  {getScoringIconLarge(stage.stage_name)}
                </div>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active</p>
                  <p className="text-2xl font-bold">{activeJobs}</p>
                </div>
                <Badge variant="default">{activeJobs}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Urgent</p>
                  <p className="text-2xl font-bold text-red-600">{urgentJobs}</p>
                </div>
                <Badge variant="destructive">{urgentJobs}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {(hasOptimisticUpdates || hasPendingUpdates() || hasJobActionUpdates) && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />
            <span className="text-sm text-blue-700 truncate">
              {hasJobActionUpdates ? 'Processing job action...' : hasOptimisticUpdates ? 'Processing updates...' : 'Syncing changes...'}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden px-3 sm:px-4 pb-3 sm:pb-4">
        {viewMode === 'card' ? (
          <div className={`flex flex-col lg:flex-row gap-3 sm:gap-4 h-full overflow-hidden`}>
            {scoringStages.map((stage, index) => {
              const stageJobs = categorizedJobs[stage.stage_id] || [];
              const colors = ['bg-purple-600', 'bg-indigo-600', 'bg-violet-600', 'bg-fuchsia-600'];
              const colorClass = colors[index % colors.length];
              
              return (
                <div key={stage.stage_id} className="flex-1 min-h-0">
                  <DtpKanbanColumnWithBoundary
                    title={stage.stage_name}
                    jobs={stageJobs}
                    onStart={openModalForStart}
                    onComplete={openModalForComplete}
                    onJobClick={handleJobClick}
                    colorClass={colorClass}
                    icon={getScoringIcon(stage.stage_name)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`grid gap-3 sm:gap-4 h-full overflow-hidden ${scoringStages.length === 1 ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
            {scoringStages.map((stage, index) => {
              const stageJobs = categorizedJobs[stage.stage_id] || [];
              const colors = ['bg-purple-600', 'bg-indigo-600', 'bg-violet-600', 'bg-fuchsia-600'];
              const colorClass = colors[index % colors.length];
              
              return (
                <div key={stage.stage_id} className="flex flex-col space-y-2 min-h-0">
                  <div className={`flex-shrink-0 px-3 py-2 ${colorClass} text-white rounded-md`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getScoringIcon(stage.stage_name)}
                        <span className="font-medium text-sm truncate">{stage.stage_name} ({stageJobs.length})</span>
                      </div>
                      <span className="text-xs opacity-80">Sorted by: Priority</span>
                    </div>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="pr-4">
                      <JobListView
                        jobs={stageJobs}
                        onStart={openModalForStart}
                        onComplete={openModalForComplete}
                        onJobClick={handleJobClick}
                      />
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedJob && (
        <TrackerErrorBoundary componentName="Scoring & Folding Job Modal">
          <DtpJobModal
            job={selectedJob}
            isOpen={showJobModal}
            onClose={handleCloseModal}
            onRefresh={handleRefresh}
            scanCompleted={scanCompleted}
            onStartJob={startJob}
            onCompleteJob={completeJob}
          />
        </TrackerErrorBoundary>
      )}
    </div>
  );
};
