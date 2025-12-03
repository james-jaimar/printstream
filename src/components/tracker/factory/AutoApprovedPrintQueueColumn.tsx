import React from 'react';
import { Send, Clock, CheckCircle } from 'lucide-react';
import { AutoApprovedJob } from '@/hooks/tracker/useAutoApprovedJobs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { formatDistanceToNow } from 'date-fns';

interface AutoApprovedPrintQueueColumnProps {
  jobs: AutoApprovedJob[];
  onJobClick: (jobId: string) => void;
  onMarkFilesSent: (stageInstanceId: string) => Promise<boolean>;
  showAllJobs?: boolean;
  onToggleShowAll?: (show: boolean) => void;
  myJobsCount?: number;
  allJobsCount?: number;
}

export const AutoApprovedPrintQueueColumn: React.FC<AutoApprovedPrintQueueColumnProps> = ({
  jobs,
  onJobClick,
  onMarkFilesSent,
  showAllJobs = true,
  onToggleShowAll,
  myJobsCount = 0,
  allJobsCount = 0
}) => {
  const handleMarkSent = async (e: React.MouseEvent, stageInstanceId: string) => {
    e.stopPropagation();
    await onMarkFilesSent(stageInstanceId);
  };

  const hasToggle = onToggleShowAll !== undefined;

  return (
    <div className="flex flex-col h-full bg-background rounded-lg border border-border overflow-hidden">
      <div className="flex-shrink-0 bg-green-600 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            <h3 className="font-semibold">Auto Approved - Send to Print</h3>
          </div>
          {hasToggle ? (
            <div className="flex items-center gap-2">
              <Switch 
                checked={showAllJobs}
                onCheckedChange={onToggleShowAll}
                className="data-[state=checked]:bg-white/30 data-[state=unchecked]:bg-white/20"
              />
              <span className="text-xs font-medium">
                {showAllJobs ? 'All' : 'Mine'}
              </span>
            </div>
          ) : (
            <Badge variant="secondary" className="bg-white/20 text-white">
              {jobs.length}
            </Badge>
          )}
        </div>
        <p className="text-xs text-white/80 mt-1">
          {hasToggle 
            ? (showAllJobs 
                ? `Showing all ${allJobsCount} jobs` 
                : `My jobs (${myJobsCount} of ${allJobsCount})`)
            : 'Client approved online - confirm print files sent'
          }
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
            <CheckCircle className="h-12 w-12 mb-2" />
            <p className="text-sm text-center">
              {hasToggle && !showAllJobs 
                ? 'No jobs you worked on pending file dispatch'
                : 'No auto-approved jobs pending file dispatch'
              }
            </p>
          </div>
        ) : (
          jobs.map((job) => (
            <Card
              key={job.id}
              className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500"
              onClick={() => onJobClick(job.job_id)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate">{job.wo_no}</h4>
                    <p className="text-xs text-muted-foreground truncate">{job.customer}</p>
                    {job.reference && (
                      <p className="text-xs text-muted-foreground truncate">{job.reference}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="ml-2 flex-shrink-0 text-xs">
                    {job.stage_name}
                  </Badge>
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                  <Clock className="h-3 w-3" />
                  <span>
                    Approved {formatDistanceToNow(new Date(job.proof_approved_manually_at), { addSuffix: true })}
                  </span>
                </div>

                {job.client_name && (
                  <div className="text-xs text-muted-foreground mb-2">
                    <span className="font-medium">Client:</span> {job.client_name}
                    {job.client_email && ` (${job.client_email})`}
                  </div>
                )}

                <Button
                  size="sm"
                  variant="default"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={(e) => handleMarkSent(e, job.id)}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Files Sent to Printer
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
