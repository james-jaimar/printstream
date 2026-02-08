/**
 * Day Column for Label Schedule Board
 * Represents a single day with droppable area for runs
 */

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { DraggableRunCard } from './ScheduleRunCard';
import type { ScheduledRunWithDetails } from '@/hooks/labels/useLabelSchedule';

interface DayColumnProps {
  date: Date;
  scheduledRuns: ScheduledRunWithDetails[];
  onRunClick?: (run: ScheduledRunWithDetails) => void;
}

export function DayColumn({ date, scheduledRuns, onRunClick }: DayColumnProps) {
  const dateKey = format(date, 'yyyy-MM-dd');
  
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: {
      type: 'day',
      date: dateKey,
    },
  });

  // Sort runs by sort_order
  const sortedRuns = [...scheduledRuns].sort((a, b) => a.sort_order - b.sort_order);
  
  // Get day label
  const getDayLabel = () => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEE');
  };

  // Calculate total duration
  const totalMinutes = sortedRuns.reduce(
    (sum, s) => sum + (s.run?.estimated_duration_minutes || 0),
    0
  );
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  return (
    <div className="flex flex-col min-w-[200px] w-[200px]">
      {/* Header */}
      <div className={cn(
        'p-3 rounded-t-lg border-b',
        isToday(date) ? 'bg-primary/10' : 'bg-muted/50'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <p className={cn(
              'font-semibold',
              isToday(date) && 'text-primary'
            )}>
              {getDayLabel()}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(date, 'MMM d')}
            </p>
          </div>
          {totalMinutes > 0 && (
            <span className="text-xs text-muted-foreground">
              {totalHours > 0 ? `${totalHours}h` : ''} 
              {remainingMinutes > 0 ? `${remainingMinutes}m` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 p-2 space-y-2 min-h-[300px] bg-muted/20 rounded-b-lg border border-t-0',
          isOver && 'bg-primary/10 ring-2 ring-primary ring-inset'
        )}
      >
        <SortableContext
          items={sortedRuns.map(s => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedRuns.map((schedule) => (
            schedule.run && (
              <DraggableRunCard
                key={schedule.id}
                id={schedule.id}
                run={schedule.run}
                scheduleId={schedule.id}
                onClick={() => onRunClick?.(schedule)}
              />
            )
          ))}
        </SortableContext>

        {sortedRuns.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground border-2 border-dashed rounded-lg">
            Drop runs here
          </div>
        )}
      </div>
    </div>
  );
}
