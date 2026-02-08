import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { LabelRun, LabelRunStatus, SlotAssignment, LabelSchedule } from '@/types/labels';
import type { Json } from '@/integrations/supabase/types';

const QUERY_KEY = ['label_runs'];

// Helper to safely parse slot_assignments from Json
function parseSlotAssignments(data: Json | null): SlotAssignment[] {
  if (!data || !Array.isArray(data)) return [];
  return data as unknown as SlotAssignment[];
}

// Helper to convert SlotAssignment[] to Json for database
function toJsonSlotAssignments(slots: SlotAssignment[]): Json {
  return slots as unknown as Json;
}

// Helper to parse schedule from array to single object
function parseSchedule(scheduleArray: unknown): LabelSchedule | undefined {
  if (!scheduleArray || !Array.isArray(scheduleArray) || scheduleArray.length === 0) {
    return undefined;
  }
  return scheduleArray[0] as LabelSchedule;
}

export function useLabelRuns(orderId?: string) {
  return useQuery({
    queryKey: orderId ? [...QUERY_KEY, 'order', orderId] : QUERY_KEY,
    queryFn: async (): Promise<LabelRun[]> => {
      let query = supabase
        .from('label_runs')
        .select(`
          *,
          schedule:label_schedule(*)
        `)
        .order('run_number', { ascending: true });

      if (orderId) {
        query = query.eq('order_id', orderId);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching label runs:', error);
        throw error;
      }
      
      return (data || []).map(run => ({
        ...run,
        slot_assignments: parseSlotAssignments(run.slot_assignments),
        schedule: parseSchedule(run.schedule),
      })) as LabelRun[];
    },
    enabled: orderId ? !!orderId : true,
  });
}

export function useLabelRun(runId: string | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, runId],
    queryFn: async (): Promise<LabelRun | null> => {
      if (!runId) return null;

      const { data, error } = await supabase
        .from('label_runs')
        .select(`
          *,
          schedule:label_schedule(*)
        `)
        .eq('id', runId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching label run:', error);
        throw error;
      }
      
      if (!data) return null;
      
      return {
        ...data,
        slot_assignments: parseSlotAssignments(data.slot_assignments),
        schedule: parseSchedule(data.schedule),
      } as LabelRun;
    },
    enabled: !!runId,
  });
}

interface CreateLabelRunInput {
  order_id: string;
  slot_assignments: SlotAssignment[];
  meters_to_print?: number;
  frames_count?: number;
  estimated_duration_minutes?: number;
  ai_optimization_score?: number;
  ai_reasoning?: string;
}

export function useCreateLabelRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateLabelRunInput): Promise<LabelRun> => {
      // Get next run number for this order
      const { data: existingRuns } = await supabase
        .from('label_runs')
        .select('run_number')
        .eq('order_id', input.order_id)
        .order('run_number', { ascending: false })
        .limit(1);

      const nextRunNumber = (existingRuns?.[0]?.run_number || 0) + 1;

      const { data, error } = await supabase
        .from('label_runs')
        .insert({
          order_id: input.order_id,
          run_number: nextRunNumber,
          slot_assignments: toJsonSlotAssignments(input.slot_assignments),
          meters_to_print: input.meters_to_print,
          frames_count: input.frames_count,
          estimated_duration_minutes: input.estimated_duration_minutes,
          ai_optimization_score: input.ai_optimization_score,
          ai_reasoning: input.ai_reasoning,
          status: 'planned',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating label run:', error);
        throw error;
      }

      return {
        ...data,
        slot_assignments: parseSlotAssignments(data.slot_assignments),
      } as LabelRun;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_orders', data.order_id] });
      toast.success('Run created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create run: ${error.message}`);
    },
  });
}

export function useUpdateLabelRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: {
        slot_assignments?: SlotAssignment[];
        meters_to_print?: number | null;
        frames_count?: number | null;
        estimated_duration_minutes?: number | null;
        status?: string;
        ai_optimization_score?: number | null;
        ai_reasoning?: string | null;
        imposed_pdf_url?: string | null;
        imposed_pdf_with_dielines_url?: string | null;
        actual_meters_printed?: number | null;
        completed_at?: string | null;
      };
    }): Promise<LabelRun> => {
      const dbUpdates: Record<string, unknown> = { ...updates };
      if (updates.slot_assignments) {
        dbUpdates.slot_assignments = toJsonSlotAssignments(updates.slot_assignments);
      }

      const { data, error } = await supabase
        .from('label_runs')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating label run:', error);
        throw error;
      }

      return {
        ...data,
        slot_assignments: parseSlotAssignments(data.slot_assignments),
      } as LabelRun;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_orders', data.order_id] });
      toast.success('Run updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update run: ${error.message}`);
    },
  });
}

export function useDeleteLabelRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('label_runs')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting label run:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_orders'] });
      toast.success('Run deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete run: ${error.message}`);
    },
  });
}

export function useUpdateRunStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      status,
      actual_meters_printed
    }: { 
      id: string; 
      status: LabelRunStatus;
      actual_meters_printed?: number;
    }): Promise<LabelRun> => {
      const updates: Record<string, unknown> = { status };
      
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
        if (actual_meters_printed !== undefined) {
          updates.actual_meters_printed = actual_meters_printed;
        }
      }

      const { data, error } = await supabase
        .from('label_runs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating run status:', error);
        throw error;
      }

      return {
        ...data,
        slot_assignments: parseSlotAssignments(data.slot_assignments),
      } as LabelRun;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_orders', data.order_id] });
      queryClient.invalidateQueries({ queryKey: ['label_stock'] });
      toast.success(`Run marked as ${data.status}`);
    },
    onError: (error) => {
      toast.error(`Failed to update run status: ${error.message}`);
    },
  });
}
