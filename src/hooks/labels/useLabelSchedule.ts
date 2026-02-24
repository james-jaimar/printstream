/**
 * Hook for managing label schedule (label_schedule table)
 * Schedule operates at ORDER level - all runs for an order are grouped together
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { LabelSchedule, LabelScheduleStatus } from '@/types/labels';
import { format } from 'date-fns';

const QUERY_KEY = ['label_schedule'];

/** Helper to generate a material grouping key */
export function getMaterialKey(substrateType?: string | null, glueType?: string | null, widthMm?: number | null): string {
  const parts = [substrateType || 'Unknown'];
  if (glueType) parts.push(glueType);
  if (widthMm) parts.push(`${widthMm}mm`);
  return parts.join(' | ');
}

/** Substrate color map for UI */
export const SUBSTRATE_COLORS: Record<string, string> = {
  'PP': 'bg-blue-100 text-blue-800 border-blue-300',
  'Semi Gloss': 'bg-green-100 text-green-800 border-green-300',
  'PE': 'bg-purple-100 text-purple-800 border-purple-300',
  'PET': 'bg-amber-100 text-amber-800 border-amber-300',
  'Vinyl': 'bg-red-100 text-red-800 border-red-300',
  'Paper': 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

export function getSubstrateColor(substrateType?: string | null): string {
  if (!substrateType) return 'bg-gray-100 text-gray-800 border-gray-300';
  return SUBSTRATE_COLORS[substrateType] || 'bg-gray-100 text-gray-800 border-gray-300';
}

/** Capacity constants */
export const DAILY_CAPACITY_MINUTES = 420; // 7 hours
export const WARNING_THRESHOLD = 0.8; // amber at 80% = 336 min

/** Lightweight run details for schedule display */
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
    reference: string | null;
    substrate?: {
      id: string;
      substrate_type: string;
      glue_type: string | null;
      width_mm: number;
      name: string;
    } | null;
  };
}

/** A single schedule entry with its run details */
export interface ScheduledRunWithDetails extends Omit<LabelSchedule, 'run'> {
  run?: ScheduleRunDetails;
}

/** Order-level grouping for schedule display */
export interface ScheduledOrderGroup {
  order_id: string;
  order_number: string;
  customer_name: string;
  substrate_id: string | null;
  reference: string | null;
  scheduled_date: string;
  schedule_id: string;
  sort_order: number;
  runs: ScheduleRunDetails[];
  schedule_entries: ScheduledRunWithDetails[];
  total_meters: number;
  total_frames: number;
  total_duration_minutes: number;
  run_count: number;
  status: string;
  // Material fields
  substrate_type: string | null;
  glue_type: string | null;
  substrate_width_mm: number | null;
  substrate_name: string | null;
  material_key: string;
}

/** Order-level grouping for unscheduled display */
export interface UnscheduledOrderGroup {
  order_id: string;
  order_number: string;
  customer_name: string;
  substrate_id: string | null;
  reference: string | null;
  runs: ScheduleRunDetails[];
  total_meters: number;
  total_frames: number;
  total_duration_minutes: number;
  run_count: number;
  // Material fields
  substrate_type: string | null;
  glue_type: string | null;
  substrate_width_mm: number | null;
  substrate_name: string | null;
  material_key: string;
}

function aggregateRuns(runs: ScheduleRunDetails[]) {
  return {
    total_meters: runs.reduce((s, r) => s + (r.meters_to_print || 0), 0),
    total_frames: runs.reduce((s, r) => s + (r.frames_count || 0), 0),
    total_duration_minutes: runs.reduce((s, r) => s + (r.estimated_duration_minutes || 0), 0),
    run_count: runs.length,
  };
}

function extractSubstrateInfo(order?: ScheduleRunDetails['order']) {
  const substrate = order?.substrate;
  const substrate_type = substrate?.substrate_type || null;
  const glue_type = substrate?.glue_type || null;
  const substrate_width_mm = substrate?.width_mm || null;
  const substrate_name = substrate?.name || null;
  const material_key = getMaterialKey(substrate_type, glue_type, substrate_width_mm);
  return { substrate_type, glue_type, substrate_width_mm, substrate_name, material_key };
}

/**
 * Fetch scheduled runs for a date range, grouped by order
 */
