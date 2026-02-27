
import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal, 
  Edit, 
  Tags, 
  Settings, 
  Trash2,
  Package,
  CreditCard
} from "lucide-react";
import { JobActionButtons } from "@/components/tracker/common/JobActionButtons";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";
import { usePartialRework } from "@/hooks/tracker/usePartialRework";

interface JobRowProps {
  job: AccessibleJob;
  isSelected: boolean;
  hasCustomWorkflow: boolean;
  rowColorClass: string;
  onSelectJob: (job: AccessibleJob, checked: boolean) => void;
  onStartJob: (jobId: string, stageId: string) => Promise<boolean>;
  onCompleteJob: (jobId: string, stageId: string) => Promise<boolean>;
  onEditJob: (job: AccessibleJob) => void;
  onCategoryAssign: (job: AccessibleJob) => void;
  onCustomWorkflow: (job: AccessibleJob) => void;
  onDeleteJob: (jobId: string) => void;
  onAssignParts?: (job: AccessibleJob) => void; // Added for part assignment functionality
}

// Inline payment hold menu item component
const PaymentHoldMenuItem: React.FC<{ job: AccessibleJob }> = ({ job }) => {
  const { isProcessing, releasePaymentHold, setPaymentHold } = usePartialRework();
  const isAwaiting = job.payment_status === 'awaiting_payment';
  
  return (
    <DropdownMenuItem
      onClick={async () => {
        if (isAwaiting) {
          await releasePaymentHold(job.job_id);
        } else {
          await setPaymentHold(job.job_id, 'Manually placed on hold');
        }
      }}
      disabled={isProcessing}
    >
      <CreditCard className="h-4 w-4 mr-2" />
      {isAwaiting ? 'Release Payment Hold' : 'Hold for Payment'}
    </DropdownMenuItem>
  );
};

export const JobRow: React.FC<JobRowProps> = ({
  job,
  isSelected,
  hasCustomWorkflow,
  rowColorClass,
  onSelectJob,
  onStartJob,
  onCompleteJob,
  onEditJob,
  onCategoryAssign,
  onCustomWorkflow,
  onDeleteJob,
  onAssignParts // Added for part assignment functionality
}) => {
  return (
    <div 
      className={`flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-blue-50 border-blue-200' : rowColorClass
      }`}
    >
      <div className="flex items-center gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onSelectJob(job, checked as boolean)}
        />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h4 className="font-medium text-lg">{job.wo_no}</h4>
            {hasCustomWorkflow ? (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                <Settings className="h-3 w-3 mr-1" />
                Custom Workflow
              </Badge>
            ) : job.category_name && job.category_name !== 'No Category' ? (
              <Badge variant="secondary" style={{ backgroundColor: job.category_color || '#6B7280', color: 'white' }}>
                {job.category_name}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-gray-600">
                No Category
              </Badge>
            )}
            {job.current_stage_name && (
              <Badge 
                variant={job.current_stage_status === 'active' ? 'default' : 'outline'}
                style={{ 
                  backgroundColor: job.current_stage_status === 'active' ? job.current_stage_color || '#22C55E' : 'transparent',
                  borderColor: job.current_stage_color || '#6B7280',
                  color: job.current_stage_status === 'active' ? 'white' : job.current_stage_color || '#6B7280'
                }}
              >
                {job.current_stage_name}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {Math.round(job.workflow_progress)}% Complete
            </Badge>
          </div>
          <div className="text-sm text-gray-600 mt-1">
            <span>Customer: {job.customer || 'Unknown'}</span>
            {job.due_date && (
              <span> • Due: {new Date(job.due_date).toLocaleDateString()}</span>
            )}
            {job.reference && (
              <span> • Reference: {job.reference}</span>
            )}
            <span> • Stages: {job.completed_stages}/{job.total_stages}</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <JobActionButtons
          job={job}
          onStart={onStartJob}
          onComplete={onCompleteJob}
        />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onEditJob(job)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Job
            </DropdownMenuItem>
            
            <DropdownMenuItem onClick={() => onCategoryAssign(job)}>
              <Tags className="h-4 w-4 mr-2" />
              Assign Category
            </DropdownMenuItem>
            
            <DropdownMenuItem onClick={() => onCustomWorkflow(job)}>
              <Settings className="h-4 w-4 mr-2" />
              Custom Workflow
            </DropdownMenuItem>
            
            {onAssignParts && (
              <DropdownMenuItem onClick={() => onAssignParts(job)}>
                <Package className="h-4 w-4 mr-2" />
                Assign Parts
              </DropdownMenuItem>
            )}

            <PaymentHoldMenuItem job={job} />
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem 
              onClick={() => onDeleteJob(job.job_id)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Job
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
