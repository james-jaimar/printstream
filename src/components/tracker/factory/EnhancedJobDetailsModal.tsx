import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  User,
  Calendar,
  Clock,
  Package,
  MapPin,
  Hash,
  AlertTriangle,
  CheckCircle,
  Timer,
  QrCode,
  FileText,
  Printer,
  Play,
  Pause,
  RotateCcw,
  StickyNote,
  Scan,
  Target
} from "lucide-react";
import { format } from "date-fns";
import { ScheduledJobStage } from "@/hooks/tracker/useScheduledJobs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GlobalBarcodeListener } from "./GlobalBarcodeListener";
import { PrintSpecsBadge } from "./PrintSpecsBadge";
import { SubSpecificationBadge } from "../common/SubSpecificationBadge";
import { SubTaskList } from "../common/SubTaskList";
import { supabase } from "@/integrations/supabase/client";
import StageHoldDialog from "./StageHoldDialog";
import { useStageActions } from "@/hooks/tracker/stage-management/useStageActions";
import { useJobPaperSpecs } from "@/hooks/tracker/useJobPaperSpecs";
import { PartialReworkDialog } from "../jobs/PartialReworkDialog";
import { ReworkSchedulePlacementDialog } from "../jobs/ReworkSchedulePlacementDialog";
import { ReworkBadge } from "../common/ReworkBadge";
import { PaymentHoldBanner } from "../common/PaymentHoldBanner";

// Normalize status variants from backend
const normalizeStatus = (status?: string): 'pending' | 'active' | 'completed' | 'skipped' | 'on_hold' | 'changes_requested' => {
  if (status === 'in_progress') return 'active';
  if (!status) return 'pending';
  return status as 'pending' | 'active' | 'completed' | 'skipped' | 'on_hold' | 'changes_requested';
};

interface EnhancedJobDetailsModalProps {
  job: ScheduledJobStage | null;
  isOpen: boolean;
  onClose: () => void;
  onStartJob?: (jobId: string) => Promise<boolean>;
  onCompleteJob?: (jobId: string) => Promise<boolean>;
  scanCompleted?: boolean;
}

