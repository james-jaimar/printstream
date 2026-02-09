import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { LabelItem, CreateLabelItemInput } from '@/types/labels';
import type { Json } from '@/integrations/supabase/types';

const QUERY_KEY = ['label_items'];

export function useLabelItems(orderId: string | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, orderId],
    queryFn: async (): Promise<LabelItem[]> => {
      if (!orderId) return [];

      const { data, error } = await supabase
        .from('label_items')
        .select('*')
        .eq('order_id', orderId)
        .order('item_number', { ascending: true });
      
      if (error) {
        console.error('Error fetching label items:', error);
        throw error;
      }
      
      return (data || []) as unknown as LabelItem[];
    },
    enabled: !!orderId,
  });
}

export function useLabelItem(itemId: string | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, 'single', itemId],
    queryFn: async (): Promise<LabelItem | null> => {
      if (!itemId) return null;

      const { data, error } = await supabase
        .from('label_items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching label item:', error);
        throw error;
      }
      
      return data as unknown as LabelItem | null;
    },
    enabled: !!itemId,
  });
}

export function useCreateLabelItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateLabelItemInput): Promise<LabelItem> => {
      // Get next item number
      const { data: existingItems } = await supabase
        .from('label_items')
        .select('item_number')
        .eq('order_id', input.order_id)
        .order('item_number', { ascending: false })
        .limit(1);

      const nextItemNumber = (existingItems?.[0]?.item_number || 0) + 1;
      
      const insertData = {
        order_id: input.order_id,
        item_number: nextItemNumber,
        name: input.name,
        quantity: input.quantity,
        artwork_pdf_url: input.artwork_pdf_url,
        artwork_thumbnail_url: input.artwork_thumbnail_url,
        width_mm: input.width_mm,
        height_mm: input.height_mm,
        notes: input.notes,
        preflight_status: input.preflight_status || 'pending',
        preflight_report: (input.preflight_report || null) as Json,
        needs_rotation: input.needs_rotation ?? false,
        page_count: input.page_count ?? 1,
      };
      
      const { data, error } = await supabase
        .from('label_items')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error creating label item:', error);
        throw error;
      }

      // Update order total count
      await updateOrderTotalCount(input.order_id);

      return data as unknown as LabelItem;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_orders', data.order_id] });
      toast.success('Label item added');
    },
    onError: (error) => {
      toast.error(`Failed to add item: ${error.message}`);
    },
  });
}

export function useUpdateLabelItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: Partial<Omit<LabelItem, 'preflight_report'>> & { preflight_report?: Record<string, unknown> };
    }): Promise<LabelItem> => {
      const { data, error } = await supabase
        .from('label_items')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating label item:', error);
        throw error;
      }

      // Update order total count if quantity changed
      if (updates.quantity !== undefined) {
        await updateOrderTotalCount(data.order_id);
      }

      return data as unknown as LabelItem;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_orders', data.order_id] });
      toast.success('Item updated');
    },
    onError: (error) => {
      toast.error(`Failed to update item: ${error.message}`);
    },
  });
}

export function useDeleteLabelItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, orderId }: { id: string; orderId: string }): Promise<void> => {
      const { error } = await supabase
        .from('label_items')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting label item:', error);
        throw error;
      }

      // Update order total count
      await updateOrderTotalCount(orderId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_orders', variables.orderId] });
      toast.success('Item removed');
    },
    onError: (error) => {
      toast.error(`Failed to remove item: ${error.message}`);
    },
  });
}

// Helper function to update order total count
async function updateOrderTotalCount(orderId: string): Promise<void> {
  const { data: items } = await supabase
    .from('label_items')
    .select('quantity')
    .eq('order_id', orderId);

  const totalCount = (items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

  await supabase
    .from('label_orders')
    .update({ total_label_count: totalCount })
    .eq('id', orderId);
}
