import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  RefreshCw, 
  Clock, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Timer,
  Users,
  Settings,
  UserCheck,
  Layers,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useScheduledJobs, ScheduledJobStage } from "@/hooks/tracker/useScheduledJobs";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/tracker/useUserRole";
import { EnhancedScheduledOperatorJobCard } from "./EnhancedScheduledOperatorJobCard";
import { OperatorJobListView } from "./OperatorJobListView";
import { ConcurrentJobSelector } from "./ConcurrentJobSelector";
import { SupervisorOverrideModal } from "./SupervisorOverrideModal";
import { BatchStartModal } from "./BatchStartModal";
import { PrinterQueueSelector } from "./PrinterQueueSelector";
import { EnhancedJobDetailsModal } from "./EnhancedJobDetailsModal";
import { GlobalBarcodeListener } from "./GlobalBarcodeListener";
import { useConcurrentJobManagement } from "@/hooks/tracker/useConcurrentJobManagement";
import { toast } from "sonner";

interface SchedulerAwareOperatorDashboardProps {
  production_stage_id?: string;
  department_filter?: string;
}

export const SchedulerAwareOperatorDashboard: React.FC<SchedulerAwareOperatorDashboardProps> = ({
  production_stage_id,
  department_filter
}) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { userRole, accessibleStages, isLoading: roleLoading, isOperator, isAdmin, isManager } = useUserRole();
  const [refreshing, setRefreshing] = useState(false);
  const [concurrentMode, setConcurrentMode] = useState(false);
  const [supervisorOverrideJob, setSupervisorOverrideJob] = useState<any>(null);
  const [showBatchStartModal, setShowBatchStartModal] = useState(false);
  
  // DTP stage patterns (stay on Factory Floor)
  const DTP_PATTERNS = ['dtp', 'prepress', 'proof'];
  
  // Packaging/Shipping stage patterns (redirect to packaging)
  const PACKAGING_PATTERNS = ['packaging', 'shipping', 'dispatch'];
  
  // Redirect non-DTP/non-Packaging operators to the finishing dashboard (multi-column view)
  useEffect(() => {
    if (roleLoading) return;
    
    // Skip redirect if user is admin or manager
    if (isAdmin || isManager) return;
    
    // Skip redirect if already on a specific stage (production_stage_id provided)
    if (production_stage_id) return;
    
    // Check if user is operator with stages
    if (isOperator && accessibleStages.length > 0) {
      const hasDtpStages = accessibleStages.some(stage => 
        DTP_PATTERNS.some(pattern => 
          stage.stage_name.toLowerCase().includes(pattern)
        )
      );
      
      const hasPackagingStages = accessibleStages.some(stage => 
        PACKAGING_PATTERNS.some(pattern => 
          stage.stage_name.toLowerCase().includes(pattern)
        )
      );
      
      // If operator has NO DTP stages and NO Packaging stages, redirect to finishing (multi-column view)
      if (!hasDtpStages && !hasPackagingStages) {
        console.log('🔄 Redirecting operator to /tracker/finishing (multi-column view)');
        navigate('/tracker/finishing', { replace: true });
        return;
      }
    }
  }, [roleLoading, isOperator, isAdmin, isManager, accessibleStages, production_stage_id, navigate]);
  
  // Printer queue selection state - initialize from localStorage synchronously
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | undefined>(() => {
    if (production_stage_id) return production_stage_id;
    
    const saved = localStorage.getItem('selected_printer_queue');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.id;
      } catch (e) {
        localStorage.removeItem('selected_printer_queue');
      }
    }
    return undefined;
  });
  const [selectedPrinterInfo, setSelectedPrinterInfo] = useState<any>(() => {
    if (production_stage_id) return null;
    
    const saved = localStorage.getItem('selected_printer_queue');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        localStorage.removeItem('selected_printer_queue');
      }
    }
    return null;
  });
  
  // Barcode scanning state
  const [scanCompleted, setScanCompleted] = useState(false);
  
  // Job details modal state
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<ScheduledJobStage | null>(null);
  const [showJobDetailsModal, setShowJobDetailsModal] = useState(false);

  // Helper: normalize and match barcode to WO number
  const woMatchesBarcode = (woNo: string, barcodeData: string): boolean => {
    const normalize = (s: string) => (s || "").toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const stripLetters = (s: string) => s.replace(/^[A-Z]+/, "");

    const cleanScanned = normalize(barcodeData);
    const cleanExpected = normalize(woNo);
    const numericScanned = stripLetters(cleanScanned);
    const numericExpected = stripLetters(cleanExpected);

    return (
      cleanScanned === cleanExpected ||
      numericScanned === numericExpected ||
      cleanScanned.includes(cleanExpected) ||
      cleanExpected.includes(cleanScanned) ||
      numericScanned.includes(numericExpected) ||
      numericExpected.includes(numericScanned)
    );
  };

  // Global barcode handler - works whether modal is open or not
  const handleBarcodeDetected = (barcodeData: string) => {
    console.log('🔍 Global barcode detected:', barcodeData, 'Modal open:', showJobDetailsModal);
    
    // If modal is already open, verify the barcode matches the selected job
    if (showJobDetailsModal && selectedJobForDetails) {
      console.log('🔍 Verifying against selected job:', selectedJobForDetails.wo_no);
      
      if (woMatchesBarcode(selectedJobForDetails.wo_no, barcodeData)) {
        setScanCompleted(true);
        toast.success("Job barcode matched");
      } else {
        toast.error(`Scanned code does not match this job. Expected like: ${selectedJobForDetails.wo_no} (prefix optional). Got: ${barcodeData}`);
      }
      return;
    }
    
    // If no modal is open, search for the job in the queue and open it
    console.log('🔍 Searching for job in queue...');
    const matchedJob = scheduledJobs.find(job => woMatchesBarcode(job.wo_no, barcodeData));
    
    if (matchedJob) {
      console.log('✅ Found matching job:', matchedJob.wo_no);
      setSelectedJobForDetails(matchedJob);
      setShowJobDetailsModal(true);
      setScanCompleted(true); // Auto-validate since they scanned to find it
      toast.success(`Found job ${matchedJob.wo_no} - opening...`);
    } else {
      console.log('⚠️ No matching job found for:', barcodeData);
      toast.warning(`No job found matching: ${barcodeData}`);
    }
  };
  
  // Memoize options to prevent infinite loop
  const scheduledJobsOptions = React.useMemo(() => ({
    production_stage_id: selectedPrinterId || production_stage_id,
    department_filter
  }), [selectedPrinterId, production_stage_id, department_filter]);

  const { 
    scheduledJobs, 
    jobsByReadiness, 
    isLoading, 
    error, 
    startScheduledJob, 
    completeScheduledJob, 
    refreshJobs,
    lastUpdate
  } = useScheduledJobs(scheduledJobsOptions);

  const {
    selectedJobs,
    isProcessing: concurrentProcessing,
    batchCompatibility,
    toggleJobSelection,
    clearSelection,
    startJobsBatch,
    startJobOutOfOrder,
    loadDepartmentRules
  } = useConcurrentJobManagement();

  // Load department rules on mount
  useEffect(() => {
    loadDepartmentRules();
  }, [loadDepartmentRules]);

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('❌ Logout failed:', error);
      toast.error('Logout failed');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshJobs();
      toast.success('Queue refreshed');
    } catch (error) {
      console.error('❌ Refresh failed:', error);
      toast.error('Failed to refresh queue');
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  };

  const handleJobClick = (job: ScheduledJobStage) => {
    if (concurrentMode) {
      toggleJobSelection(job);
    } else {
      setSelectedJobForDetails(job);
      setShowJobDetailsModal(true);
      setScanCompleted(false); // Reset scan state for new job
    }
  };

  const handlePrinterChange = (printerId: string | undefined, printerInfo: any) => {
    setSelectedPrinterId(printerId);
    setSelectedPrinterInfo(printerInfo);
  };

  const handleStartJobFromModal = async (jobId: string): Promise<boolean> => {
    const success = await startScheduledJob(jobId);
    if (success) {
      setShowJobDetailsModal(false);
      setScanCompleted(false);
      refreshJobs();
    }
    return success;
  };

  const handleCompleteJobFromModal = async (jobId: string): Promise<boolean> => {
    const success = await completeScheduledJob(jobId);
    if (success) {
      setShowJobDetailsModal(false);
      setScanCompleted(false);
      refreshJobs();
    }
    return success;
  };

  const handleSupervisorOverride = (job: any) => {
    setSupervisorOverrideJob(job);
  };

  const handleApplySupervisorOverride = async (override: any) => {
    if (supervisorOverrideJob) {
      const success = await startJobOutOfOrder(supervisorOverrideJob, override);
      if (success) {
        setSupervisorOverrideJob(null);
        refreshJobs();
      }
    }
  };

  const handleStartBatch = async (options: any) => {
    const success = await startJobsBatch(options.supervisorOverride);
    if (success) {
      setShowBatchStartModal(false);
      refreshJobs();
    }
  };

  const stats = React.useMemo(() => {
    return {
      total: scheduledJobs.length,
      readyNow: jobsByReadiness.ready_now.length,
      scheduledLater: jobsByReadiness.scheduled_later.length,
      waitingDependencies: jobsByReadiness.waiting_dependencies.length,
      active: scheduledJobs.filter(j => j.status === 'active').length,
      selected: selectedJobs.length,
      compatible: selectedJobs.filter(j => j.isCompatible).length
    };
  }, [scheduledJobs, jobsByReadiness, selectedJobs]);

  // Show loading only if we have a selected stage
  if (isLoading && (selectedPrinterId || production_stage_id)) {
    return (
      <div className="flex items-center justify-center p-8 min-h-screen bg-gray-50">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <span className="text-xl font-medium text-gray-900">Loading production queue...</span>
          <p className="text-gray-600 mt-2">Fetching scheduled jobs from the system...</p>
        </div>
      </div>
    );
  }

  // Show selection prompt if no stage is selected
  if (!selectedPrinterId && !production_stage_id) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Factory Floor</h1>
                <p className="text-gray-600">
                  Welcome back, {user?.email?.split('@')[0] || 'Operator'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <Users className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 py-6">
          <PrinterQueueSelector
            selectedPrinterId={selectedPrinterId}
            onPrinterChange={handlePrinterChange}
            jobStats={{
              ready: 0,
              scheduled: 0,
              waiting: 0,
              active: 0
            }}
          />
          
          <Card className="mt-6">
            <CardContent className="p-12 text-center">
              <Info className="h-16 w-16 mx-auto mb-4 text-blue-500" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Select Your Work Queue
              </h2>
              <p className="text-gray-600 mb-4">
                Please select which production stage you'd like to work on from the dropdown above.
              </p>
              <p className="text-sm text-gray-500">
                Your queue will load once you've made a selection.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 min-h-screen bg-gray-50">
        <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-lg max-w-2xl mx-auto mt-20">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <p className="font-semibold text-xl">Production Queue Error</p>
            <p className="mt-2">{error}</p>
            <Button onClick={handleRefresh} className="mt-4" variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Global Barcode Listener - ALWAYS active to allow scanning to find jobs */}
      <GlobalBarcodeListener onBarcodeDetected={handleBarcodeDetected} minLength={5} />
      
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Factory Floor
                {selectedPrinterInfo && (
                  <Badge variant="secondary" className="ml-2 text-sm">
                    {selectedPrinterInfo.name}
                  </Badge>
                )}
              </h1>
              <p className="text-gray-600">
                Welcome back, {user?.email?.split('@')[0] || 'Operator'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant={concurrentMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setConcurrentMode(!concurrentMode);
                  if (concurrentMode) clearSelection();
                }}
                className="flex items-center gap-2"
              >
                <Layers className="h-4 w-4" />
                {concurrentMode ? 'Exit Multi-Select' : 'Multi-Select'}
              </Button>
              
              {selectedJobs.length > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowBatchStartModal(true)}
                  disabled={concurrentProcessing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Start {selectedJobs.length} Jobs
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline" 
                size="sm"
                onClick={handleLogout}
              >
                <Users className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Printer Queue Selector */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <PrinterQueueSelector
          selectedPrinterId={selectedPrinterId}
          onPrinterChange={handlePrinterChange}
          jobStats={{
            ready: stats.readyNow,
            scheduled: stats.scheduledLater,
            waiting: stats.waitingDependencies,
            active: stats.active
          }}
        />

        {/* Simplified Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700">Total Jobs</p>
                  <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
                </div>
                <Timer className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-700">Active Jobs</p>
                  <p className="text-2xl font-bold text-purple-900">{stats.active}</p>
                </div>
                <RefreshCw className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-700">Ready to Work</p>
                  <p className="text-2xl font-bold text-green-900">{stats.readyNow}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Waiting Approval</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.waitingDependencies}</p>
                </div>
                <Calendar className="h-8 w-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>

          {/* Selected Jobs Stats (shown in concurrent mode) */}
          {concurrentMode && (
            <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-indigo-700">Selected</p>
                    <p className="text-2xl font-bold text-indigo-900">{stats.selected}</p>
                    {stats.selected > 0 && (
                      <p className="text-xs text-indigo-600">
                        {stats.compatible} compatible
                      </p>
                    )}
                  </div>
                  <Layers className="h-8 w-8 text-indigo-600" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Single Work Queue */}
        <div className="space-y-4">
          {/* Multi-Select Mode */}
          {concurrentMode && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-indigo-900">
                  <Layers className="h-5 w-5" />
                  Multi-Select Mode ({stats.selected} selected)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ConcurrentJobSelector
                  availableJobs={jobsByReadiness.ready_now}
                  selectedJobs={selectedJobs}
                  onToggleSelection={toggleJobSelection}
                  onClearSelection={clearSelection}
                  onStartBatch={() => setShowBatchStartModal(true)}
                  onRequestSupervisorOverride={handleSupervisorOverride}
                  isProcessing={concurrentProcessing}
                  batchCompatibility={batchCompatibility}
                />
              </CardContent>
            </Card>
          )}

          {/* Work Queue - Show all jobs in priority order */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Work Queue ({stats.total} jobs)
              </CardTitle>
              <p className="text-sm text-gray-600">
                {stats.active > 0 && `${stats.active} active, `}
                {stats.readyNow > 0 && `${stats.readyNow} ready, `}
                {stats.waitingDependencies > 0 && `${stats.waitingDependencies} waiting for approval`}
              </p>
            </CardHeader>
            <CardContent>
              <OperatorJobListView
                jobs={scheduledJobs}
                onJobClick={handleJobClick}
                onStartJob={startScheduledJob}
                onCompleteJob={completeScheduledJob}
                multiSelectMode={concurrentMode}
                selectedJobs={selectedJobs}
                onToggleSelection={toggleJobSelection}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <SupervisorOverrideModal
        isOpen={!!supervisorOverrideJob}
        onClose={() => setSupervisorOverrideJob(null)}
        job={supervisorOverrideJob}
        onApprove={handleApplySupervisorOverride}
        isProcessing={concurrentProcessing}
      />

      <BatchStartModal
        isOpen={showBatchStartModal}
        onClose={() => setShowBatchStartModal(false)}
        selectedJobs={selectedJobs}
        onStartBatch={handleStartBatch}
        isProcessing={concurrentProcessing}
        batchCompatibility={batchCompatibility}
      />

      <EnhancedJobDetailsModal
        job={selectedJobForDetails}
        isOpen={showJobDetailsModal}
        onClose={() => {
          setShowJobDetailsModal(false);
          setSelectedJobForDetails(null);
        }}
        onStartJob={handleStartJobFromModal}
        onCompleteJob={handleCompleteJobFromModal}
        scanCompleted={scanCompleted}
      />
    </div>
  );
};