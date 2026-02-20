import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type LabelServiceType =
  | 'finishing'
  | 'rewinding'
  | 'joining'
  | 'handwork'
  | 'qa'
  | 'packaging'
  | 'delivery';

export type LabelStageStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'held';

export interface LabelOrderService {
  id: string;
  order_id: string;
  service_type: LabelServiceType;
  finishing_option_id: string | null;
  stage_id: string | null;
  display_name: string;
  quantity: number | null;
  quantity_unit: string | null;
  notes: string | null;
  estimated_cost: number | null;
  sort_order: number;
  created_at: string;
  // joined
  finishing_option?: { id: string; display_name: string; category: string } | null;
  stage?: { id: string; name: string; color: string } | null;
}

export interface LabelOrderStageInstance {
  id: string;
  order_id: string;
  stage_id: string;
  service_line_id: string | null;
  stage_order: number;
  status: LabelStageStatus;
  started_at: string | null;
  completed_at: string | null;
  started_by: string | null;
  completed_by: string | null;
  assigned_operator_id: string | null;
  estimated_duration_minutes: number | null;
  actual_duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  stage?: { id: string; name: string; color: string; stage_group: string } | null;
}

export interface AddOrderServiceInput {
  order_id: string;
  service_type: LabelServiceType;
  display_name: string;
  finishing_option_id?: string | null;
  stage_id?: string | null;
  quantity?: number | null;
  quantity_unit?: string | null;
  notes?: string | null;
  estimated_cost?: number | null;
  sort_order?: number;
}

const SERVICES_KEY = ['label_order_services'];
const STAGES_KEY = ['label_order_stage_instances'];

export function useOrderServices(orderId: string | undefined) {
  return useQuery({
    queryKey: [...SERVICES_KEY, orderId],
    queryFn: async (): Promise<LabelOrderService[]> => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('label_order_services')
        .select('*, finishing_option:label_finishing_options(id, display_name, category), stage:label_production_stages(id, name, color)')
        .eq('order_id', orderId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LabelOrderService[];
    },
    enabled: !!orderId,
  });
}

export function useAddOrderService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddOrderServiceInput): Promise<LabelOrderService> => {
      const { data, error } = await supabase
        .from('label_order_services')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LabelOrderService;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...SERVICES_KEY, data.order_id] });
      toast.success('Service added');
    },
    onError: (err: Error) => toast.error(`Failed to add service: ${err.message}`),
  });
}

export function useUpdateOrderService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderId, updates }: { id: string; orderId: string; updates: Partial<AddOrderServiceInput> }): Promise<LabelOrderService> => {
      const { data, error } = await supabase
        .from('label_order_services')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LabelOrderService;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [...SERVICES_KEY, vars.orderId] });
      toast.success('Service updated');
    },
    onError: (err: Error) => toast.error(`Failed to update service: ${err.message}`),
  });
}

export function useRemoveOrderService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderId }: { id: string; orderId: string }): Promise<void> => {
      const { error } = await supabase
        .from('label_order_services')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [...SERVICES_KEY, vars.orderId] });
      toast.success('Service removed');
    },
    onError: (err: Error) => toast.error(`Failed to remove service: ${err.message}`),
  });
}

export function useOrderStageInstances(orderId: string | undefined) {
  return useQuery({
    queryKey: [...STAGES_KEY, orderId],
    queryFn: async (): Promise<LabelOrderStageInstance[]> => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('label_order_stage_instances')
        .select('*, stage:label_production_stages(id, name, color, stage_group)')
        .eq('order_id', orderId)
        .order('stage_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LabelOrderStageInstance[];
    },
    enabled: !!orderId,
  });
}

export function useUpdateStageInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderId, updates }: {
      id: string;
      orderId: string;
      updates: Partial<Pick<LabelOrderStageInstance, 'status' | 'started_at' | 'completed_at' | 'notes' | 'actual_duration_minutes' | 'assigned_operator_id'>>;
    }): Promise<LabelOrderStageInstance> => {
      const { data, error } = await supabase
        .from('label_order_stage_instances')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LabelOrderStageInstance;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [...STAGES_KEY, vars.orderId] });
    },
    onError: (err: Error) => toast.error(`Failed to update stage: ${err.message}`),
  });
}
