import React from "react";
import { Button } from "@/components/ui/button";
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
  Trash2, 
  Play,
  CheckCircle,
  RefreshCw,
  CreditCard
} from "lucide-react";
import { MobileJobActions } from "./MobileJobActions";
import { usePartialRework } from "@/hooks/tracker/usePartialRework";

interface JobTableActionsProps {
  job: any;
  onJobUpdate: () => void;
  onEditJob: (job: any) => void;
  onSyncJob: (job: any) => void;
  onCategoryAssign: (job: any) => void;
  onWorkflowInit: (job: any) => void;
  onDeleteJob: (jobId: string) => void;
}

export const JobTableActions: React.FC<JobTableActionsProps> = ({
  job,
  onJobUpdate,
  onEditJob,
  onSyncJob,
  onCategoryAssign,
  onWorkflowInit,
  onDeleteJob
}) => {
  // Prevent multiple rapid clicks
  const [actionPending, setActionPending] = React.useState(false);
  const { isProcessing: paymentProcessing, releasePaymentHold, setPaymentHold } = usePartialRework();
  const isAwaitingPayment = job.payment_status === 'awaiting_payment';

  const handleAction = (action: () => void) => {
    if (actionPending) return;
    setActionPending(true);
    setTimeout(() => {
      setActionPending(false);
      action();
    }, 200);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Mobile Actions (visible on mobile) */}
      <div className="md:hidden">
        <MobileJobActions
          job={job}
          onJobUpdate={onJobUpdate}
          onEditJob={() => onEditJob(job)}
          onSyncJob={() => onSyncJob(job)}
        />
      </div>

      {/* Desktop Actions (hidden on mobile) */}
      <div className="hidden md:block">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAction(() => onEditJob(job));
              }}
              disabled={actionPending}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Job
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAction(() => onSyncJob(job));
              }}
              disabled={actionPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Data
            </DropdownMenuItem>
            {!job.category_id && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAction(() => onCategoryAssign(job));
                }}
                disabled={actionPending}
              >
                <Play className="h-4 w-4 mr-2" />
                Assign Category
              </DropdownMenuItem>
            )}
            {job.category_id && !job.has_workflow && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAction(() => onWorkflowInit(job));
                }}
                disabled={actionPending}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Initialize Workflow
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isAwaitingPayment) {
                  await releasePaymentHold(job.id);
                } else {
                  await setPaymentHold(job.id, 'Manually placed on hold');
                }
              }}
              disabled={actionPending || paymentProcessing}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              {isAwaitingPayment ? 'Release Payment Hold' : 'Hold for Payment'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAction(() => onDeleteJob(job.id));
              }}
              onSelect={(e) => e.preventDefault()}
              className="text-red-600"
              disabled={actionPending}
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
