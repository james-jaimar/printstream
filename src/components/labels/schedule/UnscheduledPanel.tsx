/**
 * Unscheduled Panel for Label Schedule Board
 * Shows runs that haven't been scheduled yet
 */

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';
import { DraggableRunCard } from './ScheduleRunCard';
import type { ScheduleRunDetails } from '@/hooks/labels/useLabelSchedule';

interface UnscheduledRun extends ScheduleRunDetails {
  // No additional fields needed
}

interface UnscheduledPanelProps {
  runs: UnscheduledRun[];
  onRunClick?: (run: UnscheduledRun) => void;
}

export function UnscheduledPanel({ runs, onRunClick }: UnscheduledPanelProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unscheduled',
    data: {
      type: 'unscheduled',
    },
  });

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] border-r">
      {/* Header */}
      <div className="p-3 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-semibold">Unscheduled</p>
            <p className="text-xs text-muted-foreground">
              {runs.length} run{runs.length !== 1 ? 's' : ''} pending
            </p>
          </div>
        </div>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 p-2 space-y-2 overflow-y-auto bg-background',
          isOver && 'bg-primary/10 ring-2 ring-primary ring-inset'
        )}
      >
        <SortableContext
          items={runs.map(r => `unscheduled-${r.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {runs.map((run) => (
            <DraggableRunCard
              key={run.id}
              id={`unscheduled-${run.id}`}
              run={run}
              onClick={() => onRunClick?.(run)}
            />
          ))}
        </SortableContext>

        {runs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center text-xs text-muted-foreground">
            <Inbox className="h-8 w-8 mb-2 opacity-50" />
            <p>All runs scheduled!</p>
          </div>
        )}
      </div>
    </div>
  );
}
