import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Package2, 
  Users, 
  Calendar, 
  Clock,
  ExternalLink,
  Layers,
  CreditCard
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchContextIndicatorProps {
  job: {
    is_batch_master?: boolean;
    batch_name?: string | null;
    batch_status?: string | null;
    constituent_jobs_count?: number;
    batch_ready?: boolean;
    wo_no?: string;
    status?: string;
  };
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
  className?: string;
}

/**
 * Component to display batch context and status for jobs
 * Shows different information based on whether job is:
 * - A batch master job
 * - Part of a batch (batched individual job)
 * - Ready for batching
 * - Standalone individual job
 */
export const BatchContextIndicator: React.FC<BatchContextIndicatorProps> = ({
  job,
  size = "md",
  showDetails = false,
  className
}) => {
  const iconSize = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const textSize = size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";
  const badgeSize = size === "sm" ? "text-xs" : "text-sm";

  // Batch master job
  if (job.is_batch_master) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Badge 
          variant="default" 
          className={cn(
            "bg-purple-600 text-white border-purple-700",
            badgeSize
          )}
        >
          <Package2 className={cn(iconSize, "mr-1")} />
          Batch Master
        </Badge>
        
        {showDetails && job.constituent_jobs_count && (
          <div className={cn("flex items-center gap-1 text-gray-600", textSize)}>
            <Users className={iconSize} />
            <span>{job.constituent_jobs_count} jobs</span>
          </div>
        )}
        
        {showDetails && job.batch_status && (
          <Badge variant="outline" className={badgeSize}>
            {job.batch_status}
          </Badge>
        )}
      </div>
    );
  }

  // Individual job that's part of a batch
  if (job.batch_name && !job.is_batch_master) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Badge 
          variant="secondary" 
          className={cn(
            "bg-blue-100 text-blue-800 border-blue-200",
            badgeSize
          )}
        >
          <Layers className={cn(iconSize, "mr-1")} />
          Batched
        </Badge>
        
        {showDetails && (
          <div className={cn("flex items-center gap-1 text-gray-600", textSize)}>
            <ExternalLink className={iconSize} />
            <span>Batch: {job.batch_name}</span>
          </div>
        )}
      </div>
    );
  }

  // Job ready for batching
  if (job.batch_ready) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Badge 
          variant="outline" 
          className={cn(
            "bg-green-50 text-green-700 border-green-300",
            badgeSize
          )}
        >
          <Clock className={cn(iconSize, "mr-1")} />
          Ready for Batch
        </Badge>
      </div>
    );
  }

  // Regular individual job - show minimal or no indicator
  if (!showDetails) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Badge 
        variant="outline" 
        className={cn(
          "bg-gray-50 text-gray-600 border-gray-200",
          badgeSize
        )}
      >
        Individual
      </Badge>
    </div>
  );
};

interface BatchAwareJobCardProps {
  job: {
    id: string;
    wo_no: string;
    status: string;
    customer?: string | null;
    reference?: string | null;
    qty?: number | null;
    due_date?: string | null;
    category_name?: string | null;
    category_color?: string | null;
    current_stage_name?: string | null;
    current_stage_status?: string | null;
    workflow_progress?: number;
    
    // Payment hold
    payment_status?: string;
    // Batch context
    is_batch_master?: boolean;
    batch_name?: string | null;
    batch_status?: string | null;
    constituent_jobs_count?: number;
    batch_ready?: boolean;
    batch_created_at?: string | null;
  };
  onClick?: (job: any) => void;
  selected?: boolean;
  compact?: boolean;
  showBatchDetails?: boolean;
}

/**
 * Enhanced job card with comprehensive batch awareness
 * Displays appropriate batch context and styling based on job type
 */
