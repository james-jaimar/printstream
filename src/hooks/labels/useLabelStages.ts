import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type LabelStageGroup = 'die_cutting_finishing' | 'services' | 'qa' | 'packaging' | 'dispatch';

export interface LabelProductionStage {
  id: string;
  name: string;
  description: string | null;
  stage_group: LabelStageGroup;
  color: string;
  order_index: number;
  is_active: boolean;
  is_conditional: boolean;
  default_duration_minutes: number | null;
  speed_per_hour: number | null;
  speed_unit: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLabelStageInput {
  name: string;
  description?: string;
  stage_group: LabelStageGroup;
  color?: string;
  order_index?: number;
  is_active?: boolean;
  is_conditional?: boolean;
  default_duration_minutes?: number;
  speed_per_hour?: number;
  speed_unit?: string;
}

const QUERY_KEY = ['label_production_stages'];

export function useLabelStages() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<LabelProductionStage[]> => {
      const { data, error } = await supabase
        .from('label_production_stages')
        .select('*')
        .order('order_index', { ascending: true });
      if (error) throw error;
      return (data || []) as LabelProductionStage[];
    },
  });
}

export function useCreateLabelStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLabelStageInput): Promise<LabelProductionStage> => {
      const { data, error } = await supabase
        .from('label_production_stages')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as LabelProductionStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Stage created');
    },
    onError: (err: Error) => toast.error(`Failed to create stage: ${err.message}`),
  });
}

export function useUpdateLabelStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateLabelStageInput> }): Promise<LabelProductionStage> => {
      const { data, error } = await supabase
        .from('label_production_stages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as LabelProductionStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Stage updated');
    },
    onError: (err: Error) => toast.error(`Failed to update stage: ${err.message}`),
  });
}

export function useDeleteLabelStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('label_production_stages')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Stage deleted');
    },
    onError: (err: Error) => toast.error(`Failed to delete stage: ${err.message}`),
  });
}
