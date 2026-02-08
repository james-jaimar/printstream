/**
 * Run Card for Label Schedule Board
 * Displays a production run in a draggable card format
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Clock, Layers, Ruler } from 'lucide-react';
import type { ScheduleRunDetails, ScheduledRunWithDetails } from '@/hooks/labels/useLabelSchedule';

interface ScheduleRunCardProps {
  run: ScheduleRunDetails;
  scheduleId?: string;
  isDragging?: boolean;
  onClick?: () => void;
}

export function ScheduleRunCard({ run, scheduleId, isDragging, onClick }: ScheduleRunCardProps) {
  const order = run.order;
  
  // Get status color
  const statusColors: Record<string, string> = {
    planned: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
    approved: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
    printing: 'border-l-green-500 bg-green-50 dark:bg-green-950/20',
    completed: 'border-l-gray-400 bg-gray-50 dark:bg-gray-950/20',
  };
  
  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border-l-4 shadow-sm cursor-pointer',
        'hover:shadow-md transition-shadow',
        statusColors[run.status] || 'border-l-gray-300 bg-background',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">
            {order?.order_number || `Order ${run.order_id.slice(0, 8)}`}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {order?.customer_name || 'Unknown Customer'}
          </p>
        </div>
        <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          Run {run.run_number}
        </span>
      </div>
      
      {/* Metrics */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {run.meters_to_print && (
          <div className="flex items-center gap-1">
            <Ruler className="h-3 w-3" />
            <span>{run.meters_to_print.toFixed(1)}m</span>
          </div>
        )}
        {run.frames_count && (
          <div className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            <span>{run.frames_count} frames</span>
          </div>
        )}
        {run.estimated_duration_minutes && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{run.estimated_duration_minutes}min</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Draggable version of the run card for use in the schedule board
 */
interface DraggableRunCardProps extends ScheduleRunCardProps {
  id: string;
}

export function DraggableRunCard({ id, run, scheduleId, onClick }: DraggableRunCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id,
    data: {
      type: 'run',
      run,
      scheduleId,
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ScheduleRunCard
        run={run}
        scheduleId={scheduleId}
        isDragging={isDragging}
        onClick={onClick}
      />
    </div>
  );
}