export function useLabelSchedule(startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: [...QUERY_KEY, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async (): Promise<ScheduledOrderGroup[]> => {
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
              substrate_id,
              reference,
              substrate:label_stock(
                id,
                substrate_type,
                glue_type,
                width_mm,
                name
              )
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
      if (error) throw error;

      const entries: ScheduledRunWithDetails[] = (data || []).map(schedule => ({
        ...schedule,
        run: Array.isArray(schedule.run) ? schedule.run[0] : schedule.run,
      })) as ScheduledRunWithDetails[];

      // Group by order_id + scheduled_date
      const groupMap = new Map<string, ScheduledOrderGroup>();
      for (const entry of entries) {
        if (!entry.run) continue;
        const key = `${entry.run.order_id}::${entry.scheduled_date}`;
        if (!groupMap.has(key)) {
          const order = entry.run.order;
          // Handle nested substrate - Supabase returns arrays for joins
          if (order?.substrate && Array.isArray(order.substrate)) {
            (order as any).substrate = order.substrate[0] || null;
          }
          const substrateInfo = extractSubstrateInfo(order);
          groupMap.set(key, {
            order_id: entry.run.order_id,
            order_number: order?.order_number || '',
            customer_name: order?.customer_name || '',
            substrate_id: order?.substrate_id || null,
            reference: (order as any)?.reference || null,
            scheduled_date: entry.scheduled_date,
            schedule_id: entry.id,
            sort_order: entry.sort_order,
            runs: [],
            schedule_entries: [],
            status: entry.status,
            ...substrateInfo,
            ...aggregateRuns([]),
          });
        }
        const group = groupMap.get(key)!;
        group.runs.push(entry.run);
        group.schedule_entries.push(entry);
      }

      for (const group of groupMap.values()) {
        Object.assign(group, aggregateRuns(group.runs));
      }

      return Array.from(groupMap.values());
    },
  });
}

/**
 * Fetch unscheduled runs, grouped by order
 */
export function useUnscheduledRuns() {
  return useQuery({
    queryKey: [...QUERY_KEY, 'unscheduled'],
    queryFn: async (): Promise<UnscheduledOrderGroup[]> => {
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
            substrate_id,
            reference,
            substrate:label_stock(
              id,
              substrate_type,
              glue_type,
              width_mm,
              name
            )
          )
        `)
        .in('status', ['planned', 'approved', 'printing'])
        .order('created_at', { ascending: true });

      if (scheduledIds.length > 0) {
        query = query.not('id', 'in', `(${scheduledIds.join(',')})`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const runs: ScheduleRunDetails[] = (data || []).map(run => ({
        ...run,
        order: Array.isArray(run.order) ? run.order[0] : run.order,
      }));

      // Unwrap nested substrate arrays
      for (const run of runs) {
        if (run.order?.substrate && Array.isArray(run.order.substrate)) {
          (run.order as any).substrate = run.order.substrate[0] || null;
        }
      }

      const groupMap = new Map<string, UnscheduledOrderGroup>();
      for (const run of runs) {
        if (!groupMap.has(run.order_id)) {
          const order = run.order;
          const substrateInfo = extractSubstrateInfo(order);
          groupMap.set(run.order_id, {
            order_id: run.order_id,
            order_number: order?.order_number || '',
            customer_name: order?.customer_name || '',
            substrate_id: order?.substrate_id || null,
            reference: (order as any)?.reference || null,
            runs: [],
            ...substrateInfo,
            ...aggregateRuns([]),
          });
        }
        groupMap.get(run.order_id)!.runs.push(run);
      }

      for (const group of groupMap.values()) {
        Object.assign(group, aggregateRuns(group.runs));
      }

      return Array.from(groupMap.values());
    },
  });
}

/**
 * Schedule an entire order (all its unscheduled runs) to a date
 */
export function useScheduleOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ order_id, run_ids, scheduled_date }: {
      order_id: string;
      run_ids: string[];
      scheduled_date: string;
    }) => {
      const { data: existing } = await supabase
        .from('label_schedule')
        .select('sort_order')
        .eq('scheduled_date', scheduled_date)
        .order('sort_order', { ascending: false })
        .limit(1);

      const baseSortOrder = (existing?.[0]?.sort_order || 0) + 1;

      const inserts = run_ids.map((run_id, i) => ({
        run_id,
        scheduled_date,
        sort_order: baseSortOrder + i,
        status: 'scheduled' as const,
      }));

      const { error } = await supabase
        .from('label_schedule')
        .insert(inserts);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_runs'] });
      toast.success('Order scheduled');
    },
    onError: (error) => {
      toast.error(`Failed to schedule order: ${error.message}`);
    },
  });
}

/**
 * Reschedule an order (move all its schedule entries to a new date)
 */
export function useRescheduleOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ schedule_entry_ids, newDate, newBaseSortOrder }: {
      schedule_entry_ids: string[];
      newDate: string;
      newBaseSortOrder: number;
    }) => {
      for (let i = 0; i < schedule_entry_ids.length; i++) {
        const { error } = await supabase
          .from('label_schedule')
          .update({
            scheduled_date: newDate,
            sort_order: newBaseSortOrder + i,
          })
          .eq('id', schedule_entry_ids[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Order rescheduled');
    },
    onError: (error) => {
      toast.error(`Failed to reschedule: ${error.message}`);
    },
  });
}

/**
 * Unschedule an order (delete all its schedule entries)
 */
export function useUnscheduleOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (schedule_entry_ids: string[]) => {
      for (const id of schedule_entry_ids) {
        const { error } = await supabase
          .from('label_schedule')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_runs'] });
      toast.success('Order unscheduled');
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

      if (error) throw error;
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
 * Reorder orders within a day
 */
export function useReorderSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      for (const update of updates) {
        const { error } = await supabase
          .from('label_schedule')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
        if (error) throw error;
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

// Keep legacy exports for backward compat
export function useScheduleRun() { return useScheduleOrder(); }
export function useRescheduleRun() { return useRescheduleOrder(); }
export function useUnscheduleRun() { return useUnscheduleOrder(); }
