/**
 * Label Schedule Board
 * Kanban-style drag-and-drop scheduling for label production runs
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
  DragOverEvent,
} from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { format, addDays, startOfWeek } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { DayColumn } from './DayColumn';
import { UnscheduledPanel } from './UnscheduledPanel';
import { ScheduleRunCard } from './ScheduleRunCard';
import {
  useLabelSchedule,
  useUnscheduledRuns,
  useScheduleRun,
  useRescheduleRun,
  useUnscheduleRun,
  useReorderSchedule,
  type ScheduledRunWithDetails,
  type ScheduleRunDetails,
} from '@/hooks/labels/useLabelSchedule';

interface LabelScheduleBoardProps {
  onRunClick?: (run: ScheduleRunDetails) => void;
}

export function LabelScheduleBoard({ onRunClick }: LabelScheduleBoardProps) {
  // Week navigation
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  
  // Generate 5 weekdays
  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const weekEnd = weekDays[weekDays.length - 1];

  // Fetch data
  const { data: scheduledRuns = [], isLoading: loadingScheduled } = useLabelSchedule(weekStart, weekEnd);
  const { data: unscheduledRuns = [], isLoading: loadingUnscheduled } = useUnscheduledRuns();

  // Mutations
  const scheduleRun = useScheduleRun();
  const rescheduleRun = useRescheduleRun();
  const unscheduleRun = useUnscheduleRun();
  const reorderSchedule = useReorderSchedule();

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<ScheduleRunDetails | null>(null);

  // Group scheduled runs by date
  const runsByDate = useMemo(() => {
    const grouped: Record<string, ScheduledRunWithDetails[]> = {};
    weekDays.forEach(day => {
      grouped[format(day, 'yyyy-MM-dd')] = [];
    });
    scheduledRuns.forEach(schedule => {
      const dateKey = schedule.scheduled_date;
      if (grouped[dateKey]) {
        grouped[dateKey].push(schedule);
      }
    });
    return grouped;
  }, [scheduledRuns, weekDays]);

  // Sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);

    // Find the run being dragged
    if (typeof active.id === 'string' && active.id.startsWith('unscheduled-')) {
      const runId = active.id.replace('unscheduled-', '');
      const run = unscheduledRuns.find(r => r.id === runId);
      if (run) setActiveRun(run);
    } else {
      const schedule = scheduledRuns.find(s => s.id === active.id);
      if (schedule?.run) setActiveRun(schedule.run);
    }
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveRun(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Determine source
    const isFromUnscheduled = activeIdStr.startsWith('unscheduled-');
    const runId = isFromUnscheduled ? activeIdStr.replace('unscheduled-', '') : null;
    const scheduleId = isFromUnscheduled ? null : activeIdStr;

    // Determine destination
    const isToUnscheduled = overIdStr === 'unscheduled';
    const isToDay = overIdStr.startsWith('day-');
    const targetDate = isToDay ? overIdStr.replace('day-', '') : null;

    // Handle different scenarios
    if (isFromUnscheduled && isToDay && runId && targetDate) {
      // Schedule an unscheduled run
      scheduleRun.mutate({
        run_id: runId,
        scheduled_date: targetDate,
      });
    } else if (!isFromUnscheduled && isToUnscheduled && scheduleId) {
      // Unschedule a run
      unscheduleRun.mutate(scheduleId);
    } else if (!isFromUnscheduled && isToDay && scheduleId && targetDate) {
      // Move to different day
      const currentSchedule = scheduledRuns.find(s => s.id === scheduleId);
      if (currentSchedule && currentSchedule.scheduled_date !== targetDate) {
        rescheduleRun.mutate({
          scheduleId,
          newDate: targetDate,
          newSortOrder: (runsByDate[targetDate]?.length || 0) + 1,
        });
      }
    } else if (!isFromUnscheduled && !isToUnscheduled && !isToDay) {
      // Reorder within same day (dropped on another card)
      const overSchedule = scheduledRuns.find(s => s.id === overIdStr);
      const activeSchedule = scheduledRuns.find(s => s.id === scheduleId);
      
      if (overSchedule && activeSchedule && overSchedule.scheduled_date === activeSchedule.scheduled_date) {
        const dayRuns = runsByDate[activeSchedule.scheduled_date] || [];
        const oldIndex = dayRuns.findIndex(r => r.id === activeSchedule.id);
        const newIndex = dayRuns.findIndex(r => r.id === overSchedule.id);
        
        if (oldIndex !== newIndex) {
          // Create new order
          const reordered = [...dayRuns];
          const [removed] = reordered.splice(oldIndex, 1);
          reordered.splice(newIndex, 0, removed);
          
          reorderSchedule.mutate(
            reordered.map((r, i) => ({ id: r.id, sort_order: i + 1 }))
          );
        }
      }
    }
  };

  // Navigation
  const goToPreviousWeek = () => setWeekStart(prev => addDays(prev, -7));
  const goToNextWeek = () => setWeekStart(prev => addDays(prev, 7));
  const goToCurrentWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const isLoading = loadingScheduled || loadingUnscheduled;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
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

        {/* Board */}
        <div className="flex flex-1 overflow-hidden">
          {/* Unscheduled sidebar */}
          <UnscheduledPanel
            runs={unscheduledRuns}
            onRunClick={onRunClick}
          />

          {/* Day columns */}
          <div className="flex-1 flex gap-2 p-4 overflow-x-auto">
            {weekDays.map((day) => (
              <DayColumn
                key={format(day, 'yyyy-MM-dd')}
                date={day}
                scheduledRuns={runsByDate[format(day, 'yyyy-MM-dd')] || []}
                onRunClick={(schedule) => schedule.run && onRunClick?.(schedule.run)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeId && activeRun ? (
          <ScheduleRunCard run={activeRun} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
