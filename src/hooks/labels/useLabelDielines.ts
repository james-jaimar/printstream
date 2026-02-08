import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { LabelDieline, CreateLabelDielineInput } from '@/types/labels';

const QUERY_KEY = ['label_dielines'];

export function useLabelDielines(activeOnly = true) {
  return useQuery({
    queryKey: [...QUERY_KEY, { activeOnly }],
    queryFn: async (): Promise<LabelDieline[]> => {
      let query = supabase
        .from('label_dielines')
        .select('*')
        .order('roll_width_mm', { ascending: true })
        .order('columns_across', { ascending: false });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching dielines:', error);
        throw error;
      }
      
      return (data || []) as unknown as LabelDieline[];
    },
  });
}

export function useLabelDieline(dielineId: string | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, dielineId],
    queryFn: async (): Promise<LabelDieline | null> => {
      if (!dielineId) return null;

      const { data, error } = await supabase
        .from('label_dielines')
        .select('*')
        .eq('id', dielineId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching dieline:', error);
        throw error;
      }
      
      return data as unknown as LabelDieline | null;
    },
    enabled: !!dielineId,
  });
}

export function useCreateLabelDieline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateLabelDielineInput): Promise<LabelDieline> => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('label_dielines')
        .insert({
          name: input.name,
          roll_width_mm: input.roll_width_mm,
          label_width_mm: input.label_width_mm,
          label_height_mm: input.label_height_mm,
          columns_across: input.columns_across,
          rows_around: input.rows_around,
          horizontal_gap_mm: input.horizontal_gap_mm ?? 3,
          vertical_gap_mm: input.vertical_gap_mm ?? 2.5,
          corner_radius_mm: input.corner_radius_mm,
          is_custom: input.is_custom ?? false,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating dieline:', error);
        throw error;
      }

      return data as unknown as LabelDieline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Dieline template created');
    },
    onError: (error) => {
      toast.error(`Failed to create dieline: ${error.message}`);
    },
  });
}

export function useUpdateLabelDieline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: Partial<LabelDieline>;
    }): Promise<LabelDieline> => {
      const { data, error } = await supabase
        .from('label_dielines')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating dieline:', error);
        throw error;
      }

      return data as unknown as LabelDieline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Dieline updated');
    },
    onError: (error) => {
      toast.error(`Failed to update dieline: ${error.message}`);
    },
  });
}

export function useDeleteLabelDieline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // Soft delete - just set inactive
      const { error } = await supabase
        .from('label_dielines')
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        console.error('Error deleting dieline:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Dieline archived');
    },
    onError: (error) => {
      toast.error(`Failed to archive dieline: ${error.message}`);
    },
  });
}
