
import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, ChevronDown, Circle, CreditCard } from "lucide-react";
import { TrafficLightIndicator } from "./TrafficLightIndicator";

interface FilteredJobsViewProps {
  jobs: any[];
  selectedStage?: string;
  isLoading: boolean;
  onStageAction: (jobId: string, stageId: string, action: "start" | "complete" | "qr-scan") => void;
}

export const FilteredJobsView: React.FC<FilteredJobsViewProps> = ({
  jobs,
  selectedStage,
  isLoading,
  onStageAction
}) => {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const handleJobClick = (jobId: string) => {
    setSelectedJobId(prev => prev === jobId ? null : jobId);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-800 border-green-200";
      case "active": return "bg-blue-100 text-blue-800 border-blue-200";
      case "pending": return "bg-gray-100 text-gray-600 border-gray-200";
      default: return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  // Utility for colored dot per stage status
  const getStageDot = (status: string) => {
    let color = "text-gray-400";
    if (status === "completed") color = "text-green-500";
    else if (status === "active") color = "text-blue-500";
    else if (status === "pending") color = "text-gray-400";
    return <Circle className={`w-3 h-3 mr-1 ${color}`} fill="currentColor" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2" />
          <span>Loading jobs...</span>
        </CardContent>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-gray-500 text-lg">No jobs found</p>
          <p className="text-gray-400">Try adjusting your filters or stage selection</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {jobs.map((job) => (
        <React.Fragment key={job.id}>
          <div
            className={`flex items-center hover:bg-gray-50 transition-colors px-2 py-2 cursor-pointer ${selectedJobId === job.id ? 'bg-blue-50' : ''}`}
            style={{ minHeight: 40 }}
            onClick={() => handleJobClick(job.id)}
            data-testid={`job-row-${job.id}`}
          >
            {/* Due / traffic light */}
            <div className="flex items-center justify-center" style={{ width: 26 }}>
              <TrafficLightIndicator 
                dueDate={job.due_date} 
                originalCommittedDueDate={job.original_committed_due_date}
                showDetailed={false}
              />
            </div>
            
            {/* Job info */}
            <div className="flex-1 min-w-0 truncate ml-2">
              <span className="font-medium text-sm mr-2">{job.wo_no}</span>
              {job.category_name && (
                <Badge variant="outline" className="ml-0.5 mr-0.5">{job.category_name}</Badge>
              )}
              {job.customer && (
                <span className="text-xs text-gray-500 ml-1">{job.customer}</span>
              )}
              <span className="text-xs text-gray-400 ml-1">{job.reference}</span>
              {job.payment_status === 'awaiting_payment' && (
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0 ml-1">
                  <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                  AWAITING PAYMENT
                </Badge>
              )}
            </div>
            
            {/* Stage/Status */}
            <div style={{ width: 120 }} className="truncate">
              {job.current_stage_name && (
                <Badge className={getStatusColor(job.stage_status)}>{job.current_stage_name}</Badge>
              )}
            </div>
            {/* Workflow Progress */}
            <div style={{ width: 80 }} className="pl-1">
              {typeof job.workflow_progress === "number" && (
                <Progress value={Math.round(job.workflow_progress)} className="h-1" />
              )}
            </div>
            {/* Expand/Collapse Icon */}
            <div className="pl-2 pr-1 flex items-center" style={{ width: 30 }}>
              {selectedJobId === job.id
                ? <ChevronDown className="h-4 w-4 text-gray-400" />
                : <ChevronRight className="h-4 w-4 text-gray-400" />}
            </div>
          </div>
          {selectedJobId === job.id && (
            <div className="bg-gray-50 px-6 pb-3 pt-2">
              <div className="grid grid-cols-12 gap-x-2 text-xs font-semibold text-gray-600 mb-1">
                <div className="col-span-4">Stage</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-3">Progress</div>
                <div className="col-span-3 text-right">Action</div>
              </div>
              <div className="space-y-0.5">
                {Array.isArray(job.stages) && job.stages.length > 0 ? (
                  job.stages.map((stage, idx) => (
                    <div key={stage.id || idx} className="grid grid-cols-12 items-center py-0.5 border-b border-gray-200 last:border-b-0 group">
                      {/* Stage name with colored dot */}
                      <div className="col-span-4 flex items-center">
                        {getStageDot(stage.status)}
                        <span>{stage.stage_name}</span>
                      </div>
                      {/* Stage status */}
                      <div className="col-span-2">
                        <Badge variant="outline" className={getStatusColor(stage.status)}>
                          {stage.status.charAt(0).toUpperCase() + stage.status.slice(1)}
                        </Badge>
                      </div>
                      {/* (Optional) mini progress or timing */}
                      <div className="col-span-3">
                        {stage.status === "completed" ? (
                          <span className="text-green-600 font-medium">✓</span>
                        ) : stage.status === "active" ? (
                          <span className="text-blue-600">In Progress</span>
                        ) : (
                          <span className="text-gray-500">Pending</span>
                        )}
                      </div>
                      {/* Actions (Start/Complete) */}
                      <div className="col-span-3 flex items-center justify-end space-x-1">
                        {stage.status === "pending" && (
                          <button
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded font-medium hover:bg-blue-200"
                            onClick={e => {
                              e.stopPropagation();
                              onStageAction(job.id, stage.production_stage_id, "start");
                            }}
                          >
                            Start
                          </button>
                        )}
                        {stage.status === "active" && (
                          <button
                            className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded font-medium hover:bg-green-200"
                            onClick={e => {
                              e.stopPropagation();
                              onStageAction(job.id, stage.production_stage_id, "complete");
                            }}
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-400 italic text-sm">No stage details available for this job.</div>
                )}
              </div>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
