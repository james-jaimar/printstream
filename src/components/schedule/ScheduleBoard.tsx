/**
 * Schedule Board - Production workflow-style layout with sidebar and day columns
 * NOW WITH WEEK NAVIGATION FOR VIEWING ONE WEEK AT A TIME
 */

import React, { useState, useMemo } from "react";
import { ScheduleProductionSidebar } from "./sidebar/ScheduleProductionSidebar";
import { ScheduleWorkflowHeader } from "./header/ScheduleWorkflowHeader";
import { ScheduleDayColumn } from "./day-columns/ScheduleDayColumn";
import { WeekNavigation } from "./navigation/WeekNavigation";
import { JobDiagnosticsModal } from "./JobDiagnosticsModal";
import { MasterOrderModal } from "@/components/tracker/modals/MasterOrderModal";
import type { ScheduleDayData, ScheduledStageData } from "@/hooks/useScheduleReader";
import type { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";
import { useJobDiagnostics } from "@/hooks/useJobDiagnostics";
import { startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScheduleBoardProps {
  scheduleDays: ScheduleDayData[];
  isLoading: boolean;
  onRefresh: () => void;
  onReschedule: () => void;
  isAdminUser?: boolean;
}

export function ScheduleBoard({ 
  scheduleDays, 
  isLoading, 
  onRefresh, 
  onReschedule,
  isAdminUser = false
}: ScheduleBoardProps) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedStageName, setSelectedStageName] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  
  // Master Order Modal state
  const [selectedJob, setSelectedJob] = useState<AccessibleJob | null>(null);
  const [masterModalOpen, setMasterModalOpen] = useState(false);
  
  // Diagnostics Modal state
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const { isLoading: diagnosticsLoading, diagnostics, getDiagnostics } = useJobDiagnostics();

  // Filter schedule days to only show the current week (Monday to Friday)
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 }); // Sunday
  
  const weekScheduleDays = scheduleDays.filter(day => {
    const dayDate = new Date(day.date);
    return isWithinInterval(dayDate, { start: weekStart, end: weekEnd }) && 
           dayDate.getDay() >= 1 && dayDate.getDay() <= 5; // Monday to Friday only
  });

  // Filter schedule days based on search query
  const filteredScheduleDays = useMemo(() => {
    if (!searchQuery.trim()) return weekScheduleDays;
    
    const query = searchQuery.toLowerCase();
    return weekScheduleDays.map(day => ({
      ...day,
      time_slots: day.time_slots.map(slot => ({
        ...slot,
        scheduled_stages: slot.scheduled_stages.filter(stage => 
          stage.job_wo_no?.toLowerCase().includes(query) ||
          stage.job_customer?.toLowerCase().includes(query)
        )
      })).filter(slot => slot.scheduled_stages.length > 0),
      total_stages: day.time_slots.reduce((total, slot) => 
        total + slot.scheduled_stages.filter(stage => 
          stage.job_wo_no?.toLowerCase().includes(query) ||
          stage.job_customer?.toLowerCase().includes(query)
        ).length, 0
      ),
      total_minutes: day.time_slots.reduce((total, slot) => 
        total + slot.scheduled_stages
          .filter(stage => 
            stage.job_wo_no?.toLowerCase().includes(query) ||
            stage.job_customer?.toLowerCase().includes(query)
          )
          .reduce((slotTotal, stage) => slotTotal + stage.estimated_duration_minutes, 0), 0
      )
    })).filter(day => day.time_slots.some(slot => slot.scheduled_stages.length > 0));
  }, [weekScheduleDays, searchQuery]);

  const handleStageSelect = (stageId: string | null, stageName: string | null) => {
    setSelectedStageId(stageId);
    setSelectedStageName(stageName);
  };

  // Fetch full job data and open Master Order Modal
  const handleJobClick = async (stage: ScheduledStageData) => {
    console.log('Job clicked - opening master modal:', stage);
    
    try {
      const { data: jobData, error } = await supabase
        .from('production_jobs')
        .select(`
          *,
          categories (id, name, color)
        `)
        .eq('id', stage.job_id)
        .single();

      if (error || !jobData) {
        toast.error('Failed to load job details');
        return;
      }

      // Convert to AccessibleJob format for MasterOrderModal
      const accessibleJob: AccessibleJob = {
        job_id: jobData.id,
        id: stage.id,
        wo_no: jobData.wo_no,
        customer: jobData.customer || '',
        status: jobData.status || 'Unknown',
        due_date: jobData.due_date || '',
        original_committed_due_date: jobData.original_committed_due_date,
        reference: jobData.reference || '',
        category_id: jobData.category_id,
        category_name: jobData.categories?.name || 'No Category',
        category_color: jobData.categories?.color || '#6B7280',
        current_stage_id: stage.production_stage_id,
        current_stage_name: stage.stage_name,
        current_stage_color: stage.stage_color || '#6B7280',
        current_stage_status: stage.status,
        user_can_view: true,
        user_can_edit: isAdminUser,
        user_can_work: true,
        user_can_manage: isAdminUser,
        workflow_progress: 0,
        total_stages: 0,
        completed_stages: 0,
        display_stage_name: stage.stage_name,
        qty: jobData.qty || 0,
        has_custom_workflow: jobData.has_custom_workflow || false,
        is_in_batch_processing: false,
      };

      setSelectedJob(accessibleJob);
      setMasterModalOpen(true);
    } catch (err) {
      console.error('Error fetching job:', err);
      toast.error('Failed to load job details');
    }
  };

  // Open diagnostics modal (triggered by icon button on card)
  const handleDiagnosticsClick = async (stage: ScheduledStageData) => {
    console.log('Diagnostics clicked:', stage);
    setDiagnosticsOpen(true);
    await getDiagnostics(stage.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background p-4">
        <ScheduleWorkflowHeader
          scheduleDays={filteredScheduleDays}
          selectedStageName={selectedStageName}
          isLoading={isLoading}
          onRefresh={onRefresh}
          onReschedule={onReschedule}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        
        {/* Week Navigation */}
        <div className="mt-4 flex justify-center">
          <WeekNavigation
            currentWeek={currentWeek}
            onWeekChange={setCurrentWeek}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r bg-background overflow-y-auto">
          <ScheduleProductionSidebar
            scheduleDays={filteredScheduleDays}
            selectedStageId={selectedStageId}
            selectedStageName={selectedStageName}
            onStageSelect={handleStageSelect}
          />
        </div>
        
        {/* Day Columns */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-x-auto overflow-y-auto">
            <div className="flex gap-4 p-4 min-w-max">
              {filteredScheduleDays.map((day) => (
            <ScheduleDayColumn 
              key={day.date}
              day={day}
              selectedStageId={selectedStageId}
              selectedStageName={selectedStageName}
              onJobClick={handleJobClick}
              onDiagnosticsClick={handleDiagnosticsClick}
              isAdminUser={isAdminUser}
              onScheduleUpdate={onRefresh}
            />
              ))}
              
              {filteredScheduleDays.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <p className="text-lg font-medium mb-2">
                      {searchQuery ? 'No jobs match your search' : 'No scheduled days for this week'}
                    </p>
                    <p className="text-sm">
                      {searchQuery ? 'Try a different search term' : 'Use the week navigation to view other weeks or reschedule jobs'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Master Order Modal */}
      <MasterOrderModal
        isOpen={masterModalOpen}
        onClose={() => {
          setMasterModalOpen(false);
          setSelectedJob(null);
        }}
        job={selectedJob}
        onRefresh={onRefresh}
      />

      {/* Job Diagnostics Modal */}
      <JobDiagnosticsModal
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
        diagnostics={diagnostics}
        isLoading={diagnosticsLoading}
      />
    </div>
  );
}