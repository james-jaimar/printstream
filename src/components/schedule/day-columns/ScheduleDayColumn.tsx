import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Calendar, RotateCcw, Package, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableScheduleStageCard } from "./SortableScheduleStageCard";
import { useScheduleDnDContext } from "./useScheduleDnDContext";
import type { ScheduleDayData, ScheduledStageData } from "@/hooks/useScheduleReader";
import { supabase } from "@/integrations/supabase/client";
import { AutoReorderConfirmDialog } from "../dialogs/AutoReorderConfirmDialog";
import { groupStagesByPaper, groupStagesByLamination, groupStagesByPaperAndSize, isPrintingStage, isLaminatingStage, isHP12000Stage, type GroupPreview } from "@/utils/schedule/groupingUtils";
import { applyCustomGroupOrder } from "@/utils/schedule/groupReorderUtils";
import { toast } from "sonner";

interface ScheduleDayColumnProps {
  day: ScheduleDayData;
  selectedStageId?: string | null;
  selectedStageName?: string | null;
  onJobClick?: (stage: ScheduledStageData) => void;
  onDiagnosticsClick?: (stage: ScheduledStageData) => void;
  onExpediteClick?: (stage: ScheduledStageData) => void;
  isAdminUser?: boolean;
  onScheduleUpdate?: () => void;
}

