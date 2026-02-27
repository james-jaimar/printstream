
import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Calendar, 
  User, 
  Package, 
  MapPin, 
  Clock,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  CreditCard
} from "lucide-react";
import { format } from "date-fns";
import { TrafficLightIndicator } from "./production/TrafficLightIndicator";
import { BatchStageIndicator } from "./batch/BatchStageIndicator";
import { ConditionalStageIndicator } from "./batch/ConditionalStageIndicator";
import { BatchContextIndicator } from "./BatchAwareJobCard";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";

interface JobStage {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'on-hold';
  startTime?: string;
  endTime?: string;
}

interface EnhancedJobCardProps {
  job: AccessibleJob;
  stages?: JobStage[];
  onJobClick?: (job: AccessibleJob) => void;
  onStageClick?: (jobId: string, stageId: string) => void;
}

export const EnhancedJobCard: React.FC<EnhancedJobCardProps> = ({
  job,
  stages = [],
  onJobClick,
  onStageClick
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in-progress':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'on-hold':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStageStatus = (stage: JobStage) => {
    switch (stage.status) {
      case 'completed':
        return 'bg-green-500';
      case 'in-progress':
        return 'bg-blue-500';
      case 'on-hold':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-300';
    }
  };

  const calculateProgress = () => {
    if (stages.length === 0) return 0;
    const completedStages = stages.filter(stage => stage.status === 'completed').length;
    return (completedStages / stages.length) * 100;
  };

  const isOverdue = job.due_date && new Date(job.due_date) < new Date();
  const isDueSoon = job.due_date && !isOverdue && 
    new Date(job.due_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  return (
    <Card 
      className={`hover:shadow-md transition-shadow cursor-pointer ${
        isOverdue ? 'border-red-400 bg-red-50' : 
        isDueSoon ? 'border-orange-400 bg-orange-50' : 
        'border-gray-200 bg-white'
      }`}
      onClick={() => onJobClick?.(job)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{job.wo_no}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {job.category_name && (
                <Badge variant="outline">{job.category_name}</Badge>
              )}
              <BatchContextIndicator job={job} size="sm" showDetails={false} />
              <BatchStageIndicator job={job} compact />
              <ConditionalStageIndicator job={job} compact />
              {job.payment_status === 'awaiting_payment' && (
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0">
                  <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                  AWAITING PAYMENT
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(job.status)}
            <Badge 
              variant={job.status === 'completed' ? 'default' : 'secondary'}
              className={job.status === 'completed' ? 'bg-green-500' : ''}
            >
              {job.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 text-sm">
          {job.customer && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-400" />
              <span className="font-medium">{job.customer}</span>
            </div>
          )}
          
          {job.qty && (
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-400" />
              <span>Qty: {job.qty}</span>
            </div>
          )}

          {job.due_date && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <TrafficLightIndicator 
                    dueDate={job.due_date}
                    originalCommittedDueDate={job.original_committed_due_date}
                    showDetailed={false}
                  />
                  <span className={`${
                    isOverdue ? 'text-red-600 font-medium' : 
                    isDueSoon ? 'text-orange-600 font-medium' : 
                    'text-gray-600'
                  }`}>
                    Due: {format(new Date(job.due_date), "MMM dd, yyyy")}
                  </span>
                </div>
                {job.original_committed_due_date && job.due_date && 
                 new Date(job.due_date) > new Date(job.original_committed_due_date) && (
                  <span className="text-xs text-amber-600 ml-5">
                    Original: {format(new Date(job.original_committed_due_date), "MMM dd, yyyy")}
                  </span>
                )}
              </div>
            </div>
          )}

        </div>

        {stages.length > 0 && (
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Production Progress</span>
              <span className="text-sm text-gray-500">{Math.round(calculateProgress())}%</span>
            </div>
            
            <Progress value={calculateProgress()} className="h-2" />
            
            <div className="space-y-2">
              {stages.map((stage, index) => (
                <div 
                  key={stage.id}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStageClick?.(job.job_id, stage.id);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${getStageStatus(stage)}`} />
                    <span className="text-sm font-medium">{stage.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {stage.status === 'in-progress' && job.current_stage_name === stage.name && (
                      <Badge variant="default" className="text-xs bg-blue-500">Current</Badge>
                    )}
                    {getStatusIcon(stage.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
