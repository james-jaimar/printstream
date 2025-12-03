import React from 'react';
import { Send, Clock } from 'lucide-react';
import { AutoApprovedJob } from '@/hooks/tracker/useAutoApprovedJobs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { formatDistanceToNow } from 'date-fns';

interface AutoApprovedPrintQueueListProps {
  jobs: AutoApprovedJob[];
  onJobClick: (jobId: string) => void;
  onMarkFilesSent: (stageInstanceId: string) => Promise<boolean>;
  showAllJobs?: boolean;
  onToggleShowAll?: (show: boolean) => void;
  myJobsCount?: number;
  allJobsCount?: number;
}

export const AutoApprovedPrintQueueList: React.FC<AutoApprovedPrintQueueListProps> = ({
  jobs,
  onJobClick,
  onMarkFilesSent,
  showAllJobs = true,
  onToggleShowAll,
  myJobsCount = 0,
  allJobsCount = 0
}) => {
  const hasToggle = onToggleShowAll !== undefined;

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">
          {hasToggle && !showAllJobs 
            ? 'No jobs you worked on pending'
            : 'No auto-approved jobs pending'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hasToggle && (
        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg mb-3">
          <span className="text-xs text-muted-foreground">
            {showAllJobs 
              ? `Showing all ${allJobsCount} jobs` 
              : `My jobs (${myJobsCount} of ${allJobsCount})`
            }
          </span>
          <div className="flex items-center gap-2">
            <Switch 
              checked={showAllJobs}
              onCheckedChange={onToggleShowAll}
            />
            <span className="text-xs font-medium">
              {showAllJobs ? 'All' : 'Mine'}
            </span>
          </div>
        </div>
      )}
      
      {jobs.map((job) => (
        <div
          key={job.id}
          className="bg-background border border-border rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-green-500"
          onClick={() => onJobClick(job.job_id)}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h4 className="font-semibold text-sm">{job.wo_no}</h4>
              <p className="text-xs text-muted-foreground">{job.customer}</p>
              {job.client_name && (
                <p className="text-xs text-muted-foreground">Client: {job.client_name}</p>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {job.stage_name}
            </Badge>
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
            <Clock className="h-3 w-3" />
            <span>
              Approved {formatDistanceToNow(new Date(job.proof_approved_manually_at), { addSuffix: true })}
            </span>
          </div>

          <Button
            size="sm"
            variant="default"
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={(e) => {
              e.stopPropagation();
              onMarkFilesSent(job.id);
            }}
          >
            <Send className="h-3 w-3 mr-1" />
            Files Sent to Printer
          </Button>
        </div>
      ))}
    </div>
  );
};
