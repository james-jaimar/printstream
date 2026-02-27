import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  User, 
  Package, 
  Play,
  CheckCircle,
  MoreHorizontal,
  CreditCard
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs/types";
import { SubSpecificationBadge } from "../common/SubSpecificationBadge";
import { ProofStatusIndicator } from "../factory/ProofStatusIndicator";
import { EnhancedDueDateDisplay } from "./EnhancedDueDateDisplay";
import { getStageContextForJob, canStartContextStage, canCompleteContextStage } from "@/utils/stageContextUtils";
import { cn } from "@/lib/utils";

interface ProductionJobsListProps {
  jobs: AccessibleJob[];
  contextStageName?: string | null;
  onJobClick: (job: AccessibleJob) => void;
  onStageAction: (jobId: string, stageId: string, action: 'start' | 'complete' | 'qr-scan') => void;
  onAssignParts?: (job: AccessibleJob) => void;
  disableSpecifications?: boolean;
}

export const ProductionJobsList: React.FC<ProductionJobsListProps> = ({
  jobs,
  contextStageName,
  onJobClick,
  onStageAction,
  onAssignParts,
  disableSpecifications = false
}) => {
  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="bg-gray-50 border-b px-4 py-3">
        <div className="grid grid-cols-12 gap-4 items-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
          <div className="col-span-2">Job</div>
          <div className="col-span-2">Customer</div>
          <div className="col-span-1">Due Date</div>
          <div className="col-span-1">Qty</div>
          <div className="col-span-2">Current Stage</div>
          <div className="col-span-3">Sub-Specifications</div>
          <div className="col-span-1">Actions</div>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y">
        {jobs.map((job) => {
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
      client_email: job.contact,
      client_name: job.customer,
      updated_at: undefined
    } : null;

    // Determine row styling based on proof status
    const getRowClassName = () => {
      if (isProofStage && job.current_stage_status === 'completed') {
        return "factory-success bg-green-50/50 hover:bg-green-100/50";
      }
      
      if (job.proof_emailed_at) {
        const elapsed = Date.now() - new Date(job.proof_emailed_at).getTime();
        const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
        
        if (days >= 3) {
          return "factory-critical bg-red-50/50 hover:bg-red-100/50";
        } else if (days >= 1) {
          return "factory-warning bg-orange-50/50 hover:bg-orange-100/50";
        } else {
          return "factory-info bg-blue-50/50 hover:bg-blue-100/50";
        }
      }
      
      return isOverdue 
        ? "bg-red-50 hover:bg-red-100" 
        : isDueSoon 
        ? "bg-orange-50 hover:bg-orange-100" 
        : "hover:bg-gray-50";
    };

          return (
            <div 
              key={job.job_id}
              className={cn(
                "grid grid-cols-12 gap-4 items-center px-4 py-3 cursor-pointer transition-colors",
                getRowClassName()
              )}
              onClick={() => onJobClick(job)}
            >
              {/* Job */}
              <div className="col-span-2 relative">
                <div className="flex items-center gap-2">
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
                
                {/* Proof Status Indicator */}
                {proofStageInstance && (
                  <div className="mt-1">
                    <ProofStatusIndicator 
                      stageInstance={proofStageInstance}
                      variant="default"
                      showTimeElapsed={true}
                    />
                  </div>
                )}
              </div>

              {/* Customer */}
              <div className="col-span-2">
                <div className="flex items-center gap-1 text-sm">
                  <User className="h-3 w-3 text-gray-400" />
                  <span className="truncate">{job.customer || 'Unknown Customer'}</span>
                </div>
              </div>

              {/* Due Date */}
              <div className="col-span-1">
                <EnhancedDueDateDisplay 
                  job={job} 
                  showTrafficLight={true} 
                  variant="compact"
                  className="text-sm"
                />
              </div>

              {/* Quantity */}
              <div className="col-span-1">
                {job.qty && (
                  <div className="flex items-center gap-1 text-sm">
                    <Package className="h-3 w-3 text-gray-400" />
                    <span>{job.qty}</span>
                  </div>
                )}
              </div>

              {/* Current Stage */}
              <div className="col-span-2">
                <Badge variant="outline" className="text-xs">
                  {stageContext.stageName || 'Unknown Stage'}
                </Badge>
              </div>

              {/* Sub-Specifications */}
              <div className="col-span-3">
                {!disableSpecifications && (
                  <SubSpecificationBadge 
                    jobId={job.job_id}
                    stageId={stageContext.stageId}
                    stageName={stageContext.stageName}
                    compact={true}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="col-span-1">
                <div className="flex items-center gap-1">
                  {canStart && stageContext.stageId && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStageAction(job.job_id, stageContext.stageId, 'start');
                      }}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  )}
                  
                  {canComplete && stageContext.stageId && (
                    <Button 
                      size="sm" 
                      onClick={(e) => {
                        e.stopPropagation();
                        onStageAction(job.job_id, stageContext.stageId, 'complete');
                      }}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-3 w-3" />
                    </Button>
                  )}

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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};