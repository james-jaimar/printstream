/**
 * Label Schedule Board
 * Kanban-style drag-and-drop scheduling at the ORDER level
 */

import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { format, addDays, startOfWeek } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { DayColumn } from './DayColumn';
import { UnscheduledPanel } from './UnscheduledPanel';
import { ScheduleOrderCard } from './ScheduleOrderCard';
import {
  useLabelSchedule,
  useUnscheduledRuns,
  useScheduleOrder,
  useRescheduleOrder,
  useUnscheduleOrder,
  useReorderSchedule,
  type ScheduledOrderGroup,
  type UnscheduledOrderGroup,
} from '@/hooks/labels/useLabelSchedule';

interface LabelScheduleBoardProps {
  onRunClick?: (run: any) => void;
}

export function LabelScheduleBoard({ onRunClick }: LabelScheduleBoardProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDays[weekDays.length - 1];

  // Fetch data (now returns order-grouped data)
  const { data: scheduledOrders = [], isLoading: loadingScheduled } = useLabelSchedule(weekStart, weekEnd);
  const { data: unscheduledOrders = [], isLoading: loadingUnscheduled } = useUnscheduledRuns();

  // Mutations
  const scheduleOrder = useScheduleOrder();
  const rescheduleOrder = useRescheduleOrder();
  const unscheduleOrder = useUnscheduleOrder();
  const reorderSchedule = useReorderSchedule();

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<{ order_number: string; customer_name: string; run_count: number; total_meters: number; total_frames: number; total_duration_minutes: number } | null>(null);

  // Group scheduled orders by date
  const ordersByDate = useMemo(() => {
    const grouped: Record<string, ScheduledOrderGroup[]> = {};
    weekDays.forEach(day => {
      grouped[format(day, 'yyyy-MM-dd')] = [];
    });
    scheduledOrders.forEach(order => {
      if (grouped[order.scheduled_date]) {
        grouped[order.scheduled_date].push(order);
      }
    });
    return grouped;
  }, [scheduledOrders, weekDays]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const idStr = active.id as string;
    setActiveId(idStr);

    if (idStr.startsWith('unscheduled-')) {
      const orderId = idStr.replace('unscheduled-', '');
      const order = unscheduledOrders.find(o => o.order_id === orderId);
      if (order) setActiveOrder(order);
    } else {
      const order = scheduledOrders.find(o => o.schedule_id === idStr);
      if (order) setActiveOrder(order);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveOrder(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    const isFromUnscheduled = activeIdStr.startsWith('unscheduled-');
    const isToUnscheduled = overIdStr === 'unscheduled';
    const isToDay = overIdStr.startsWith('day-');
    const targetDate = isToDay ? overIdStr.replace('day-', '') : null;

    if (isFromUnscheduled && isToDay && targetDate) {
      // Schedule an unscheduled order
      const orderId = activeIdStr.replace('unscheduled-', '');
      const order = unscheduledOrders.find(o => o.order_id === orderId);
      if (order) {
        scheduleOrder.mutate({
          order_id: orderId,
          run_ids: order.runs.map(r => r.id),
          scheduled_date: targetDate,
        });
      }
    } else if (!isFromUnscheduled && isToUnscheduled) {
      // Unschedule an order
      const order = scheduledOrders.find(o => o.schedule_id === activeIdStr);
      if (order) {
        unscheduleOrder.mutate(order.schedule_entries.map(e => e.id));
      }
    } else if (!isFromUnscheduled && isToDay && targetDate) {
      // Move order to a different day
      const order = scheduledOrders.find(o => o.schedule_id === activeIdStr);
      if (order && order.scheduled_date !== targetDate) {
        const dayOrders = ordersByDate[targetDate] || [];
        rescheduleOrder.mutate({
          schedule_entry_ids: order.schedule_entries.map(e => e.id),
          newDate: targetDate,
          newBaseSortOrder: (dayOrders.length + 1),
        });
      }
    } else if (!isFromUnscheduled && !isToUnscheduled && !isToDay) {
      // Reorder within same day
      const overOrder = scheduledOrders.find(o => o.schedule_id === overIdStr);
      const activeOrder = scheduledOrders.find(o => o.schedule_id === activeIdStr);

      if (overOrder && activeOrder && overOrder.scheduled_date === activeOrder.scheduled_date) {
        const dayOrders = ordersByDate[activeOrder.scheduled_date] || [];
        const oldIndex = dayOrders.findIndex(o => o.schedule_id === activeIdStr);
        const newIndex = dayOrders.findIndex(o => o.schedule_id === overIdStr);

        if (oldIndex !== newIndex) {
          const reordered = [...dayOrders];
          const [removed] = reordered.splice(oldIndex, 1);
          reordered.splice(newIndex, 0, removed);

          // Update sort_order for the first schedule entry of each order
          reorderSchedule.mutate(
            reordered.map((o, i) => ({ id: o.schedule_id, sort_order: i + 1 }))
          );
        }
      }
    }
  };

  const goToPreviousWeek = () => setWeekStart(prev => addDays(prev, -7));
  const goToNextWeek = () => setWeekStart(prev => addDays(prev, 7));
  const goToCurrentWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goToNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToCurrentWeek}>
              <Calendar className="h-4 w-4 mr-2" />
              Today
            </Button>
          </div>
          <div className="text-sm font-medium">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <UnscheduledPanel orders={unscheduledOrders} />

          <div className="flex-1 flex gap-2 p-4 overflow-x-auto">
            {weekDays.map((day) => (
              <DayColumn
                key={format(day, 'yyyy-MM-dd')}
                date={day}
                scheduledOrders={ordersByDate[format(day, 'yyyy-MM-dd')] || []}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeId && activeOrder ? (
          <ScheduleOrderCard order={activeOrder} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
