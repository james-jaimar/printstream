/**
 * Order Card for Label Schedule Board
 * Displays an order (with aggregated run metrics) in a draggable card
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Clock, Layers, Ruler, Package } from 'lucide-react';
import type { ScheduledOrderGroup, UnscheduledOrderGroup } from '@/hooks/labels/useLabelSchedule';

interface OrderCardData {
  order_number: string;
  customer_name: string;
  run_count: number;
  total_meters: number;
  total_frames: number;
  total_duration_minutes: number;
  status?: string;
}

interface ScheduleOrderCardProps {
  order: OrderCardData;
  isDragging?: boolean;
  onClick?: () => void;
}

export function ScheduleOrderCard({ order, isDragging, onClick }: ScheduleOrderCardProps) {
  const statusColors: Record<string, string> = {
    scheduled: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
    in_progress: 'border-l-green-500 bg-green-50 dark:bg-green-950/20',
    completed: 'border-l-gray-400 bg-gray-50 dark:bg-gray-950/20',
    planned: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
    approved: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
  };

  const hours = Math.floor(order.total_duration_minutes / 60);
  const mins = order.total_duration_minutes % 60;

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border-l-4 shadow-sm cursor-pointer',
        'hover:shadow-md transition-shadow',
        statusColors[order.status || ''] || 'border-l-gray-300 bg-background',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{order.order_number}</p>
          <p className="text-xs text-muted-foreground truncate">{order.customer_name}</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex items-center gap-1">
          <Package className="h-3 w-3" />
          {order.run_count} run{order.run_count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Aggregated Metrics */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {order.total_meters > 0 && (
          <div className="flex items-center gap-1">
            <Ruler className="h-3 w-3" />
            <span>{order.total_meters.toFixed(1)}m</span>
          </div>
        )}
        {order.total_frames > 0 && (
          <div className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            <span>{order.total_frames} frames</span>
          </div>
        )}
        {order.total_duration_minutes > 0 && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{hours > 0 ? `${hours}h` : ''}{mins > 0 ? `${mins}m` : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Draggable version for schedule board */
interface DraggableOrderCardProps extends ScheduleOrderCardProps {
  id: string;
}

export function DraggableOrderCard({ id, order, onClick }: DraggableOrderCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: 'order', order } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ScheduleOrderCard order={order} isDragging={isDragging} onClick={onClick} />
    </div>
  );
}