export const BatchAwareJobCard: React.FC<BatchAwareJobCardProps> = ({
  job,
  onClick,
  selected = false,
  compact = false,
  showBatchDetails = true
}) => {
  const isOverdue = job.due_date && new Date(job.due_date) < new Date();
  const isDueSoon = job.due_date && !isOverdue && 
    new Date(job.due_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const getCardStyle = () => {
    let baseStyle = "hover:shadow-md transition-all duration-200 cursor-pointer border-2";
    
    if (selected) {
      baseStyle += " ring-2 ring-blue-400 ring-offset-1";
    }
    
    if (job.is_batch_master) {
      baseStyle += " bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200";
    } else if (job.batch_name) {
      baseStyle += " bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200";
    } else if (job.batch_ready) {
      baseStyle += " bg-gradient-to-br from-green-50 to-emerald-50 border-green-200";
    } else if (isOverdue) {
      baseStyle += " bg-gradient-to-br from-red-50 to-pink-50 border-red-300";
    } else if (isDueSoon) {
      baseStyle += " bg-gradient-to-br from-orange-50 to-yellow-50 border-orange-300";
    } else {
      baseStyle += " bg-white border-gray-200";
    }
    
    return baseStyle;
  };

  const handleClick = () => {
    onClick?.(job);
  };

  if (compact) {
    return (
      <Card className={getCardStyle()} onClick={handleClick}>
        <CardContent className="p-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm truncate">{job.wo_no}</h4>
                {job.customer && (
                  <p className="text-xs text-gray-600 truncate">{job.customer}</p>
                )}
              </div>
              <div className="flex items-center gap-1 ml-2">
                <BatchContextIndicator 
                  job={job} 
                  size="sm" 
                  showDetails={false}
                />
                {job.payment_status === 'awaiting_payment' && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0">
                    <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                    AWAITING PAYMENT
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              {job.category_name && (
                <Badge 
                  variant="outline" 
                  className="text-xs"
                  style={{ 
                    borderColor: job.category_color || undefined,
                    color: job.category_color || undefined 
                  }}
                >
                  {job.category_name}
                </Badge>
              )}
              
              <Badge 
                variant={job.status === 'completed' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {job.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={getCardStyle()} onClick={handleClick}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header with batch context */}
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg">{job.wo_no}</h3>
                {job.is_batch_master && (
                  <Badge className="bg-purple-600 text-white text-xs">
                    MASTER
                  </Badge>
                )}
                {job.payment_status === 'awaiting_payment' && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0">
                    <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                    AWAITING PAYMENT
                  </Badge>
                )}
              </div>
              
              <BatchContextIndicator 
                job={job} 
                size="md" 
                showDetails={showBatchDetails}
              />
            </div>
            
            <Badge 
              variant={job.status === 'completed' ? 'default' : 'secondary'}
              className={job.status === 'completed' ? 'bg-green-500' : ''}
            >
              {job.status}
            </Badge>
          </div>

          {/* Job details */}
          <div className="space-y-2">
            {job.customer && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium">{job.customer}</span>
              </div>
            )}
            
            {job.reference && (
              <div className="text-sm text-gray-600">
                Ref: {job.reference}
              </div>
            )}
            
            <div className="flex items-center justify-between">
              {job.qty && (
                <div className="flex items-center gap-2">
                  <Package2 className="h-4 w-4 text-gray-400" />
                  <span className="text-sm">Qty: {job.qty}</span>
                </div>
              )}
              
              {job.category_name && (
                <Badge 
                  variant="outline"
                  style={{ 
                    borderColor: job.category_color || undefined,
                    color: job.category_color || undefined 
                  }}
                >
                  {job.category_name}
                </Badge>
              )}
            </div>
            
            {job.due_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className={cn(
                  "text-sm",
                  isOverdue ? "text-red-600 font-medium" : 
                  isDueSoon ? "text-orange-600 font-medium" : 
                  "text-gray-600"
                )}>
                  Due: {new Date(job.due_date).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Current stage and progress */}
          {job.current_stage_name && (
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    job.current_stage_status === 'active' ? "bg-blue-500" :
                    job.current_stage_status === 'completed' ? "bg-green-500" :
                    "bg-gray-300"
                  )} />
                  <span className="text-sm font-medium">{job.current_stage_name}</span>
                </div>
                
                {job.workflow_progress !== undefined && (
                  <span className="text-xs text-gray-500">
                    {job.workflow_progress}% complete
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Batch-specific information */}
          {showBatchDetails && job.is_batch_master && job.constituent_jobs_count && (
            <div className="pt-2 border-t border-purple-100 bg-purple-25">
              <div className="text-sm text-purple-700">
                Contains {job.constituent_jobs_count} individual jobs
              </div>
            </div>
          )}
          
          {showBatchDetails && job.batch_name && !job.is_batch_master && (
            <div className="pt-2 border-t border-blue-100">
              <div className="text-sm text-blue-700">
                Part of batch: <span className="font-medium">{job.batch_name}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};