/**
 * Unscheduled Panel for Label Schedule Board
 * Shows orders (grouped runs) that haven't been scheduled yet
 */

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';
import { DraggableOrderCard } from './ScheduleOrderCard';
import type { UnscheduledOrderGroup } from '@/hooks/labels/useLabelSchedule';

interface UnscheduledPanelProps {
  orders: UnscheduledOrderGroup[];
  onOrderClick?: (order: UnscheduledOrderGroup) => void;
}

export function UnscheduledPanel({ orders, onOrderClick }: UnscheduledPanelProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unscheduled',
    data: { type: 'unscheduled' },
  });

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] border-r">
      <div className="p-3 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-semibold">Unscheduled</p>
            <p className="text-xs text-muted-foreground">
              {orders.length} order{orders.length !== 1 ? 's' : ''} pending
            </p>
          </div>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 p-2 space-y-2 overflow-y-auto bg-background',
          isOver && 'bg-primary/10 ring-2 ring-primary ring-inset'
        )}
      >
        <SortableContext
          items={orders.map(o => `unscheduled-${o.order_id}`)}
          strategy={verticalListSortingStrategy}
        >
          {orders.map((order) => (
            <DraggableOrderCard
              key={order.order_id}
              id={`unscheduled-${order.order_id}`}
              order={order}
              onClick={() => onOrderClick?.(order)}
            />
          ))}
        </SortableContext>

        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center text-xs text-muted-foreground">
            <Inbox className="h-8 w-8 mb-2 opacity-50" />
            <p>All orders scheduled!</p>
          </div>
        )}
      </div>
    </div>
  );
}