export const ScheduleDayColumn: React.FC<ScheduleDayColumnProps> = ({
  day,
  selectedStageId,
  selectedStageName,
  onJobClick,
  onDiagnosticsClick,
  onExpediteClick,
  isAdminUser = false,
  onScheduleUpdate
}) => {
  const [showAutoReorderDialog, setShowAutoReorderDialog] = useState(false);
  const [isProcessingReorder, setIsProcessingReorder] = useState(false);
  const [pendingGroupingType, setPendingGroupingType] = useState<'paper' | 'lamination' | 'paper_and_size' | null>(null);
  const [groupPreviews, setGroupPreviews] = useState<GroupPreview[]>([]);
  
  // Filter stages based on selected stage
  const filteredTimeSlots = React.useMemo(() => {
    if (!selectedStageId) return day.time_slots || [];
    
    return (day.time_slots || []).map(slot => ({
      ...slot,
      scheduled_stages: (slot.scheduled_stages || []).filter(stage => 
        stage.production_stage_id === selectedStageId
      )
    })).filter(slot => slot.scheduled_stages && slot.scheduled_stages.length > 0);
  }, [day.time_slots, selectedStageId]);

  const dayTotalJobs = React.useMemo(() => {
    return filteredTimeSlots.reduce((total, slot) => 
      total + (slot.scheduled_stages?.length || 0), 0
    );
  }, [filteredTimeSlots]);

  const dayTotalMinutes = React.useMemo(() => {
    return filteredTimeSlots.reduce((total, slot) => 
      total + (slot.scheduled_stages?.reduce((stageTotal, stage) => 
        stageTotal + (stage.estimated_duration_minutes || 0), 0
      ) || 0), 0
    );
  }, [filteredTimeSlots]);

  // Handler for reordering stages across the entire day
  const handleReorderStages = async (
    date: string,
    newStageOrder: ScheduledStageData[],
    groupingType?: 'paper' | 'lamination' | 'paper_and_size'
  ) => {
    try {
      // Clean and deduplicate stage IDs to handle cover/text jobs properly
      const rawStageIds = newStageOrder.map(stage => stage.id.replace('-carry', ''));
      const uniqueStageIds = [...new Set(rawStageIds)];
      
      console.log(`Auto-reorder: ${newStageOrder.length} stages -> ${rawStageIds.length} cleaned -> ${uniqueStageIds.length} unique`);
      
      // Validate that we have reasonable stage counts
      if (uniqueStageIds.length === 0) {
        toast.error("No stages to reorder");
        return;
      }
      
      const { error } = await supabase.functions.invoke('schedule-reorder-shift', {
        body: {
          date,
          stageIds: uniqueStageIds,
          dayWideReorder: true,
          shiftStartTime: '08:00',
          shiftEndTime: '17:00',
          groupingType: groupingType || null
        }
      });
      
      if (error) {
        console.error('Error reordering stages:', error);
        throw error;
      }

      // Refresh the schedule data
      if (onScheduleUpdate) {
        onScheduleUpdate();
      }
    } catch (error) {
      console.error('Failed to reorder stages:', error);
      throw error;
    }
  };

  // Handler for auto-reorder buttons
  const handleAutoReorder = async (type: 'paper' | 'lamination' | 'paper_and_size') => {
    if (!isAdminUser || allDayStages.length === 0) return;

    try {
      let grouped: ScheduledStageData[];
      let previews: GroupPreview[];

      if (type === 'paper') {
        const result = groupStagesByPaper(allDayStages);
        grouped = result.grouped;
        previews = result.previews;
      } else if (type === 'paper_and_size') {
        const result = groupStagesByPaperAndSize(allDayStages);
        grouped = result.grouped;
        previews = result.previews;
      } else {
        // For lamination, we need to fetch job finishing specifications
        const jobIds = [...new Set(allDayStages.map(s => s.job_id))];
        const { data: jobSpecs } = await supabase
          .from('production_jobs')
          .select('id, finishing_specifications')
          .in('id', jobIds);

        const specsMap = new Map(jobSpecs?.map(j => [j.id, j.finishing_specifications]) || []);
        const result = groupStagesByLamination(allDayStages, specsMap);
        grouped = result.grouped;
        previews = result.previews;
      }

      // Show confirmation dialog
      setPendingGroupingType(type);
      setGroupPreviews(previews);
      setShowAutoReorderDialog(true);
    } catch (error) {
      console.error('Error preparing auto-reorder:', error);
      toast.error('Failed to prepare job grouping');
    }
  };

  const handleConfirmAutoReorder = async (customGroupOrder?: string[]) => {
    if (!pendingGroupingType) return;

    try {
      setIsProcessingReorder(true);
      
      let grouped: ScheduledStageData[];

      if (customGroupOrder) {
        // Use custom group order from dialog
        
        if (pendingGroupingType === 'lamination') {
          // Need job specs for lamination grouping
          const jobIds = [...new Set(allDayStages.map(s => s.job_id))];
          const { data: jobSpecs } = await supabase
            .from('production_jobs')
            .select('id, finishing_specifications')
            .in('id', jobIds);
          
          const specsMap = new Map(jobSpecs?.map(j => [j.id, j.finishing_specifications]) || []);
          grouped = applyCustomGroupOrder(allDayStages, groupPreviews, customGroupOrder, pendingGroupingType, specsMap);
        } else {
          // For 'paper' and 'paper_and_size' types
          grouped = applyCustomGroupOrder(allDayStages, groupPreviews, customGroupOrder, pendingGroupingType);
        }
      } else {
        // Use default grouping order
        if (pendingGroupingType === 'paper') {
          grouped = groupStagesByPaper(allDayStages).grouped;
        } else if (pendingGroupingType === 'paper_and_size') {
          grouped = groupStagesByPaperAndSize(allDayStages).grouped;
        } else {
          // For lamination, fetch specs again
          const jobIds = [...new Set(allDayStages.map(s => s.job_id))];
          const { data: jobSpecs } = await supabase
            .from('production_jobs')
            .select('id, finishing_specifications')
            .in('id', jobIds);

          const specsMap = new Map(jobSpecs?.map(j => [j.id, j.finishing_specifications]) || []);
          grouped = groupStagesByLamination(allDayStages, specsMap).grouped;
        }
      }

      await handleReorderStages(day.date, grouped, pendingGroupingType);
      
      const groupType = pendingGroupingType === 'paper' ? 'paper specifications' : 
                         pendingGroupingType === 'paper_and_size' ? 'paper specifications & size' : 'lamination type';
      toast.success(`Successfully grouped ${grouped.length} jobs by ${groupType}`);
      
      setShowAutoReorderDialog(false);
      setPendingGroupingType(null);
      setGroupPreviews([]);
    } catch (error) {
      console.error('Error executing auto-reorder:', error);
      toast.error('Failed to reorder jobs');
    } finally {
      setIsProcessingReorder(false);
    }
  };

  // Flatten all stages from all time slots for day-wide dragging
  const allDayStages = React.useMemo(() => {
    return filteredTimeSlots.flatMap(slot => slot.scheduled_stages || []);
  }, [filteredTimeSlots]);

  const { sensors, onDragEnd, isReordering } = useScheduleDnDContext({
    onReorderStages: handleReorderStages,
    isAdminUser
  });

  // Check if current filter allows auto-reorder buttons
  const canShowPaperGrouping = isAdminUser && selectedStageName && isPrintingStage(selectedStageName) && !isHP12000Stage(selectedStageName) && dayTotalJobs > 1;
  const canShowHP12000Grouping = isAdminUser && selectedStageName && isHP12000Stage(selectedStageName) && dayTotalJobs > 1;
  const canShowLaminationGrouping = isAdminUser && selectedStageName && isLaminatingStage(selectedStageName) && dayTotalJobs > 1;

  return (
    <div className="flex-1 min-w-[300px] max-w-[400px]">
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {format(new Date(day.date), 'EEE, MMM d')}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {dayTotalJobs} jobs
              </Badge>
              <Badge variant="outline" className="text-xs">
                {Math.floor(dayTotalMinutes / 60)}h {dayTotalMinutes % 60}m
              </Badge>
            </div>
          </CardTitle>
          
          {/* Auto-reorder buttons */}
          {(canShowPaperGrouping || canShowHP12000Grouping || canShowLaminationGrouping) && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {canShowPaperGrouping && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAutoReorder('paper')}
                  disabled={isReordering || isProcessingReorder}
                  className="text-xs h-7"
                >
                  <Package className="h-3 w-3 mr-1" />
                  Group by Paper
                </Button>
              )}
              {canShowHP12000Grouping && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAutoReorder('paper_and_size')}
                  disabled={isReordering || isProcessingReorder}
                  className="text-xs h-7"
                >
                  <Package className="h-3 w-3 mr-1" />
                  Group by Paper & Size
                </Button>
              )}
              {canShowLaminationGrouping && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAutoReorder('lamination')}
                  disabled={isReordering || isProcessingReorder}
                  className="text-xs h-7"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Group by Lamination
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredTimeSlots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No scheduled jobs</p>
              {selectedStageId && (
                <p className="text-xs mt-1">for selected stage</p>
              )}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => onDragEnd(event, allDayStages, day.date)}
            >
              <SortableContext 
                items={allDayStages.map(stage => stage.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className={`space-y-3 ${isReordering ? 'opacity-60' : ''}`}>
                  {filteredTimeSlots.map((slot, slotIndex) => (
                    <div key={slotIndex} className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {slot.time_slot}
                      </div>
                      
                      <div className="space-y-2">
                        {(slot.scheduled_stages || []).map((stage) => (
                          <SortableScheduleStageCard
                            key={stage.id}
                            stage={stage}
                            onJobClick={onJobClick}
                            onDiagnosticsClick={onDiagnosticsClick}
                            onExpediteClick={onExpediteClick}
                            isAdminUser={isAdminUser}
                            disabled={isReordering || stage.is_split_job}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SortableContext>
              
              {isReordering && (
                <div className="flex items-center justify-center py-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RotateCcw className="h-3 w-3 animate-spin" />
                    Recalculating schedule...
                  </div>
                </div>
              )}
            </DndContext>
          )}
        </CardContent>
      </Card>
      
      <AutoReorderConfirmDialog
        isOpen={showAutoReorderDialog}
        onClose={() => {
          setShowAutoReorderDialog(false);
          setPendingGroupingType(null);
          setGroupPreviews([]);
        }}
        onConfirm={handleConfirmAutoReorder}
        isProcessing={isProcessingReorder}
        groupingType={pendingGroupingType === 'paper_and_size' ? 'paper' : (pendingGroupingType || 'paper')}
        groupPreviews={groupPreviews}
        totalJobs={allDayStages.length}
      />
    </div>
  );
};