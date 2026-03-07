import React, { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { GripVertical, ArrowUp, ArrowDown, Layers, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ScheduleDayData, ScheduledStageData } from "@/hooks/useScheduleReader";
import { getStageGroupKey, isHP12000Stage } from "@/utils/schedule/groupingUtils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface MultiShiftGroupingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleDays: ScheduleDayData[];
  onComplete: () => void;
}

interface PaperGroup {
  key: string;
  stages: ScheduledStageData[];
  totalMinutes: number;
  jobs: string[];
}

interface GroupWithBreaks extends PaperGroup {
  cumulativeStart: number;
  cumulativeEnd: number;
  dayIndex: number;
  crossesDayBoundary: boolean;
  dayBreakAfter?: number;
}

const SHIFT_MINUTES = 480; // 8 hours

// Sortable group row component
function SortableGroupRow({
  group,
  index,
  totalGroups,
  onMoveUp,
  onMoveDown,
}: {
  group: GroupWithBreaks;
  index: number;
  totalGroups: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-card p-2.5 transition-colors ${
        isDragging ? 'opacity-50 shadow-lg z-50' : 'hover:bg-accent/50'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{group.key}</span>
          <Badge variant="secondary" className="text-[10px]">
            {group.stages.length} {group.stages.length === 1 ? 'job' : 'jobs'}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {group.totalMinutes}min
          </Badge>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {group.jobs.join(', ')}
        </div>
      </div>

      {/* Cumulative time indicator */}
      <div className="text-[10px] text-muted-foreground text-right flex-shrink-0 w-16">
        {Math.floor(group.cumulativeEnd / 60)}h{group.cumulativeEnd % 60 > 0 ? ` ${group.cumulativeEnd % 60}m` : ''}
      </div>

      {/* Move buttons */}
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onMoveUp}
          disabled={index === 0}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onMoveDown}
          disabled={index === totalGroups - 1}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function MultiShiftGroupingDialog({
  open,
  onOpenChange,
  scheduleDays,
  onComplete,
}: MultiShiftGroupingDialogProps) {
  const [numDays, setNumDays] = useState<number>(3);
  const [isApplying, setIsApplying] = useState(false);

  // Get consecutive working days from schedule
  const availableDays = useMemo(() => {
    return scheduleDays
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5); // max 5 days shown
  }, [scheduleDays]);

  const selectedDays = availableDays.slice(0, numDays);

  // Collect all HP12000 stages across selected days
  const hp12000Stages = useMemo(() => {
    const stages: ScheduledStageData[] = [];
    selectedDays.forEach(day => {
      day.time_slots.forEach(slot => {
        slot.scheduled_stages.forEach(stage => {
          if (isHP12000Stage(stage.stage_name) && !stage.id.endsWith('-carry')) {
            stages.push(stage);
          }
        });
      });
    });
    return stages;
  }, [selectedDays]);

  // Group stages by paper + size
  const [orderedGroups, setOrderedGroups] = useState<PaperGroup[]>([]);

  // Build groups when stages change
  useEffect(() => {
    const groupMap = new Map<string, ScheduledStageData[]>();
    hp12000Stages.forEach(stage => {
      const key = getStageGroupKey(stage);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(stage);
    });

    const groups: PaperGroup[] = Array.from(groupMap.entries())
      .map(([key, stages]) => ({
        key,
        stages,
        totalMinutes: stages.reduce((sum, s) => sum + s.estimated_duration_minutes, 0),
        jobs: [...new Set(stages.map(s => s.job_wo_no))],
      }))
      .sort((a, b) => a.key.localeCompare(b.key));

    setOrderedGroups(groups);
  }, [hp12000Stages]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedGroups((items) => {
        const oldIndex = items.findIndex((item) => item.key === active.id);
        const newIndex = items.findIndex((item) => item.key === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Calculate cumulative minutes and day breaks
  const groupsWithBreaks = useMemo(() => {
    let cumulative = 0;
    return orderedGroups.map(group => {
      const start = cumulative;
      cumulative += group.totalMinutes;
      const dayIndex = Math.min(Math.floor(start / SHIFT_MINUTES), numDays - 1);
      const nextDayIndex = Math.min(Math.floor(cumulative / SHIFT_MINUTES), numDays - 1);
      const crossesDayBoundary = nextDayIndex > dayIndex;
      return {
        ...group,
        cumulativeStart: start,
        cumulativeEnd: cumulative,
        dayIndex,
        crossesDayBoundary,
        dayBreakAfter: crossesDayBoundary ? nextDayIndex : undefined,
      };
    });
  }, [orderedGroups, numDays]);

  const totalMinutes = hp12000Stages.reduce((sum, s) => sum + s.estimated_duration_minutes, 0);
  const totalCapacity = numDays * SHIFT_MINUTES;
  const paperChangeCount = orderedGroups.length;

  // Move group up/down
  const moveGroup = (index: number, direction: 'up' | 'down') => {
    const newGroups = [...orderedGroups];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newGroups.length) return;
    [newGroups[index], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[index]];
    setOrderedGroups(newGroups);
  };

  // Apply the grouping
  const handleApply = async () => {
    const ok = window.confirm(
      `This will reorder ${hp12000Stages.length} HP12000 stages across ${numDays} days and trigger a full reschedule of all downstream stages. Continue?`
    );
    if (!ok) return;

    setIsApplying(true);
    try {
      const orderedStages: ScheduledStageData[] = [];
      orderedGroups.forEach(group => {
        const sorted = [...group.stages].sort((a, b) => {
          const woComp = a.job_wo_no.localeCompare(b.job_wo_no);
          if (woComp !== 0) return woComp;
          return (a.stage_order || 0) - (b.stage_order || 0);
        });
        orderedStages.push(...sorted);
      });

      const dayDates = selectedDays.map(d => d.date);
      let currentDay = 0;
      let usedMinutes = 0;
      
      const updates: { id: string; start_at: string; end_at: string }[] = [];

      for (const stage of orderedStages) {
        const duration = stage.estimated_duration_minutes;
        
        if (usedMinutes + duration > SHIFT_MINUTES && currentDay < numDays - 1) {
          currentDay++;
          usedMinutes = 0;
        }

        const date = dayDates[currentDay];
        const startHour = 8 + Math.floor(usedMinutes / 60);
        const startMin = usedMinutes % 60;
        const endMinutes = usedMinutes + duration;
        const endHour = 8 + Math.floor(endMinutes / 60);
        const endMin = endMinutes % 60;

        const startAt = `${date}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;
        const endAt = `${date}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`;

        const cleanId = stage.id.replace('-carry', '');
        updates.push({ id: cleanId, start_at: startAt, end_at: endAt });
        usedMinutes += duration;
      }

      toast.message(`Updating ${updates.length} HP12000 stages…`);

      for (const update of updates) {
        const { error } = await supabase
          .from('job_stage_instances')
          .update({
            scheduled_start_at: update.start_at,
            scheduled_end_at: update.end_at,
            scheduling_method: 'multi_shift_grouping',
          })
          .eq('id', update.id);

        if (error) {
          console.error(`Failed to update stage ${update.id}:`, error);
          throw new Error(`Failed to update stage: ${error.message}`);
        }
      }

      toast.message("HP12000 stages updated. Running full reschedule for downstream stages…");

      const { error: rescheduleError } = await supabase.functions.invoke('simple-scheduler', {
        body: {
          commit: true,
          proposed: false,
          onlyIfUnset: false,
          nuclear: false,
          wipeAll: false,
        }
      });

      if (rescheduleError) {
        console.error("Reschedule error:", rescheduleError);
        toast.error("HP12000 stages were reordered, but downstream reschedule failed. Try running Reschedule All manually.");
      } else {
        toast.success(`✅ Multi-shift grouping applied: ${updates.length} stages across ${numDays} days. ${paperChangeCount} paper groups.`);
      }

      onOpenChange(false);
      setTimeout(() => onComplete(), 2000);
    } catch (err: any) {
      console.error("Multi-shift grouping failed:", err);
      toast.error(`Failed: ${err?.message || err}`);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Multi-Shift Production Grouping
          </DialogTitle>
          <DialogDescription>
            Reorder paper groups across multiple days to minimize paper changes on the HP12000
          </DialogDescription>
        </DialogHeader>

        {/* Controls */}
        <div className="flex items-center gap-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Days:</span>
            <Select
              value={String(numDays)}
              onValueChange={(v) => setNumDays(Number(v))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5].filter(n => n <= availableDays.length).map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {selectedDays[0]?.date} → {selectedDays[selectedDays.length - 1]?.date}
            </span>
            <span>•</span>
            <span>{hp12000Stages.length} stages</span>
            <span>•</span>
            <span>{paperChangeCount} paper groups</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m / {Math.floor(totalCapacity / 60)}h capacity
            </span>
          </div>
        </div>

        <Separator />

        {/* Group List - native scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-1 pr-2 py-2">
            {groupsWithBreaks.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No HP12000 stages found in the selected days
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={groupsWithBreaks.map(g => g.key)}
                  strategy={verticalListSortingStrategy}
                >
                  {groupsWithBreaks.map((group, index) => (
                    <React.Fragment key={group.key}>
                      {/* Day break indicator */}
                      {index > 0 && groupsWithBreaks[index - 1].dayBreakAfter !== undefined && (
                        <div className="flex items-center gap-2 py-1.5 px-2">
                          <Separator className="flex-1" />
                          <Badge variant="outline" className="text-[10px] font-medium whitespace-nowrap">
                            Day {groupsWithBreaks[index - 1].dayBreakAfter! + 1} — {selectedDays[groupsWithBreaks[index - 1].dayBreakAfter!]?.day_name} {selectedDays[groupsWithBreaks[index - 1].dayBreakAfter!]?.date}
                          </Badge>
                          <Separator className="flex-1" />
                        </div>
                      )}

                      {/* First day indicator */}
                      {index === 0 && (
                        <div className="flex items-center gap-2 py-1 px-2">
                          <Badge variant="outline" className="text-[10px] font-medium">
                            Day 1 — {selectedDays[0]?.day_name} {selectedDays[0]?.date}
                          </Badge>
                        </div>
                      )}

                      <SortableGroupRow
                        group={group}
                        index={index}
                        totalGroups={orderedGroups.length}
                        onMoveUp={() => moveGroup(index, 'up')}
                        onMoveDown={() => moveGroup(index, 'down')}
                      />
                    </React.Fragment>
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <Separator />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={isApplying || hp12000Stages.length === 0}
          >
            {isApplying ? "Applying…" : `Apply Grouping (${hp12000Stages.length} stages)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
