import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type LabelFinishingCategory = 'lamination' | 'uv_varnish' | 'sheeting';

export interface LabelFinishingOption {
  id: string;
  name: string;
  display_name: string;
  category: LabelFinishingCategory;
  description: string | null;
  properties: Record<string, unknown>;
  triggers_stage_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // joined
  triggers_stage?: { id: string; name: string; color: string } | null;
}

export interface CreateFinishingOptionInput {
  name: string;
  display_name: string;
  category: LabelFinishingCategory;
  description?: string;
  properties?: Record<string, string | number | boolean | null>;
  triggers_stage_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

const QUERY_KEY = ['label_finishing_options'];

export function useLabelFinishingOptions(category?: LabelFinishingCategory) {
  return useQuery({
    queryKey: category ? [...QUERY_KEY, category] : QUERY_KEY,
    queryFn: async (): Promise<LabelFinishingOption[]> => {
      let q = supabase
        .from('label_finishing_options')
        .select('*, triggers_stage:label_production_stages(id, name, color)')
        .order('sort_order', { ascending: true });
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as LabelFinishingOption[];
    },
  });
}

export function useCreateFinishingOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFinishingOptionInput): Promise<LabelFinishingOption> => {
      const { data, error } = await supabase
        .from('label_finishing_options')
        .insert([input as any])
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LabelFinishingOption;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Finishing option created');
    },
    onError: (err: Error) => toast.error(`Failed to create option: ${err.message}`),
  });
}

export function useUpdateFinishingOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateFinishingOptionInput> }): Promise<LabelFinishingOption> => {
      const { data, error } = await supabase
        .from('label_finishing_options')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LabelFinishingOption;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Finishing option updated');
    },
    onError: (err: Error) => toast.error(`Failed to update option: ${err.message}`),
  });
}

export function useDeleteFinishingOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('label_finishing_options')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Finishing option deleted');
    },
    onError: (err: Error) => toast.error(`Failed to delete option: ${err.message}`),
  });
}
