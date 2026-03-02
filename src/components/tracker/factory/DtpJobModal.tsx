import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Hash, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";
import { JobOverviewCard } from "./JobOverviewCard";
import { CurrentStageCard } from "./CurrentStageCard";
import { getJobStatusBadgeInfo } from "@/hooks/tracker/useAccessibleJobs/jobStatusProcessor";
import { DtpStageActions } from "./dtp/DtpStageActions";
import { ProofStageActions } from "./dtp/ProofStageActions";
import { useDtpJobModal } from "./dtp/useDtpJobModal";

interface DtpJobModalProps {
  job: AccessibleJob;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  scanCompleted?: boolean;
  onStartJob?: (jobId: string, stageId: string) => Promise<boolean>;
  onCompleteJob?: (jobId: string, stageId: string) => Promise<boolean>;
  // Backward compatibility
  onStart?: (jobId: string, stageId?: string) => Promise<boolean>;
  onComplete?: (jobId: string, stageId?: string) => Promise<boolean>;
}

export const DtpJobModal: React.FC<DtpJobModalProps> = ({
  job,
  isOpen,
  onClose,
  onRefresh,
  scanCompleted = false,
  onStartJob,
  onCompleteJob,
  onStart,
  onComplete
}) => {
  const [notes, setNotes] = useState("");
  const [localJobStatus, setLocalJobStatus] = useState(job.status);
  const [localStageStatus, setLocalStageStatus] = useState<string>(() => {
    if (job.current_stage_id) {
      return 'pending';
    }
    return 'completed';
  });

  const {
    stageInstance,
    proofApprovalFlow,
    selectedBatchCategory,
    setProofApprovalFlow,
    setSelectedBatchCategory,
    isLoading,
    loadModalData,
    setStageInstance
  } = useDtpJobModal(job, isOpen);

  // Reset local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setNotes("");
      setLocalJobStatus(job.status);
      setLocalStageStatus(() => {
        if (job.current_stage_id) {
          return 'pending';
        }
        return 'completed';
      });
      loadModalData();
    }
  }, [isOpen, job.status, job.current_stage_id, loadModalData]);

  const statusBadgeInfo = getJobStatusBadgeInfo({
    ...job,
    status: localJobStatus,
    current_stage_status: localStageStatus
  });

  const getCurrentStage = (): 'dtp' | 'proof' | 'unknown' => {
    const stageName = job.current_stage_name?.toLowerCase() || '';
    
    if (stageName.includes('dtp') || stageName.includes('desktop')) {
      return 'dtp';
    } else if (stageName.includes('proof')) {
      return 'proof';
    }
    
    return 'unknown';
  };

  const getStageStatus = (): string => {
    // Use actual stage instance status from database, fallback to local state
    return stageInstance?.status || localStageStatus;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-4xl h-[90vh] max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Job Details: {job.wo_no}</span>
            <Badge 
              className={cn(statusBadgeInfo.className)}
              variant={statusBadgeInfo.variant}
            >
              {statusBadgeInfo.text}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mandatory Scanning Section */}
          <Card className={`border-2 ${scanCompleted ? "border-green-500 bg-green-50" : "border-orange-500 bg-orange-50"}`}>
            <CardHeader>
              <CardTitle className={`text-lg flex items-center gap-2 ${scanCompleted ? "text-green-700" : "text-orange-700"}`}>
                <Hash className="w-5 h-5" />
                {scanCompleted ? "✓ Work Order Scanned Successfully" : "⚠ Scan Required - Work Order: " + job.wo_no}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!scanCompleted ? (
                <div className="text-center text-orange-700 font-medium">
                  Listening for barcode scan… Present the work order barcode to the scanner.
                </div>
              ) : (
                <div className="text-center text-green-700 font-medium">
                  ✓ Ready to start/complete work
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <JobOverviewCard job={job} />
            <CurrentStageCard 
              job={{...job, status: localJobStatus, current_stage_status: localStageStatus}} 
              statusInfo={statusBadgeInfo} 
            />

            {/* Stage Actions */}
            {getCurrentStage() === 'dtp' && (
              <Card>
                <CardHeader>
                  <CardTitle>DTP Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <DtpStageActions
                    job={job}
                    stageStatus={getStageStatus()}
                    scanCompleted={scanCompleted}
                    onStart={onStartJob}
                    onComplete={onCompleteJob}
                    onRefresh={onRefresh}
                    onClose={onClose}
                    onReloadModal={loadModalData}
                  />
                </CardContent>
              </Card>
            )}

            {/* Proof Stage Actions */}
            {getCurrentStage() === 'proof' && (
              <Card>
                <CardHeader>
                  <CardTitle>Proof Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProofStageActions
                    job={job}
                    stageStatus={getStageStatus()}
                    stageInstance={stageInstance}
                    proofApprovalFlow={proofApprovalFlow}
                    selectedBatchCategory={selectedBatchCategory}
                    scanCompleted={scanCompleted}
                    isLoading={isLoading}
                    onRefresh={onRefresh}
                    onClose={onClose}
                    onProofApprovalFlowChange={setProofApprovalFlow}
                    onBatchCategoryChange={setSelectedBatchCategory}
                    setStageInstance={setStageInstance}
                    onReloadModal={loadModalData}
                  />
                </CardContent>
              </Card>
            )}

          {/* Notes Section - Only show when stage is active AND scanned */}
          {getStageStatus() === 'active' && scanCompleted && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Production Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Add notes about this job (optional)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full"
                />
              </CardContent>
            </Card>
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};