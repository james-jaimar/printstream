
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  User, 
  Package, 
  Play,
  CheckCircle,
  Clock,
  CreditCard
} from "lucide-react";
import { JobSpecificationCard } from "../common/JobSpecificationCard";
import { PartAssignmentIndicator } from "../common/PartAssignmentIndicator";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";

interface EnhancedKanbanJobCardProps {
  job: AccessibleJob;
  onStart?: (jobId: string, stageId: string) => Promise<boolean>;
  onComplete?: (jobId: string, stageId: string) => Promise<boolean>;
  onJobClick?: (job: AccessibleJob) => void;
  currentStageId?: string;
}

export const EnhancedKanbanJobCard: React.FC<EnhancedKanbanJobCardProps> = ({
  job,
  onStart,
  onComplete,
  onJobClick,
  currentStageId
}) => {
  const isOverdue = job.due_date && new Date(job.due_date) < new Date();
  const isDueSoon = job.due_date && !isOverdue && 
    new Date(job.due_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const canStart = job.user_can_work && job.current_stage_status === 'pending' && currentStageId;
  const canComplete = job.user_can_work && job.current_stage_status === 'active' && currentStageId;

  return (
    <Card 
      className={`transition-all duration-200 hover:shadow-md cursor-pointer ${
        isOverdue ? 'border-red-300 bg-red-50' : 
        isDueSoon ? 'border-orange-300 bg-orange-50' : 
        job.current_stage_status === 'active' ? 'border-blue-300 bg-blue-50' :
        'border-gray-200 bg-white'
      }`}
      onClick={() => onJobClick?.(job)}
    >
      <CardContent className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Badge 
              variant={job.current_stage_status === 'active' ? 'default' : 'secondary'}
              className="font-semibold text-xs"
            >
              {job.wo_no}
            </Badge>
            {isOverdue && (
              <Badge variant="destructive" className="text-xs ml-1">
                Overdue
              </Badge>
            )}
            {job.payment_status === 'awaiting_payment' && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0 ml-1">
                <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                AWAITING PAYMENT
              </Badge>
            )}
          </div>
          
          {job.current_stage_status === 'active' && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs text-blue-600 font-medium">Active</span>
            </div>
          )}
        </div>

        {/* Job Info */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs">
            <User className="h-3 w-3 text-gray-400" />
            <span className="truncate font-medium">{job.customer || 'Unknown'}</span>
          </div>
          
          {job.due_date && (
            <div className="flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3 text-gray-400" />
              <span className={
                isOverdue ? 'text-red-600 font-medium' : 
                isDueSoon ? 'text-orange-600 font-medium' : 
                'text-gray-600'
              }>
                {new Date(job.due_date).toLocaleDateString()}
              </span>
            </div>
          )}
          
          {job.qty && (
            <div className="flex items-center gap-1 text-xs">
              <Package className="h-3 w-3 text-gray-400" />
              <span>Qty: {job.qty}</span>
            </div>
          )}
        </div>

        {/* Specifications */}
        <JobSpecificationCard
          jobId={job.job_id}
          jobTableName="production_jobs"
          compact={true}
        />

        {/* Part Assignment */}
        <PartAssignmentIndicator
          categoryId={job.category_id}
          compact={true}
        />

        {/* Actions */}
        {(canStart || canComplete) && (
          <div className="flex gap-1 pt-2 border-t">
            {canStart && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onStart?.(job.job_id, currentStageId!);
                }}
                className="flex-1 h-7 text-xs"
              >
                <Play className="h-3 w-3 mr-1" />
                Start
              </Button>
            )}
            
            {canComplete && (
              <Button 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete?.(job.job_id, currentStageId!);
                }}
                className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Complete
              </Button>
            )}
          </div>
        )}

        {/* Status Indicator */}
        {!canStart && !canComplete && (
          <div className="flex items-center justify-center gap-1 pt-2 border-t">
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-500">
              {job.current_stage_status === 'completed' ? 'Completed' : 'Waiting'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
