import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, GripVertical, Lock, HelpCircle } from "lucide-react";
import type { ScheduledStageData } from "@/hooks/useScheduleReader";
import { EnhancedDueDateDisplay } from "@/components/tracker/production/EnhancedDueDateDisplay";

interface SortableScheduleStageCardProps {
  stage: ScheduledStageData;
  onJobClick?: (stage: ScheduledStageData) => void;
  onDiagnosticsClick?: (stage: ScheduledStageData) => void;
  isAdminUser?: boolean;
  disabled?: boolean;
}

export const SortableScheduleStageCard: React.FC<SortableScheduleStageCardProps> = ({
  stage,
  onJobClick,
  onDiagnosticsClick,
  isAdminUser = false,
  disabled = false
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: stage.id,
    disabled: !isAdminUser || disabled || stage.is_split_job
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  const cardStyle = {
    ...style,
    borderLeftColor: stage.stage_color || '#6B7280'
  };

  return (
    <Card 
      ref={setNodeRef}
      style={cardStyle}
      className={`p-3 cursor-pointer hover:shadow-md transition-shadow border-l-4 ${
        isDragging ? 'shadow-lg' : ''
      } ${!isAdminUser ? '' : 'hover:bg-accent/50'}`}
      onClick={() => onJobClick?.(stage)}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isAdminUser && !stage.is_split_job && (
              <div 
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-3 w-3" />
              </div>
            )}
            {stage.is_split_job && (
              <div className="text-amber-500">
                <Lock className="h-3 w-3" />
              </div>
            )}
            <div 
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: stage.stage_color || '#6B7280' }}
            />
            <span className="font-medium text-sm">
              {stage.job_wo_no}
            </span>
            {stage.is_split_job && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                Split
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs">
              {stage.estimated_duration_minutes}m
            </Badge>
            {onDiagnosticsClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onDiagnosticsClick(stage);
                }}
                title="Why scheduled here?"
              >
                <HelpCircle className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="text-xs font-medium text-muted-foreground">
          {stage.stage_name}
        </div>
        
        {(stage.paper_display || stage.hp12000_paper_size) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {stage.paper_display && (
              <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">
                {stage.paper_display}
              </Badge>
            )}
            {stage.hp12000_paper_size && (
              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                {stage.hp12000_paper_size}
              </Badge>
            )}
          </div>
        )}
       
        <div className="text-xs text-muted-foreground space-y-1">
          {stage.start_hhmm && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {stage.start_hhmm}
              {stage.end_hhmm && (
                <span> - {stage.end_hhmm}</span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex justify-between items-center pt-1">
          <Badge 
            variant={stage.status === 'completed' ? 'default' : 'secondary'}
            className="text-xs"
          >
            {stage.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Order: {stage.stage_order}
          </span>
        </div>

        {stage.job_due_date && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <EnhancedDueDateDisplay
              job={{
                due_date: stage.job_due_date,
                original_committed_due_date: stage.job_original_committed_due_date,
                wo_no: stage.job_wo_no
              }}
              variant="compact"
              showTrafficLight={true}
            />
          </div>
        )}
      </div>
    </Card>
  );
};