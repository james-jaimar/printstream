import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { LabelOrder, LabelOrderStatus, CreateLabelOrderInput } from '@/types/labels';

const QUERY_KEY = ['label_orders'];

export function useLabelOrders(status?: LabelOrderStatus) {
  return useQuery({
    queryKey: status ? [...QUERY_KEY, status] : QUERY_KEY,
    queryFn: async (): Promise<LabelOrder[]> => {
      let query = supabase
        .from('label_orders')
        .select(`
          *,
          dieline:label_dielines(*),
          substrate:label_stock(*)
        `)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching label orders:', error);
        throw error;
      }
      
      return (data || []) as unknown as LabelOrder[];
    },
  });
}

export function useLabelOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, orderId],
    queryFn: async (): Promise<LabelOrder | null> => {
      if (!orderId) return null;

      const { data, error } = await supabase
        .from('label_orders')
        .select(`
          *,
          dieline:label_dielines(*),
          substrate:label_stock(*),
          items:label_items(*),
          runs:label_runs(
            *,
            schedule:label_schedule(*)
          ),
          services:label_order_services(
            *,
            finishing_option:label_finishing_options(id, display_name, category),
            stage:label_production_stages(id, name, color)
          ),
          stage_instances:label_order_stage_instances(
            *,
            stage:label_production_stages(id, name, color, stage_group)
          )
        `)
        .eq('id', orderId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching label order:', error);
        throw error;
      }
      
      return data as unknown as LabelOrder | null;
    },
    enabled: !!orderId,
  });
}

export function useCreateLabelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateLabelOrderInput): Promise<LabelOrder> => {
      // Generate order number
      const { data: orderNumber, error: numError } = await supabase
        .rpc('generate_label_order_number');
      
      if (numError) {
        console.error('Error generating order number:', numError);
        throw numError;
      }

      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('label_orders')
        .insert({
          order_number: orderNumber,
          customer_id: input.customer_id,
          customer_name: input.customer_name,
          contact_name: input.contact_name,
          contact_email: input.contact_email,
          dieline_id: input.dieline_id,
          roll_width_mm: input.roll_width_mm,
          substrate_id: input.substrate_id,
          due_date: input.due_date,
          notes: input.notes,
          quickeasy_wo_no: input.quickeasy_wo_no,
          orientation: input.orientation ?? 1,
          ink_config: input.ink_config ?? 'CMYK',
          // Post-print / delivery fields
          core_size_mm: input.core_size_mm ?? null,
          qty_per_roll: input.qty_per_roll ?? null,
          roll_direction: input.roll_direction ?? null,
          delivery_method: input.delivery_method ?? null,
          delivery_address: input.delivery_address ?? null,
          delivery_notes: input.delivery_notes ?? null,
          created_by: user.user?.id,
          status: 'quote',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating label order:', error);
        throw error;
      }

      return data as unknown as LabelOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Label order created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create order: ${error.message}`);
    },
  });
}

export function useUpdateLabelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: Partial<LabelOrder>;
    }): Promise<LabelOrder> => {
      const { data, error } = await supabase
        .from('label_orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating label order:', error);
        throw error;
      }

      return data as unknown as LabelOrder;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, data.id] });
      toast.success('Order updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update order: ${error.message}`);
    },
  });
}

export function useDeleteLabelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('label_orders')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting label order:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Order deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete order: ${error.message}`);
    },
  });
}
