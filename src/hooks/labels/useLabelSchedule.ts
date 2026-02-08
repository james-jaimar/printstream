/**
 * Hook for managing label schedule (label_schedule table)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { LabelSchedule, LabelScheduleStatus } from '@/types/labels';
import { format, startOfWeek, addDays } from 'date-fns';

const QUERY_KEY = ['label_schedule'];

// Lightweight run details for schedule display (not the full LabelRun type)
export interface ScheduleRunDetails {
  id: string;
  run_number: number;
  order_id: string;
  meters_to_print: number | null;
  frames_count: number | null;
  estimated_duration_minutes: number | null;
  status: string;
  order?: {
    id: string;
    order_number: string;
    customer_name: string;
    substrate_id: string | null;
  };
}

export interface ScheduledRunWithDetails extends Omit<LabelSchedule, 'run'> {
  run?: ScheduleRunDetails;
}

/**
 * Fetch scheduled runs for a date range
 */
export function useLabelSchedule(startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: [...QUERY_KEY, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async (): Promise<ScheduledRunWithDetails[]> => {
      let query = supabase
        .from('label_schedule')
        .select(`
          *,
          run:label_runs(
            id,
            run_number,
            order_id,
            meters_to_print,
            frames_count,
            estimated_duration_minutes,
            status,
            order:label_orders(
              id,
              order_number,
              customer_name,
              substrate_id
            )
          )
        `)
        .order('scheduled_date', { ascending: true })
        .order('sort_order', { ascending: true });

      if (startDate) {
        query = query.gte('scheduled_date', format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        query = query.lte('scheduled_date', format(endDate, 'yyyy-MM-dd'));
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching label schedule:', error);
        throw error;
      }

      // Flatten the nested run data
      return (data || []).map(schedule => ({
        ...schedule,
        run: Array.isArray(schedule.run) ? schedule.run[0] : schedule.run,
      })) as ScheduledRunWithDetails[];
    },
  });
}

/**
 * Fetch unscheduled runs (approved runs without schedule entries)
 */
export function useUnscheduledRuns() {
  return useQuery({
    queryKey: [...QUERY_KEY, 'unscheduled'],
    queryFn: async () => {
      // Get runs that are approved but not in schedule
      const { data: scheduledRunIds } = await supabase
        .from('label_schedule')
        .select('run_id');

      const scheduledIds = (scheduledRunIds || []).map(s => s.run_id);

      let query = supabase
        .from('label_runs')
        .select(`
          id,
          run_number,
          order_id,
          meters_to_print,
          frames_count,
          estimated_duration_minutes,
          status,
          order:label_orders(
            id,
            order_number,
            customer_name,
            substrate_id
          )
        `)
        .in('status', ['planned', 'approved'])
        .order('created_at', { ascending: true });

      // Exclude already scheduled runs
      if (scheduledIds.length > 0) {
        query = query.not('id', 'in', `(${scheduledIds.join(',')})`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching unscheduled runs:', error);
        throw error;
      }

      return (data || []).map(run => ({
        ...run,
        order: Array.isArray(run.order) ? run.order[0] : run.order,
      }));
    },
  });
}

interface ScheduleRunInput {
  run_id: string;
  scheduled_date: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  printer_id?: string;
  operator_id?: string;
  notes?: string;
  sort_order?: number;
}

export function useScheduleRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ScheduleRunInput): Promise<LabelSchedule> => {
      // Get max sort order for this date
      const { data: existing } = await supabase
        .from('label_schedule')
        .select('sort_order')
        .eq('scheduled_date', input.scheduled_date)
        .order('sort_order', { ascending: false })
        .limit(1);

      const sortOrder = input.sort_order ?? ((existing?.[0]?.sort_order || 0) + 1);

      const { data, error } = await supabase
        .from('label_schedule')
        .insert({
          run_id: input.run_id,
          scheduled_date: input.scheduled_date,
          scheduled_start_time: input.scheduled_start_time || null,
          scheduled_end_time: input.scheduled_end_time || null,
          printer_id: input.printer_id || null,
          operator_id: input.operator_id || null,
          notes: input.notes || null,
          sort_order: sortOrder,
          status: 'scheduled',
        })
        .select()
        .single();

      if (error) {
        console.error('Error scheduling run:', error);
        throw error;
      }

      return data as LabelSchedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_runs'] });
      toast.success('Run scheduled');
    },
    onError: (error) => {
      toast.error(`Failed to schedule run: ${error.message}`);
    },
  });
}

export function useRescheduleRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scheduleId,
      newDate,
      newSortOrder,
    }: {
      scheduleId: string;
      newDate: string;
      newSortOrder: number;
    }): Promise<LabelSchedule> => {
      const { data, error } = await supabase
        .from('label_schedule')
        .update({
          scheduled_date: newDate,
          sort_order: newSortOrder,
        })
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.error('Error rescheduling run:', error);
        throw error;
      }

      return data as LabelSchedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Run rescheduled');
    },
    onError: (error) => {
      toast.error(`Failed to reschedule: ${error.message}`);
    },
  });
}

export function useUnscheduleRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scheduleId: string): Promise<void> => {
      const { error } = await supabase
        .from('label_schedule')
        .delete()
        .eq('id', scheduleId);

      if (error) {
        console.error('Error unscheduling run:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_runs'] });
      toast.success('Run unscheduled');
    },
    onError: (error) => {
      toast.error(`Failed to unschedule: ${error.message}`);
    },
  });
}

export function useUpdateScheduleStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scheduleId,
      status,
      actualStartTime,
      actualEndTime,
    }: {
      scheduleId: string;
      status: LabelScheduleStatus;
      actualStartTime?: string;
      actualEndTime?: string;
    }): Promise<LabelSchedule> => {
      const updates: Record<string, unknown> = { status };

      if (status === 'in_progress' && !actualStartTime) {
        updates.actual_start_time = new Date().toISOString();
      } else if (actualStartTime) {
        updates.actual_start_time = actualStartTime;
      }

      if (status === 'completed' && !actualEndTime) {
        updates.actual_end_time = new Date().toISOString();
      } else if (actualEndTime) {
        updates.actual_end_time = actualEndTime;
      }

      const { data, error } = await supabase
        .from('label_schedule')
        .update(updates)
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.error('Error updating schedule status:', error);
        throw error;
      }

      return data as LabelSchedule;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_runs'] });
      toast.success(`Schedule marked as ${data.status}`);
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });
}

/**
 * Reorder runs within a day
 */
export function useReorderSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]): Promise<void> => {
      // Update each schedule entry's sort order
      for (const update of updates) {
        const { error } = await supabase
          .from('label_schedule')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);

        if (error) {
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => {
      toast.error(`Failed to reorder: ${error.message}`);
    },
  });
}
