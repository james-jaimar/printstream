/**
 * Material Column - A draggable/droppable sub-column within a day
 * Groups orders by material type (substrate + glue + width)
 */

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { GripVertical, Clock } from 'lucide-react';
import { DraggableOrderCard } from './ScheduleOrderCard';
import { getSubstrateColor } from '@/hooks/labels/useLabelSchedule';
import type { ScheduledOrderGroup } from '@/hooks/labels/useLabelSchedule';

interface MaterialColumnProps {
  dateKey: string;
  materialKey: string;
  orders: ScheduledOrderGroup[];
  substrateType: string | null;
  onOrderClick?: (order: ScheduledOrderGroup) => void;
}

export function MaterialColumn({ dateKey, materialKey, orders, substrateType, onOrderClick }: MaterialColumnProps) {
  const columnId = `material-${dateKey}-${materialKey}`;

  // The header is draggable (to move entire material group to another day)
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: columnId,
    data: { type: 'material-group', dateKey, materialKey, orders },
  });

  // The body is droppable (accepts individual order cards)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: columnId,
    data: { type: 'material-column', dateKey, materialKey },
  });

  const totalMinutes = orders.reduce((s, o) => s + o.total_duration_minutes, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  const colorClass = getSubstrateColor(substrateType);
  const sortedOrders = [...orders].sort((a, b) => a.sort_order - b.sort_order);

  // Abbreviate material key for header
  const abbreviatedKey = materialKey
    .replace('Hot Melt', 'HM')
    .replace('Acrylic', 'Acr')
    .replace('Semi Gloss', 'SG');

  return (
    <div className={cn(
      'flex flex-col min-w-[180px] w-[180px] rounded-lg border',
      isDragging && 'opacity-50',
      colorClass.split(' ').find(c => c.startsWith('border-')) || 'border-gray-200'
    )}>
      {/* Draggable header */}
      <div
        ref={setDragRef}
        {...attributes}
        {...listeners}
        className={cn(
          'flex items-center gap-1 px-2 py-2 rounded-t-lg cursor-grab active:cursor-grabbing border-b',
          colorClass
        )}
      >
        <GripVertical className="h-3 w-3 flex-shrink-0 opacity-50" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{abbreviatedKey}</p>
          <div className="flex items-center gap-1 text-[10px] opacity-75">
            <Clock className="h-2.5 w-2.5" />
            <span>
              {totalHours > 0 ? `${totalHours}h` : ''}
              {remainingMinutes > 0 ? `${remainingMinutes}m` : ''}
              {totalMinutes === 0 ? '0m' : ''}
            </span>
            <span>· {orders.length} order{orders.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Droppable body */}
      <div
        ref={setDropRef}
        className={cn(
          'flex-1 p-1.5 space-y-1.5 min-h-[100px] rounded-b-lg',
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
          <div className="flex items-center justify-center h-12 text-[10px] text-muted-foreground border border-dashed rounded">
            Drop orders
          </div>
        )}
      </div>
    </div>
  );
}