export const EnhancedJobDetailsModal: React.FC<EnhancedJobDetailsModalProps> = ({
  job,
  isOpen,
  onClose,
  onStartJob,
  onCompleteJob,
  scanCompleted: externalScanCompleted = false
}) => {
  const [operatorNotes, setOperatorNotes] = useState("");
  const [reworkReason, setReworkReason] = useState("");
  const [qualityIssue, setQualityIssue] = useState("");
  const [activeTab, setActiveTab] = useState("scanning");
  const [scanRequired, setScanRequired] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [showPartialRework, setShowPartialRework] = useState(false);
  const [showReworkSchedule, setShowReworkSchedule] = useState(false);
  const [reworkStageIds, setReworkStageIds] = useState<string[]>([]);
  const [reworkQty, setReworkQty] = useState(0);
  
  const { holdStage, resumeStage, isProcessing: stageActionsProcessing } = useStageActions();
  const { generic: paperSpecs, sheetSize, isLoading: specsLoading } = useJobPaperSpecs(job?.job_id || "");
  
  // Use external scan state (managed by parent)
  const scanCompleted = externalScanCompleted;

  // Reset tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab("scanning");
    }
  }, [isOpen]);

  if (!job) return null;

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    try {
      return format(new Date(dateString), 'PPP p');
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusInfo = () => {
    const normalizedStatus = normalizeStatus(job.status);
    
    if (normalizedStatus === 'on_hold') {
      return { 
        text: 'On Hold', 
        color: 'bg-orange-100 text-orange-800 border-orange-300',
        icon: Pause,
        canComplete: true,
        canStart: false,
        canHold: false,
        canResume: true
      };
    }
    if (normalizedStatus === 'active') {
      return { 
        text: 'In Progress', 
        color: 'bg-green-100 text-green-800 border-green-300',
        icon: Timer,
        canComplete: true,
        canStart: false,
        canHold: true,
        canResume: false
      };
    }
    if (job.is_ready_now) {
      return { 
        text: 'Ready to Start', 
        color: 'bg-blue-100 text-blue-800 border-blue-300',
        icon: Play,
        canComplete: false,
        canStart: true,
        canHold: false,
        canResume: false
      };
    }
    if (job.is_scheduled_later) {
      return { 
        text: 'Scheduled Later', 
        color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        icon: Clock,
        canComplete: false,
        canStart: false,
        canHold: false,
        canResume: false
      };
    }
    if (job.is_waiting_for_dependencies) {
      return { 
        text: 'Waiting for Dependencies', 
        color: 'bg-gray-100 text-gray-800 border-gray-300',
        icon: Pause,
        canComplete: false,
        canStart: false,
        canHold: false,
        canResume: false
      };
    }
    return { 
      text: 'Pending', 
      color: 'bg-gray-100 text-gray-800 border-gray-300',
      icon: Timer,
      canComplete: false,
      canStart: false,
      canHold: false,
      canResume: false
    };
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Debug logging for troubleshooting
  console.debug('EnhancedJobDetailsModal render', { 
    jobId: job.id, 
    rawStatus: job.status, 
    normalizedStatus: normalizeStatus(job.status),
    scanCompleted,
    flags: statusInfo 
  });

  const handleStartJob = async () => {
    if (!onStartJob) return;
    
    if (!scanCompleted) {
      toast.error('Please scan the job QR code before starting');
      setActiveTab('scanning');
      return;
    }
    
    setIsProcessing(true);
    try {
      const success = await onStartJob(job.id);
      if (success) {
        toast.success(`Started job ${job.wo_no}`);
        onClose();
      }
    } catch (error) {
      toast.error('Failed to start job');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteJob = async () => {
    if (!onCompleteJob) return;
    
    setIsProcessing(true);
    try {
      const success = await onCompleteJob(job.id);
      if (success) {
        toast.success(`Completed job ${job.wo_no}`);
        onClose();
      }
    } catch (error) {
      toast.error('Failed to complete job');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHoldStage = async (percentage: number, reason: string) => {
    const success = await holdStage(job.id, percentage, reason);
    if (success) {
      setShowHoldDialog(false);
      onClose();
    }
  };

  const handleResumeStage = async () => {
    const success = await resumeStage(job.id);
    if (success) {
      onClose();
    }
  };

  const handleMarkForRework = () => {
    setShowPartialRework(true);
  };

  const handleReworkCreated = (stageIds: string[]) => {
    setReworkStageIds(stageIds);
    setReworkQty(job.qty || 0); // will be overridden with actual shortfall
    setShowPartialRework(false);
    setShowReworkSchedule(true);
  };

  const handleQualityHold = () => {
    if (!qualityIssue.trim()) {
      toast.error('Please specify the quality issue');
      return;
    }
    // TODO: Implement quality hold functionality
    toast.info('Quality hold functionality coming soon');
  };

  const generateQRCode = () => {
    // For now, just a simple string - in real implementation, this would be a proper QR code
    return `JOB:${job.wo_no}:STAGE:${job.stage_name}:ID:${job.id}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl w-full h-[95vh] max-h-[95vh] overflow-y-auto p-3 sm:p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            {job.wo_no} - {job.stage_name}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="scanning">Overview & Scanning</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="notes">Notes & Issues</TabsTrigger>
            <TabsTrigger value="details">Job Details</TabsTrigger>
          </TabsList>

          <TabsContent value="operations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Stage Operations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SubTaskList
                  stageInstanceId={job.id}
                  mode="interactive"
                  showActions={true}
                  stageStatus={job.status}
                  onSubTaskComplete={() => {
                    toast.success('Operations updated');
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scanning" className="space-y-6">
            {/* Input Focus Warning */}
            {inputFocused && !scanCompleted && (
              <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 rounded flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-700" />
                <p className="text-yellow-800 text-sm font-medium">
                  Scanning paused - click outside text fields to enable scanner
                </p>
              </div>
            )}
            
            {/* Mandatory Scanning Section */}
            <Card className={cn("border-2", scanCompleted ? "border-green-500 bg-green-50" : "border-orange-500 bg-orange-50")}>
              <CardHeader>
                <CardTitle className={cn("text-lg flex items-center gap-2", scanCompleted ? "text-green-700" : "text-orange-700")}>
                  <Scan className="w-5 h-5" />
                  {scanCompleted ? "✓ Job Scanned Successfully" : "⚠ Scan Required Before Starting"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-white p-4 rounded-lg border text-center">
                  <QrCode className="w-20 h-20 text-gray-400 mx-auto mb-3" />
                  <div className="text-base font-bold mb-1">{job.wo_no}</div>
                  <div className="text-sm text-gray-600 mb-2">{job.stage_name}</div>
                  <div className="text-xs font-mono bg-gray-100 p-1 rounded">
                    {generateQRCode()}
                  </div>
                </div>
                
                {!scanCompleted ? (
                  <div className="text-center text-orange-700 font-medium">
                    {inputFocused 
                      ? "⚠️ Click outside the text field to enable scanning"
                      : "Listening for barcode scan… Present the job QR code to the scanner."
                    }
                  </div>
                ) : (
                  <div className="text-center text-green-700 font-medium">
                    ✓ Ready to start production
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Job Overview */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-3xl font-bold text-gray-900">{job.wo_no}</h2>
                      <ReworkBadge reworkQty={(job as any).rework_qty} reworkPercentage={(job as any).rework_percentage} />
                    </div>
                    <p className="text-xl text-gray-600 mt-1">{job.customer}</p>
                    <div className="flex items-center gap-4 mt-4 text-lg text-gray-600">
                      <div className="flex items-center gap-2">
                        <Package className="w-5 h-5" />
                        <span className="font-medium">Qty:</span>
                        <span className="font-mono text-2xl font-bold">{job.qty.toLocaleString()}</span>
                      </div>
                      {job.due_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5" />
                          <span className="font-medium">Due:</span>
                          <span className="font-semibold">{format(new Date(job.due_date), 'MMM dd, yyyy')}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Print Specifications Row */}
                    <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-gray-200">
                      {specsLoading ? (
                        <div className="text-sm text-gray-500">Loading specifications...</div>
                      ) : (
                        <>
                          <SubSpecificationBadge 
                            jobId={job.job_id} 
                            stageId={job.id}
                            stageName={job.stage_name}
                            partAssignment={job.part_assignment}
                          />
                          {sheetSize && (
                            <PrintSpecsBadge 
                              sheetSize={sheetSize}
                              size="compact"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right space-y-3">
                    <Badge className={`${statusInfo.color} border px-4 py-2 text-lg`}>
                      <StatusIcon className="w-5 h-5 mr-2" />
                      {statusInfo.text}
                    </Badge>
                    <div className="text-lg font-medium text-gray-700">
                      {job.stage_name}
                    </div>
                    {(typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('ffdebug') === '1' || localStorage.getItem('ff-debug') === '1')) && (
                      <div className="text-xs text-gray-500 mt-1">
                        debug: status={job.status} normalized={normalizeStatus(job.status)} | canStart={String(statusInfo.canStart)} canHold={String(statusInfo.canHold)} canResume={String(statusInfo.canResume)} canComplete={String(statusInfo.canComplete)}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Hold Banner */}
            {(job as any).payment_status === 'awaiting_payment' && (
              <PaymentHoldBanner
                jobId={job.job_id}
                paymentStatus={(job as any).payment_status}
                paymentHoldReason={(job as any).payment_hold_reason}
                onReleased={onClose}
              />
            )}
          </TabsContent>

          <TabsContent value="details" className="space-y-6">
            {/* Job Header with Enhanced Status */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{job.wo_no}</h2>
                    <p className="text-lg text-gray-600 mt-1">{job.customer}</p>
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Package className="w-4 h-4" />
                        <span className="font-medium">Qty:</span>
                        <span className="font-mono text-lg">{job.qty.toLocaleString()}</span>
                      </div>
                      {job.due_date && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">Due:</span>
                          <span>{format(new Date(job.due_date), 'MMM dd, yyyy')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <Badge className={`${statusInfo.color} border px-4 py-2 text-sm`}>
                      <StatusIcon className="w-4 h-4 mr-2" />
                      {statusInfo.text}
                    </Badge>
                    {job.queue_position && (
                      <div className="text-sm text-gray-600">
                        Queue Position: #{job.queue_position}
                      </div>
                    )}
                  </div>
                </div>

                {/* Category & Stage Details */}
                <div className="grid grid-cols-2 gap-6 pt-4 border-t">
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">Category</h3>
                    <Badge 
                      variant="outline"
                      style={{ 
                        borderColor: job.category_color,
                        color: job.category_color 
                      }}
                      className="text-sm px-3 py-1"
                    >
                      {job.category_name}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">Current Stage</h3>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" style={{ color: job.stage_color }} />
                      <span className="font-medium" style={{ color: job.stage_color }}>
                        {job.stage_name}
                      </span>
                      <span className="text-sm text-gray-500">(Order: {job.stage_order})</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Scheduling Information */}
            {(job.scheduled_start_at || job.estimated_duration_minutes) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Scheduling Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {job.scheduled_start_at && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="font-medium text-gray-700">Scheduled Start:</span>
                      <span className="font-mono">{formatDate(job.scheduled_start_at)}</span>
                    </div>
                  )}
                  {job.scheduled_end_at && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="font-medium text-gray-700">Scheduled End:</span>
                      <span className="font-mono">{formatDate(job.scheduled_end_at)}</span>
                    </div>
                  )}
                  {job.estimated_duration_minutes && (
                    <div className="flex items-center justify-between py-2">
                      <span className="font-medium text-gray-700">Estimated Duration:</span>
                      <span className="font-mono">{Math.round(job.estimated_duration_minutes)} minutes</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {/* Print Specifications */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Printer className="w-5 h-5" />
                  Print Specifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {specsLoading ? (
                  <div className="text-sm text-gray-600">Loading specifications...</div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Use the same spec source as MasterOrderModal via SubSpecificationBadge */}
                    <SubSpecificationBadge 
                      jobId={job.job_id} 
                      stageId={job.id}
                      stageName={job.stage_name}
                      partAssignment={job.part_assignment}
                    />

                    {/* Keep existing sheet size display */}
                    {sheetSize && (
                      <PrintSpecsBadge 
                        sheetSize={sheetSize}
                        size="normal"
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workflow" className="space-y-6">
            {/* Workflow Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Production Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {statusInfo.canStart && (
                    <Button
                      onClick={handleStartJob}
                      disabled={isProcessing || !scanCompleted}
                      className={cn(
                        "h-12",
                        scanCompleted 
                          ? "bg-blue-600 hover:bg-blue-700" 
                          : "bg-gray-400 cursor-not-allowed"
                      )}
                    >
                      <Play className="w-5 h-5 mr-2" />
                      {scanCompleted ? "Start Production" : "Scan Required First"}
                    </Button>
                  )}
                  
                  {statusInfo.canComplete && (
                    <Button
                      onClick={handleCompleteJob}
                      disabled={isProcessing}
                      className="h-12 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Complete Stage
                    </Button>
                  )}
                </div>

                {job.status === 'active' && (
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={handleMarkForRework}
                      className="h-10 border-orange-200 text-orange-700 hover:bg-orange-50"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Partial Rework
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={handleQualityHold}
                      className="h-10 border-red-200 text-red-700 hover:bg-red-50"
                    >
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Quality Hold
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Part Assignment & Dependencies */}
            {(job.part_assignment || job.dependency_group) && (
              <div className="grid grid-cols-2 gap-4">
                {job.part_assignment && job.part_assignment !== 'both' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Part Assignment</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant="outline" className="text-sm">
                        {job.part_assignment}
                      </Badge>
                    </CardContent>
                  </Card>
                )}
                
                {job.dependency_group && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Dependencies</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {job.dependency_group}
                      </code>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes" className="space-y-6">
            {/* Operator Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <StickyNote className="w-5 h-5" />
                  Operator Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Add production notes, material observations, or completion comments..."
                  value={operatorNotes}
                  onChange={(e) => setOperatorNotes(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  rows={4}
                />
                <Button variant="outline" className="w-full">
                  <FileText className="w-4 h-4 mr-2" />
                  Save Notes
                </Button>
              </CardContent>
            </Card>

            {/* Rework Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-orange-700 flex items-center gap-2">
                  <RotateCcw className="h-5 w-5" />
                  Rework Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Need to reprint some copies due to damages? Use partial rework to send specific quantities back through the workflow.
                </p>
                <Button 
                  variant="outline" 
                  onClick={handleMarkForRework}
                  className="w-full border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Request Partial Rework
                </Button>
                
                {/* Show rework info if exists */}
                {(job as any).rework_qty && (
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                    <div className="flex items-center gap-2 mb-1">
                      <ReworkBadge reworkQty={(job as any).rework_qty} reworkPercentage={(job as any).rework_percentage} />
                    </div>
                    <p className="text-xs text-orange-700 mt-1">
                      Last rework requested: {(job as any).rework_requested_at ? format(new Date((job as any).rework_requested_at), 'PPP p') : 'Unknown'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quality Issues */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-red-700">Quality Control</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Describe quality issue or concern..."
                  value={qualityIssue}
                  onChange={(e) => setQualityIssue(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  rows={3}
                />
                <Button 
                  variant="outline" 
                  onClick={handleQualityHold}
                  className="w-full border-red-200 text-red-700 hover:bg-red-50"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Place Quality Hold
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="barcode" className="space-y-6">
            {/* QR Code for Scanning */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <QrCode className="w-5 h-5" />
                  Job QR Code
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="bg-gray-100 p-8 rounded-lg inline-block">
                  <QrCode className="w-24 h-24 text-gray-400 mx-auto" />
                  <p className="text-xs text-gray-600 mt-2">QR Code for {job.wo_no}</p>
                </div>
                <div className="text-sm font-mono bg-gray-50 p-3 rounded border">
                  {generateQRCode()}
                </div>
                <p className="text-sm text-gray-600">
                  Scan this code to quickly start or complete this job stage
                </p>
              </CardContent>
            </Card>

            {/* Mobile Scanner Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Scan className="w-5 h-5" />
                  Scanner Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full h-12">
                  <Scan className="w-5 h-5 mr-2" />
                  Scan to Start Job
                </Button>
                <Button variant="outline" className="w-full h-12">
                  <Scan className="w-5 h-5 mr-2" />
                  Scan to Complete Job
                </Button>
                <Button variant="outline" className="w-full h-12">
                  <Printer className="w-5 h-5 mr-2" />
                  Print Job Label
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal Footer Actions */}
        <div className="flex gap-3 pt-6 border-t">
          {normalizeStatus(job.status) === 'on_hold' && (
            <div className="flex-1 bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Pause className="h-5 w-5 text-orange-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-orange-900">Stage On Hold</p>
                  <p className="text-xs text-orange-700 mt-1">
                    {job.completion_percentage}% completed • {job.remaining_minutes} mins remaining
                  </p>
                  {job.hold_reason && (
                    <p className="text-xs text-orange-600 mt-1 italic">"{job.hold_reason}"</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {statusInfo.canStart && (
            <Button
              onClick={handleStartJob}
              disabled={isProcessing || stageActionsProcessing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Job
            </Button>
          )}
          
          {statusInfo.canHold && (
            <Button
              onClick={() => setShowHoldDialog(true)}
              disabled={isProcessing || stageActionsProcessing}
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <Pause className="w-4 h-4 mr-2" />
              Hold Job
            </Button>
          )}

          {statusInfo.canResume && (
            <Button
              onClick={handleResumeStage}
              disabled={isProcessing || stageActionsProcessing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className="w-4 h-4 mr-2" />
              Resume Job
            </Button>
          )}

          {statusInfo.canComplete && (
            <Button
              onClick={handleCompleteJob}
              disabled={isProcessing || stageActionsProcessing}
              className="bg-green-600 hover:bg-green-700"
            >
               <CheckCircle className="w-4 h-4 mr-2" />
              {normalizeStatus(job.status) === 'on_hold' ? 'Complete Remaining' : 'Complete Job'}
            </Button>
          )}

          <Button variant="outline" onClick={onClose} className="ml-auto">
            Close
          </Button>
        </div>

        <StageHoldDialog
          isOpen={showHoldDialog}
          onClose={() => setShowHoldDialog(false)}
          onConfirm={handleHoldStage}
          scheduledMinutes={job.scheduled_minutes || 0}
          stageName={job.stage_name}
          isProcessing={stageActionsProcessing}
        />

        <PartialReworkDialog
          isOpen={showPartialRework}
          onClose={() => setShowPartialRework(false)}
          jobId={job.job_id}
          jobTableName="production_jobs"
          woNo={job.wo_no}
          originalQty={job.qty || 0}
          onReworkCreated={handleReworkCreated}
        />

        <ReworkSchedulePlacementDialog
          isOpen={showReworkSchedule}
          onClose={() => setShowReworkSchedule(false)}
          stageIds={reworkStageIds}
          jobId={job.job_id}
          woNo={job.wo_no}
          reworkQty={reworkQty}
          onScheduled={() => {
            setShowReworkSchedule(false);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};