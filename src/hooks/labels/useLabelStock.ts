import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { LabelStock, LabelStockTransaction } from '@/types/labels';

const STOCK_QUERY_KEY = ['label_stock'];
const TRANSACTIONS_QUERY_KEY = ['label_stock_transactions'];

export function useLabelStock(activeOnly = true) {
  return useQuery({
    queryKey: [...STOCK_QUERY_KEY, { activeOnly }],
    queryFn: async (): Promise<LabelStock[]> => {
      let query = supabase
        .from('label_stock')
        .select('*')
        .order('width_mm', { ascending: true })
        .order('name', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching stock:', error);
        throw error;
      }
      
      return (data || []) as unknown as LabelStock[];
    },
  });
}

export function useLabelStockItem(stockId: string | undefined) {
  return useQuery({
    queryKey: [...STOCK_QUERY_KEY, stockId],
    queryFn: async (): Promise<LabelStock | null> => {
      if (!stockId) return null;

      const { data, error } = await supabase
        .from('label_stock')
        .select('*')
        .eq('id', stockId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching stock item:', error);
        throw error;
      }
      
      return data as unknown as LabelStock | null;
    },
    enabled: !!stockId,
  });
}

export function useLabelStockTransactions(stockId: string | undefined) {
  return useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEY, stockId],
    queryFn: async (): Promise<LabelStockTransaction[]> => {
      if (!stockId) return [];

      const { data, error } = await supabase
        .from('label_stock_transactions')
        .select('*')
        .eq('stock_id', stockId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) {
        console.error('Error fetching stock transactions:', error);
        throw error;
      }
      
      return (data || []) as unknown as LabelStockTransaction[];
    },
    enabled: !!stockId,
  });
}

export function useLowStockAlerts() {
  return useQuery({
    queryKey: [...STOCK_QUERY_KEY, 'low_stock'],
    queryFn: async (): Promise<LabelStock[]> => {
      // Fetch all active stock and filter client-side
      const { data: allStock, error: fetchError } = await supabase
        .from('label_stock')
        .select('*')
        .eq('is_active', true);
      
      return ((allStock || []) as unknown as LabelStock[]).filter(
        s => s.current_stock_meters <= s.reorder_level_meters
      );
    },
  });
}

export function useCreateLabelStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      substrate_type: string;
      finish: string;
      width_mm: number;
      gsm?: number;
      roll_length_meters?: number;
      current_stock_meters?: number;
      reorder_level_meters?: number;
      cost_per_meter?: number;
      supplier?: string;
    }): Promise<LabelStock> => {
      const { data, error } = await supabase
        .from('label_stock')
        .insert(input)
        .select()
        .single();

      if (error) {
        console.error('Error creating stock:', error);
        throw error;
      }

      return data as unknown as LabelStock;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STOCK_QUERY_KEY });
      toast.success('Stock item created');
    },
    onError: (error) => {
      toast.error(`Failed to create stock: ${error.message}`);
    },
  });
}

export function useUpdateLabelStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: Partial<LabelStock>;
    }): Promise<LabelStock> => {
      const { data, error } = await supabase
        .from('label_stock')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating stock:', error);
        throw error;
      }

      return data as unknown as LabelStock;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STOCK_QUERY_KEY });
      toast.success('Stock updated');
    },
    onError: (error) => {
      toast.error(`Failed to update stock: ${error.message}`);
    },
  });
}

export function useDeleteLabelStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('label_stock')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting stock:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STOCK_QUERY_KEY });
      toast.success('Stock item deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete stock: ${error.message}`);
    },
  });
}

export function useAddStockTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      stock_id: string;
      transaction_type: LabelStockTransaction['transaction_type'];
      meters: number;
      notes?: string;
    }): Promise<void> => {
      const { data: user } = await supabase.auth.getUser();
      
      // Insert transaction
      const { error: txError } = await supabase
        .from('label_stock_transactions')
        .insert({
          stock_id: input.stock_id,
          transaction_type: input.transaction_type,
          meters: input.meters,
          notes: input.notes,
          created_by: user.user?.id,
        });

      if (txError) throw txError;

      // Update stock level
      const adjustment = input.transaction_type === 'receipt' 
        ? input.meters 
        : input.transaction_type === 'usage' || input.transaction_type === 'waste'
          ? -Math.abs(input.meters)
          : input.meters;

      // Update stock directly
      const { data: current } = await supabase
        .from('label_stock')
        .select('current_stock_meters')
        .eq('id', input.stock_id)
        .single();

      const newLevel = (current?.current_stock_meters || 0) + adjustment;

      await supabase
        .from('label_stock')
        .update({ current_stock_meters: Math.max(0, newLevel) })
        .eq('id', input.stock_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STOCK_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
      toast.success('Stock transaction recorded');
    },
    onError: (error) => {
      toast.error(`Failed to record transaction: ${error.message}`);
    },
  });
}
