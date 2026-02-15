/**
 * Day Column for Label Schedule Board
 * Represents a single day with droppable area for orders
 */

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { DraggableOrderCard } from './ScheduleOrderCard';
import type { ScheduledOrderGroup } from '@/hooks/labels/useLabelSchedule';

interface DayColumnProps {
  date: Date;
  scheduledOrders: ScheduledOrderGroup[];
  onOrderClick?: (order: ScheduledOrderGroup) => void;
}

export function DayColumn({ date, scheduledOrders, onOrderClick }: DayColumnProps) {
  const dateKey = format(date, 'yyyy-MM-dd');

  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: { type: 'day', date: dateKey },
  });

  const sortedOrders = [...scheduledOrders].sort((a, b) => a.sort_order - b.sort_order);

  const getDayLabel = () => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEE');
  };

  const totalMinutes = sortedOrders.reduce((s, o) => s + o.total_duration_minutes, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  return (
    <div className="flex flex-col min-w-[200px] w-[200px]">
      <div className={cn(
        'p-3 rounded-t-lg border-b',
        isToday(date) ? 'bg-primary/10' : 'bg-muted/50'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <p className={cn('font-semibold', isToday(date) && 'text-primary')}>
              {getDayLabel()}
            </p>
            <p className="text-xs text-muted-foreground">{format(date, 'MMM d')}</p>
          </div>
          {totalMinutes > 0 && (
            <span className="text-xs text-muted-foreground">
              {totalHours > 0 ? `${totalHours}h` : ''}
              {remainingMinutes > 0 ? `${remainingMinutes}m` : ''}
            </span>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 p-2 space-y-2 min-h-[300px] bg-muted/20 rounded-b-lg border border-t-0',
          isOver && 'bg-primary/10 ring-2 ring-primary ring-inset'
        )}
      >
        <SortableContext
          items={sortedOrders.map(o => o.schedule_id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedOrders.map((order) => (
            <DraggableOrderCard
              key={order.schedule_id}
              id={order.schedule_id}
              order={order}
              onClick={() => onOrderClick?.(order)}
            />
          ))}
        </SortableContext>

        {sortedOrders.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground border-2 border-dashed rounded-lg">
            Drop orders here
          </div>
        )}
      </div>
    </div>
  );
}
