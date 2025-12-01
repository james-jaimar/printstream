import React, { useState, useCallback, useMemo } from "react";
import { Package, Truck, RefreshCw } from "lucide-react";
import { useUserRole } from "@/hooks/tracker/useUserRole";
import { useAccessibleJobs } from "@/hooks/tracker/useAccessibleJobs";
import { useJobActions } from "@/hooks/tracker/useAccessibleJobs/useJobActions";
import { useAuth } from "@/hooks/useAuth";
import { DtpKanbanColumnWithBoundary } from "./DtpKanbanColumnWithBoundary";
import { DtpJobModal } from "./dtp/DtpJobModal";
import { TrackerErrorBoundary } from "../error-boundaries/TrackerErrorBoundary";
import { GlobalBarcodeListener } from "./GlobalBarcodeListener";
import { ViewToggle } from "../common/ViewToggle";
import { JobListView } from "../common/JobListView";
import { sortJobsByWorkflowPriority, getWorkflowStateColor } from "@/utils/tracker/workflowStateUtils";
import { calculateDashboardMetrics } from "@/hooks/tracker/useAccessibleJobs/dashboardUtils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { JobListLoading, JobErrorState } from "../common/JobLoadingStates";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const PackagingShippingKanbanDashboard = () => {
  const { accessibleStages } = useUserRole();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  
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
    optimisticUpdates,
    hasOptimisticUpdates: hasJobActionUpdates 
  } = useJobActions(refreshJobs);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<AccessibleJob | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  const dashboardMetrics = useMemo(() => {
    return calculateDashboardMetrics(jobs);
  }, [jobs]);

  const { packagingJobs, shippingJobs } = useMemo(() => {
    if (!jobs || jobs.length === 0) {
      return { packagingJobs: [], shippingJobs: [] };
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

      // Categorize into packaging and shipping
      const packaging = filtered.filter(job => {
        const stageName = job.current_stage_name?.toLowerCase() || '';
        return stageName.includes('packaging') || stageName.includes('pack');
      });

      const shipping = filtered.filter(job => {
        const stageName = job.current_stage_name?.toLowerCase() || '';
        return stageName.includes('shipping') || stageName.includes('dispatch') || stageName.includes('ship');
      });
      
      const sortedPackaging = sortJobsByWorkflowPriority(packaging);
      const sortedShipping = sortJobsByWorkflowPriority(shipping);
      
      console.log('📦 Packaging Jobs:', sortedPackaging.length);
      console.log('🚚 Shipping Jobs:', sortedShipping.length);
      
      return {
        packagingJobs: sortedPackaging,
        shippingJobs: sortedShipping
      };
    } catch (error) {
      console.error("❌ Error categorizing jobs:", error);
      toast.error("Error processing jobs data");
      return { packagingJobs: [], shippingJobs: [] };
    }
  }, [jobs, searchQuery]);

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
    
    // Flexible matching - extract numeric portions and compare
    const cleanScanned = barcodeData.trim().toUpperCase();
    const cleanExpected = (selectedJob.wo_no || '').trim().toUpperCase();
    
    // Extract numbers only (remove any letter prefix like D, W, etc.)
    const scannedNumbers = cleanScanned.replace(/^[A-Z]+/, '').replace(/\D/g, '');
    const expectedNumbers = cleanExpected.replace(/^[A-Z]+/, '').replace(/\D/g, '');
    
    // Match if numeric portions are equal (handles "427310" matching "D427310")
    const isMatch = scannedNumbers && expectedNumbers && scannedNumbers === expectedNumbers;
    
    if (isMatch) {
      setScanCompleted(true);
      toast.success(`Work order ${selectedJob.wo_no} verified - ready to proceed`);
    } else {
      toast.error(`Wrong barcode scanned. Expected: ${cleanExpected}, Got: ${barcodeData}`);
    }
  };

  if (isLoading) {
    return (
      <JobListLoading 
        message="Loading packaging & shipping jobs..."
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
        title="Packaging & Shipping Dashboard Error"
      />
    );
  }

  const totalJobs = packagingJobs.length + shippingJobs.length;
  const activeJobs = jobs.filter(j => j.current_stage_status === 'active').length;
  const urgentJobs = jobs.filter(j => {
    const dueDate = j.due_date ? new Date(j.due_date) : null;
    return dueDate && dueDate < new Date();
  }).length;

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {showJobModal && selectedJob && (
        <GlobalBarcodeListener onBarcodeDetected={handleBarcodeDetected} minLength={5} />
      )}
      
      <div className="flex-shrink-0 p-3 sm:p-4 space-y-3 sm:space-y-4 bg-white border-b">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Packaging & Shipping</h1>
            <p className="text-sm text-gray-600">
              Showing {packagingJobs.length} Packaging jobs and {shippingJobs.length} Shipping jobs
            </p>
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Packaging</p>
                  <p className="text-2xl font-bold">{packagingJobs.length}</p>
                </div>
                <Package className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Shipping</p>
                  <p className="text-2xl font-bold">{shippingJobs.length}</p>
                </div>
                <Truck className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

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
          <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 h-full overflow-hidden">
            <div className="flex-1 min-h-0">
              <DtpKanbanColumnWithBoundary
                title="Packaging"
                jobs={packagingJobs}
                onStart={openModalForStart}
                onComplete={openModalForComplete}
                onJobClick={handleJobClick}
                colorClass="bg-blue-600"
                icon={<Package className="h-4 w-4" />}
              />
            </div>
            
            <div className="flex-1 min-h-0">
              <DtpKanbanColumnWithBoundary
                title="Shipping"
                jobs={shippingJobs}
                onStart={openModalForStart}
                onComplete={openModalForComplete}
                onJobClick={handleJobClick}
                colorClass="bg-green-600"
                icon={<Truck className="h-4 w-4" />}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 h-full overflow-hidden">
            <div className="flex flex-col space-y-2 min-h-0">
              <div className="flex-shrink-0 px-3 py-2 bg-blue-600 text-white rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 flex-shrink-0" />
                    <span className="font-medium text-sm truncate">Packaging ({packagingJobs.length})</span>
                  </div>
                  <span className="text-xs opacity-80">Sorted by: Priority</span>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="pr-4">
                  <JobListView
                    jobs={packagingJobs}
                    onStart={openModalForStart}
                    onComplete={openModalForComplete}
                    onJobClick={handleJobClick}
                  />
                </div>
              </ScrollArea>
            </div>
            
            <div className="flex flex-col space-y-2 min-h-0">
              <div className="flex-shrink-0 px-3 py-2 bg-green-600 text-white rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 flex-shrink-0" />
                    <span className="font-medium text-sm truncate">Shipping ({shippingJobs.length})</span>
                  </div>
                  <span className="text-xs opacity-80">Sorted by: Priority</span>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="pr-4">
                  <JobListView
                    jobs={shippingJobs}
                    onStart={openModalForStart}
                    onComplete={openModalForComplete}
                    onJobClick={handleJobClick}
                  />
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>

      {selectedJob && (
        <TrackerErrorBoundary componentName="Packaging & Shipping Job Modal">
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
