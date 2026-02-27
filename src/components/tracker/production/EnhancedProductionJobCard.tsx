
import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  User, 
  Package, 
  MapPin, 
  Clock,
  CheckCircle,
  Play,
  MoreHorizontal,
  CreditCard
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { JobSpecificationCard } from "../common/JobSpecificationCard";
import { PartAssignmentIndicator } from "../common/PartAssignmentIndicator";
import { StageProgressIndicator } from "../common/StageProgressIndicator";
import { SubSpecificationBadge } from "../common/SubSpecificationBadge";
import { ProofStatusIndicator } from "../factory/ProofStatusIndicator";
import { EnhancedDueDateDisplay } from "./EnhancedDueDateDisplay";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs/types";
import { getStageContextForJob, canStartContextStage, canCompleteContextStage } from "@/utils/stageContextUtils";
import { cn } from "@/lib/utils";

interface EnhancedProductionJobCardProps {
  job: AccessibleJob;
  contextStageName?: string | null;
  onJobClick?: (job: AccessibleJob) => void;
  onStageAction?: (jobId: string, stageId: string, action: 'start' | 'complete') => void;
  onAssignParts?: (job: AccessibleJob) => void;
  showDetails?: boolean;
  disableSpecifications?: boolean;
}

export const EnhancedProductionJobCard: React.FC<EnhancedProductionJobCardProps> = ({
  job,
  contextStageName,
  onJobClick,
  onStageAction,
  onAssignParts,
  showDetails = true,
  disableSpecifications = false
}) => {
  const isOverdue = job.due_date && new Date(job.due_date) < new Date();
  const isDueSoon = job.due_date && !isOverdue && 
    new Date(job.due_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  // Get stage context for this job
  const stageContext = getStageContextForJob(job, contextStageName);
  const canStart = canStartContextStage(job, stageContext);
  const canComplete = canCompleteContextStage(job, stageContext);

  // Check for proof-related current stage
  const isProofStage = job.current_stage_name?.toLowerCase().includes('proof');
  const hasProofData = job.proof_emailed_at || isProofStage;
  
  // Create a stage instance for ProofStatusIndicator if this is a proof stage
  const proofStageInstance = hasProofData ? {
    status: job.current_stage_status,
    proof_emailed_at: job.proof_emailed_at,
    client_email: job.contact, // Using contact field as client_email
    client_name: job.customer,
    updated_at: undefined
  } : null;

  // Determine card styling based on proof status
  const getCardClassName = () => {
    if (isProofStage && job.current_stage_status === 'completed') {
      return cn(
        "transition-all duration-200 hover:shadow-md cursor-pointer relative",
        "factory-success border-green-500 bg-green-50/30"
      );
    }
    
    if (job.proof_emailed_at) {
      const elapsed = Date.now() - new Date(job.proof_emailed_at).getTime();
      const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
      
      if (days >= 3) {
        return cn(
          "transition-all duration-200 hover:shadow-md cursor-pointer relative",
          "factory-critical border-red-500 bg-red-50/30 factory-pulse"
        );
      } else if (days >= 1) {
        return cn(
          "transition-all duration-200 hover:shadow-md cursor-pointer relative",
          "factory-warning border-orange-500 bg-orange-50/30"
        );
      } else {
        return cn(
          "transition-all duration-200 hover:shadow-md cursor-pointer relative",
          "factory-info border-blue-500 bg-blue-50/30"
        );
      }
    }
    
    return cn(
      "transition-all duration-200 hover:shadow-md cursor-pointer relative",
      isOverdue ? 'border-red-300 bg-red-50' : 
      isDueSoon ? 'border-orange-300 bg-orange-50' : 
      'border-gray-200 bg-white'
    );
  };

  return (
    <Card 
      className={getCardClassName()}
      onClick={() => onJobClick?.(job)}
    >
      {/* Proof Status Corner Badge */}
      {proofStageInstance && (
        <ProofStatusIndicator 
          stageInstance={proofStageInstance}
          variant="corner-badge"
          showTimeElapsed={false}
        />
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
            <Badge 
                variant={stageContext.stageStatus === 'active' ? 'default' : 'secondary'}
                className="font-semibold"
              >
                {job.wo_no}
              </Badge>
              {isOverdue && (
                <Badge variant="destructive" className="text-xs">
                  Overdue
                </Badge>
              )}
              {job.payment_status === 'awaiting_payment' && (
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0">
                  <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                  AWAITING PAYMENT
                </Badge>
              )}
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-sm">
                <User className="h-3 w-3 text-gray-400" />
                <span className="truncate">{job.customer || 'Unknown Customer'}</span>
              </div>
              
              <EnhancedDueDateDisplay 
                job={job} 
                showTrafficLight={true} 
                variant="compact"
                className="text-sm"
              />
              
              {job.qty && (
                <div className="flex items-center gap-1 text-sm">
                  <Package className="h-3 w-3 text-gray-400" />
                  <span>Qty: {job.qty}</span>
                </div>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onAssignParts && (
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  onAssignParts(job);
                }}>
                  <Package className="h-4 w-4 mr-2" />
                  Assign Parts
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stage Progress */}
        <StageProgressIndicator
          stages={[]} // Would need to pass actual stage data
          currentStageId={stageContext.stageId}
          workflowProgress={job.workflow_progress}
          compact={true}
          showPartInfo={true}
          jobId={job.job_id}
        />

        {/* Current Stage Sub-Specifications */}
        {!disableSpecifications && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-600">
              {stageContext.stageName} Details:
            </div>
            <SubSpecificationBadge 
              jobId={job.job_id}
              stageId={stageContext.stageId}
              stageName={stageContext.stageName}
              compact={false}
            />
          </div>
        )}

        {/* Job Specifications */}
        {showDetails && !disableSpecifications && (
          <JobSpecificationCard
            jobId={job.job_id}
            jobTableName="production_jobs"
            compact={true}
          />
        )}

        {/* Part Assignment Status */}
        <PartAssignmentIndicator
          categoryId={job.category_id}
          compact={true}
        />

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t">
          {canStart && stageContext.stageId && (
            <Button 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                onStageAction?.(job.job_id, stageContext.stageId, 'start');
              }}
              className="flex-1"
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
          )}
          
          {canComplete && stageContext.stageId && (
            <Button 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                onStageAction?.(job.job_id, stageContext.stageId, 'complete');
              }}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Complete
            </Button>
          )}
          
          {!canStart && !canComplete && (
            <div className="text-xs text-gray-500 text-center flex-1 py-2">
              {stageContext.stageStatus === 'completed' ? 'Stage Completed' : 'Waiting'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
