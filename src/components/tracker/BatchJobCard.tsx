import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Package, Users, CreditCard } from "lucide-react";
import { useBatchConstituentJobs } from "@/hooks/tracker/useBatchConstituentJobs";
import type { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface BatchJobCardProps {
  job: AccessibleJob;
  onJobAction?: (jobId: string, action: string) => void;
  onBatchStageComplete?: (batchJobId: string, nextStageId?: string) => void;
  showActions?: boolean;
}

export const BatchJobCard = ({ job, onJobAction, onBatchStageComplete, showActions = true }: BatchJobCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { constituentJobs, isLoading } = useBatchConstituentJobs(job.batch_name);

  const handleAction = async (action: string) => {
    if (action === 'complete' && onBatchStageComplete) {
      // For batch jobs, handle completion differently
      await onBatchStageComplete(job.job_id);
    } else if (onJobAction) {
      onJobAction(job.job_id, action);
    }
  };

  return (
    <Card className="border-l-4" style={{ borderLeftColor: job.category_color }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Package className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">{job.wo_no}</CardTitle>
            <Badge variant="secondary" className="text-xs">
              Batch Master
            </Badge>
            {job.payment_status === 'awaiting_payment' && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0">
                <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                AWAITING PAYMENT
              </Badge>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Badge 
              variant="outline" 
              className="text-xs"
              style={{ 
                backgroundColor: `${job.current_stage_color}20`,
                borderColor: job.current_stage_color,
                color: job.current_stage_color
              }}
            >
              {job.display_stage_name}
            </Badge>
            {showActions && (
              <div className="flex space-x-1">
                {job.user_can_work && job.current_stage_status === 'pending' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction('start')}
                    className="h-6 px-2 text-xs"
                  >
                    Start
                  </Button>
                )}
                {job.user_can_work && job.current_stage_status === 'active' && (
                  <Button
                    size="sm"
                    onClick={() => handleAction('complete')}
                    className="h-6 px-2 text-xs"
                  >
                    Complete
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
          <div>
            <p className="text-muted-foreground">Customer</p>
            <p className="font-medium">{job.customer}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Due Date</p>
            <p className="font-medium">{job.due_date || 'No date set'}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {job.constituent_job_count || 0} constituent jobs
            </span>
          </div>
          
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="p-1">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="ml-1 text-xs">
                  {isExpanded ? 'Hide' : 'Show'} Jobs
                </span>
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="mt-3">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading constituent jobs...</div>
              ) : constituentJobs.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Constituent Jobs
                  </div>
                  {constituentJobs.map((constituentJob) => (
                    <div
                      key={constituentJob.id}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: constituentJob.category_color }}
                        />
                        <span className="font-medium">{constituentJob.wo_no}</span>
                        <span className="text-muted-foreground">
                          {constituentJob.customer}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-muted-foreground">
                          Qty: {constituentJob.qty}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {constituentJob.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No constituent jobs found</div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
};