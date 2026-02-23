/**
 * Day Column for Label Schedule Board
 * Contains material sub-columns side-by-side
 */

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { MaterialColumn } from './MaterialColumn';
import { DAILY_CAPACITY_MINUTES, WARNING_THRESHOLD, getMaterialKey } from '@/hooks/labels/useLabelSchedule';
import type { ScheduledOrderGroup } from '@/hooks/labels/useLabelSchedule';

interface DayColumnProps {
  date: Date;
  scheduledOrders: ScheduledOrderGroup[];
  onOrderClick?: (order: ScheduledOrderGroup) => void;
}

export function DayColumn({ date, scheduledOrders, onOrderClick }: DayColumnProps) {
  const dateKey = format(date, 'yyyy-MM-dd');

  // Day-level droppable (for drops directly on the day header)
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: { type: 'day', date: dateKey },
  });

  const getDayLabel = () => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEE');
  };

  const totalMinutes = scheduledOrders.reduce((s, o) => s + o.total_duration_minutes, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  const isOverCapacity = totalMinutes >= DAILY_CAPACITY_MINUTES;
  const isNearCapacity = totalMinutes >= DAILY_CAPACITY_MINUTES * WARNING_THRESHOLD;

  // Group orders by material_key
  const materialGroups = new Map<string, { orders: ScheduledOrderGroup[]; substrateType: string | null }>();
  for (const order of scheduledOrders) {
    const key = order.material_key;
    if (!materialGroups.has(key)) {
      materialGroups.set(key, { orders: [], substrateType: order.substrate_type });
    }
    materialGroups.get(key)!.orders.push(order);
  }

  // Sort material groups alphabetically for consistent display
  const sortedMaterialKeys = Array.from(materialGroups.keys()).sort();

  return (
    <div className="flex flex-col min-w-[200px]">
      {/* Day header */}
      <div
        ref={setNodeRef}
        className={cn(
          'p-3 rounded-t-lg border-b',
          isToday(date) ? 'bg-primary/10' : 'bg-muted/50',
          isOver && 'ring-2 ring-primary'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className={cn('font-semibold', isToday(date) && 'text-primary')}>
              {getDayLabel()}
            </p>
            <p className="text-xs text-muted-foreground">{format(date, 'MMM d')}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {totalMinutes > 0 && (
              <span className={cn(
                'text-xs font-medium px-1.5 py-0.5 rounded',
                isOverCapacity && 'bg-red-100 text-red-700',
                isNearCapacity && !isOverCapacity && 'bg-amber-100 text-amber-700',
                !isNearCapacity && 'text-muted-foreground'
              )}>
                {totalHours > 0 ? `${totalHours}h` : ''}
                {remainingMinutes > 0 ? `${remainingMinutes}m` : ''}
              </span>
            )}
            {isOverCapacity && (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            )}
            {isNearCapacity && !isOverCapacity && (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
          </div>
        </div>
        {isOverCapacity && (
          <p className="text-[10px] text-red-600 mt-1">
            Exceeds capacity by {Math.floor((totalMinutes - DAILY_CAPACITY_MINUTES) / 60)}h {(totalMinutes - DAILY_CAPACITY_MINUTES) % 60}m
          </p>
        )}
      </div>

      {/* Material sub-columns side-by-side */}
      <div className={cn(
        'flex-1 flex gap-1.5 p-2 min-h-[300px] bg-muted/20 rounded-b-lg border border-t-0 overflow-x-auto',
        isOver && 'bg-primary/5'
      )}>
        {sortedMaterialKeys.map((materialKey) => {
          const group = materialGroups.get(materialKey)!;
          return (
            <MaterialColumn
              key={materialKey}
              dateKey={dateKey}
              materialKey={materialKey}
              orders={group.orders}
              substrateType={group.substrateType}
              onOrderClick={onOrderClick}
            />
          );
        })}

        {sortedMaterialKeys.length === 0 && (
          <div className="flex items-center justify-center w-full h-20 text-xs text-muted-foreground border-2 border-dashed rounded-lg">
            Drop orders here
          </div>
        )}
      </div>
    </div>
  );
}
