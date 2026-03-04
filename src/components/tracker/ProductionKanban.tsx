import React, { useState, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { KanbanColumn } from "./KanbanColumn";
import { useAccessibleJobs } from "@/hooks/tracker/useAccessibleJobs";
import { useUserRole } from "@/hooks/tracker/useUserRole";

const STATUSES = ["Pre-Press", "Awaiting Approval", "Printing", "Finishing", "Packaging", "Shipped", "Completed"];

export const ProductionKanban = () => {
  const { isViewer } = useUserRole();
  const { jobs, isLoading, error, refreshJobs } = useAccessibleJobs({
    permissionType: isViewer ? 'view' : 'manage'
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Status color mapping
  const getStatusColor = (status: string) => {
    const colors = {
      "Pre-Press": "bg-blue-100 text-blue-800",
      "Awaiting Approval": "bg-amber-100 text-amber-800",
      "Printing": "bg-yellow-100 text-yellow-800",
      "Finishing": "bg-purple-100 text-purple-800", 
      "Packaging": "bg-orange-100 text-orange-800",
      "Shipped": "bg-green-100 text-green-800",
      "Completed": "bg-gray-100 text-gray-800"
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  // Filter jobs by stage name - now passing full AccessibleJob objects
  const getJobsByStatus = (status: string) => {
    return jobs.filter(job => job.current_stage_name === status);
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeJobId = String(active.id);
    const activeJob = jobs.find(job => job.job_id === activeJobId);
    if (!activeJob) return;

    const newStatus = String(over.id);
    
    try {
      // Update job status directly in database
      const { error } = await supabase
        .from('production_jobs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', activeJobId);

      if (error) {
        console.error("Error updating job status:", error);
        toast.error(`Failed to move job ${activeJob.wo_no}`);
        return;
      }

      toast.success(`Job ${activeJob.wo_no} moved to ${newStatus}`);
      await refreshJobs();
    } catch (err) {
      console.error('Error updating job status:', err);
      toast.error(`Failed to move job ${activeJob.wo_no}`);
    }
  }, [jobs, refreshJobs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading jobs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <div>
              <p className="font-medium">Error loading kanban board</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Production Kanban Board</h2>
        <p className="text-gray-600">Drag and drop jobs to update their status</p>
        <div className="mt-2 text-sm text-gray-500">
          Total jobs: {jobs.length}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6 overflow-x-auto pb-6">
          {STATUSES.map(status => (
            <KanbanColumn
              key={status}
              id={status}
              title={status}
              jobs={getJobsByStatus(status)}
              colorClass={getStatusColor(status)}
            />
          ))}
        </div>
      </DndContext>

      {jobs.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-gray-500 text-lg">No jobs found</p>
            <p className="text-gray-400">Upload an Excel file to start tracking jobs</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
