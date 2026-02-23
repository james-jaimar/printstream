/**
 * Label Schedule Board
 * Kanban-style drag-and-drop scheduling with material sub-columns per day
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
import { ScheduleOrderDetailModal } from './ScheduleOrderDetailModal';
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

interface DragItem {
  type: 'order' | 'material-group';
  order?: { order_number: string; customer_name: string; run_count: number; total_meters: number; total_frames: number; total_duration_minutes: number; substrate_type?: string | null; glue_type?: string | null; substrate_width_mm?: number | null };
  materialKey?: string;
  dateKey?: string;
  orderCount?: number;
}

export function LabelScheduleBoard() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDays[weekDays.length - 1];

  const { data: scheduledOrders = [] } = useLabelSchedule(weekStart, weekEnd);
  const { data: unscheduledOrders = [] } = useUnscheduledRuns();

  const scheduleOrder = useScheduleOrder();
  const rescheduleOrder = useRescheduleOrder();
  const unscheduleOrder = useUnscheduleOrder();
  const reorderSchedule = useReorderSchedule();

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragItem, setActiveDragItem] = useState<DragItem | null>(null);

  // Modal state
  const [selectedOrder, setSelectedOrder] = useState<ScheduledOrderGroup | UnscheduledOrderGroup | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleOrderClick = (order: ScheduledOrderGroup | UnscheduledOrderGroup) => {
    setSelectedOrder(order);
    setModalOpen(true);
  };

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

    // Check if it's a material-group drag
    if (idStr.startsWith('material-')) {
      const data = active.data.current;
      if (data?.type === 'material-group') {
        setActiveDragItem({
          type: 'material-group',
          materialKey: data.materialKey,
          dateKey: data.dateKey,
          orderCount: data.orders?.length || 0,
        });
        return;
      }
    }

    // Individual order drag
    if (idStr.startsWith('unscheduled-')) {
      const orderId = idStr.replace('unscheduled-', '');
      const order = unscheduledOrders.find(o => o.order_id === orderId);
      if (order) setActiveDragItem({ type: 'order', order });
    } else {
      const order = scheduledOrders.find(o => o.schedule_id === idStr);
      if (order) setActiveDragItem({ type: 'order', order });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveDragItem(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    const activeData = active.data.current;

    // === Material group drag ===
    if (activeData?.type === 'material-group') {
      const sourceDateKey = activeData.dateKey as string;
      const materialKey = activeData.materialKey as string;

      // Determine target date
      let targetDate: string | null = null;
      if (overIdStr.startsWith('day-')) {
        targetDate = overIdStr.replace('day-', '');
      } else if (overIdStr.startsWith('material-')) {
        // Dropped on another material column — extract the date from it
        const parts = overIdStr.replace('material-', '').split('-');
        targetDate = parts.slice(0, 3).join('-'); // yyyy-MM-dd
      }

      if (targetDate && targetDate !== sourceDateKey) {
        const ordersToMove = (ordersByDate[sourceDateKey] || []).filter(o => o.material_key === materialKey);
        const targetDayOrders = ordersByDate[targetDate] || [];
        let baseSortOrder = (targetDayOrders.length > 0
          ? Math.max(...targetDayOrders.map(o => o.sort_order)) + 1
          : 1);

        for (const order of ordersToMove) {
          rescheduleOrder.mutate({
            schedule_entry_ids: order.schedule_entries.map(e => e.id),
            newDate: targetDate,
            newBaseSortOrder: baseSortOrder,
          });
          baseSortOrder += order.schedule_entries.length;
        }
      }
      return;
    }

    // === Individual order drag ===
    const isFromUnscheduled = activeIdStr.startsWith('unscheduled-');
    const isToUnscheduled = overIdStr === 'unscheduled';

    // Determine target date from various drop targets
    let targetDate: string | null = null;
    if (overIdStr.startsWith('day-')) {
      targetDate = overIdStr.replace('day-', '');
    } else if (overIdStr.startsWith('material-')) {
      const parts = overIdStr.replace('material-', '').split('-');
      targetDate = parts.slice(0, 3).join('-');
    }

    if (isFromUnscheduled && targetDate) {
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
      const order = scheduledOrders.find(o => o.schedule_id === activeIdStr);
      if (order) {
        unscheduleOrder.mutate(order.schedule_entries.map(e => e.id));
      }
    } else if (!isFromUnscheduled && targetDate) {
      const order = scheduledOrders.find(o => o.schedule_id === activeIdStr);
      if (order && order.scheduled_date !== targetDate) {
        const dayOrders = ordersByDate[targetDate] || [];
        rescheduleOrder.mutate({
          schedule_entry_ids: order.schedule_entries.map(e => e.id),
          newDate: targetDate,
          newBaseSortOrder: (dayOrders.length + 1),
        });
      } else if (order && order.scheduled_date === targetDate) {
        // Reorder within same day — check if dropped on another order
        const overOrder = scheduledOrders.find(o => o.schedule_id === overIdStr);
        if (overOrder && overOrder.scheduled_date === order.scheduled_date) {
          const dayOrders = ordersByDate[order.scheduled_date] || [];
          const oldIndex = dayOrders.findIndex(o => o.schedule_id === activeIdStr);
          const newIndex = dayOrders.findIndex(o => o.schedule_id === overIdStr);

          if (oldIndex !== newIndex && oldIndex !== -1 && newIndex !== -1) {
            const reordered = [...dayOrders];
            const [removed] = reordered.splice(oldIndex, 1);
            reordered.splice(newIndex, 0, removed);

            reorderSchedule.mutate(
              reordered.map((o, i) => ({ id: o.schedule_id, sort_order: i + 1 }))
            );
          }
        }
      }
    }
  };

  const goToPreviousWeek = () => setWeekStart(prev => addDays(prev, -7));
  const goToNextWeek = () => setWeekStart(prev => addDays(prev, 7));
  const goToCurrentWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <>
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
            <UnscheduledPanel orders={unscheduledOrders} onOrderClick={handleOrderClick} />

            <div className="flex-1 flex gap-2 p-4 overflow-x-auto">
              {weekDays.map((day) => (
                <DayColumn
                  key={format(day, 'yyyy-MM-dd')}
                  date={day}
                  scheduledOrders={ordersByDate[format(day, 'yyyy-MM-dd')] || []}
                  onOrderClick={handleOrderClick}
                />
              ))}
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeId && activeDragItem?.type === 'order' && activeDragItem.order ? (
            <ScheduleOrderCard order={activeDragItem.order} isDragging />
          ) : activeId && activeDragItem?.type === 'material-group' ? (
            <div className="px-3 py-2 rounded-lg bg-primary text-primary-foreground shadow-lg text-xs font-medium">
              Moving {activeDragItem.orderCount} order{activeDragItem.orderCount !== 1 ? 's' : ''} ({activeDragItem.materialKey})
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ScheduleOrderDetailModal
        order={selectedOrder}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
