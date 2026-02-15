/**
 * Run Detail Modal
 * Production execution UI for completing runs, recording actual meters,
 * and drag-and-drop reordering of slot assignments
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  Clock,
  Layers,
  Ruler,
  AlertTriangle,
  Loader2,
  GripVertical,
} from 'lucide-react';
import { useUpdateRunStatus, useUpdateRunSlots } from '@/hooks/labels/useLabelRuns';
import type { LabelRun, LabelRunStatus, LabelItem, SlotAssignment } from '@/types/labels';

interface RunDetailModalProps {
  run: LabelRun | null;
  items: LabelItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<LabelRunStatus, { 
  label: string; 
  color: string;
  bgColor: string;
}> = {
  planned: { label: 'Planned', color: 'text-slate-600', bgColor: 'bg-slate-100' },
  approved: { label: 'Approved', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  printing: { label: 'Printing', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  completed: { label: 'Completed', color: 'text-green-600', bgColor: 'bg-green-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bgColor: 'bg-red-100' },
};

// Sortable slot row component
function SortableSlotRow({ 
  slot, 
  index, 
  itemName 
}: { 
  slot: SlotAssignment; 
  index: number; 
  itemName: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `slot-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded"
    >
      <button
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="font-mono ml-1">Slot {slot.slot}</span>
      <span className="truncate mx-2 flex-1">{itemName}</span>
      <span className="text-muted-foreground">×{slot.quantity_in_slot}</span>
    </div>
  );
}

export function RunDetailModal({ run, items, open, onOpenChange }: RunDetailModalProps) {
  const [actualMeters, setActualMeters] = useState<string>('');
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [localSlots, setLocalSlots] = useState<SlotAssignment[]>([]);
  
  const updateStatus = useUpdateRunStatus();
  const updateSlots = useUpdateRunSlots();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Sync local slots when run changes
  useEffect(() => {
    if (run?.slot_assignments) {
      setLocalSlots(run.slot_assignments);
    }
  }, [run?.slot_assignments]);

  if (!run) return null;

  const status = statusConfig[run.status];
  const canComplete = run.status === 'printing';
  const isCompleted = run.status === 'completed';
  const canReorder = run.status === 'planned' || run.status === 'approved';

  const getItemName = (itemId: string) => {
    return items.find(i => i.id === itemId)?.name || 'Unknown';
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localSlots.findIndex((_, i) => `slot-${i}` === active.id);
    const newIndex = localSlots.findIndex((_, i) => `slot-${i}` === over.id);

    const newSlots = arrayMove(localSlots, oldIndex, newIndex).map((slot, idx) => ({
      ...slot,
      slot: idx + 1,
    }));

    setLocalSlots(newSlots);
    updateSlots.mutate({ id: run.id, slot_assignments: newSlots });
  };

  const handleCompleteRun = () => {
    const meters = actualMeters ? parseFloat(actualMeters) : run.meters_to_print || 0;
    
    updateStatus.mutate(
      { 
        id: run.id, 
        status: 'completed',
        actual_meters_printed: meters,
      },
      {
        onSuccess: () => {
          setShowCompleteForm(false);
          setActualMeters('');
          onOpenChange(false);
        },
      }
    );
  };

  const wastePercentage = run.actual_meters_printed && run.meters_to_print
    ? ((run.actual_meters_printed - run.meters_to_print) / run.meters_to_print * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>Run {run.run_number}</DialogTitle>
            <Badge className={`${status.bgColor} ${status.color}`}>
              {status.label}
            </Badge>
          </div>
          <DialogDescription>
            Production run details and execution controls
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <Ruler className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-semibold">
                {run.meters_to_print?.toFixed(1) || '—'}m
              </div>
              <div className="text-xs text-muted-foreground">Est. Meters</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <Layers className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-semibold">
                {run.frames_count || '—'}
              </div>
              <div className="text-xs text-muted-foreground">Frames</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-semibold">
                {run.estimated_duration_minutes || '—'}
              </div>
              <div className="text-xs text-muted-foreground">Minutes</div>
            </div>
          </div>

          {/* AI Score */}
          {run.ai_optimization_score && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">AI Optimization Score</span>
                <span className="text-sm font-bold">{run.ai_optimization_score}%</span>
              </div>
              <Progress value={run.ai_optimization_score} className="h-2" />
              {run.ai_reasoning && (
                <p className="text-xs text-muted-foreground mt-2">{run.ai_reasoning}</p>
              )}
            </div>
          )}

          {/* Slot Assignments with Drag-and-Drop */}
          {localSlots.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Slot Assignments</h4>
                {canReorder && (
                  <span className="text-xs text-muted-foreground">Drag to reorder</span>
                )}
              </div>
              {canReorder ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={localSlots.map((_, i) => `slot-${i}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {localSlots.map((slot, idx) => (
                        <SortableSlotRow
                          key={`slot-${idx}`}
                          slot={slot}
                          index={idx}
                          itemName={getItemName(slot.item_id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="space-y-1">
                  {localSlots.map((slot, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded"
                    >
                      <span className="font-mono">Slot {slot.slot}</span>
                      <span className="truncate mx-2 flex-1">{getItemName(slot.item_id)}</span>
                      <span className="text-muted-foreground">×{slot.quantity_in_slot}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completed Stats */}
          {isCompleted && run.actual_meters_printed && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Completion Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Actual Meters:</span>
                    <span className="ml-2 font-mono font-medium">
                      {run.actual_meters_printed.toFixed(1)}m
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Variance:</span>
                    <span className={`ml-2 font-mono font-medium ${
                      wastePercentage > 5 ? 'text-red-600' : 
                      wastePercentage > 0 ? 'text-amber-600' : 'text-green-600'
                    }`}>
                      {wastePercentage > 0 ? '+' : ''}{wastePercentage.toFixed(1)}%
                    </span>
                  </div>
                  {run.completed_at && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Completed:</span>
                      <span className="ml-2">
                        {format(new Date(run.completed_at), 'PPp')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Complete Form */}
          {showCompleteForm && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">Record actual production</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actualMeters">Actual Meters Printed</Label>
                  <Input
                    id="actualMeters"
                    type="number"
                    step="0.1"
                    placeholder={run.meters_to_print?.toFixed(1) || '0'}
                    value={actualMeters}
                    onChange={(e) => setActualMeters(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use estimated value ({run.meters_to_print?.toFixed(1)}m)
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {canComplete && !showCompleteForm && (
            <Button
              onClick={() => setShowCompleteForm(true)}
              variant="outline"
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete Run
            </Button>
          )}
          
          {showCompleteForm && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowCompleteForm(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCompleteRun}
                disabled={updateStatus.isPending}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {updateStatus.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm Complete
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
