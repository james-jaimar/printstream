import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { LabelOrder } from '@/types/labels';

interface LabelCustomer {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  billing_address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProofApproval {
  id: string;
  order_id: string;
  action: 'approved' | 'rejected';
  comment: string | null;
  approved_by: string | null;
  created_at: string;
}

const CUSTOMER_QUERY_KEY = ['label_customers'];
const CLIENT_ORDERS_KEY = ['label_client_orders'];

/**
 * Check if current user is a client (has label_customers record)
 */
export function useIsLabelClient() {
  return useQuery({
    queryKey: [...CUSTOMER_QUERY_KEY, 'is_client'],
    queryFn: async (): Promise<boolean> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await supabase
        .from('label_customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking client status:', error);
        return false;
      }

      return data !== null;
    },
  });
}

/**
 * Get current client's customer record
 */
export function useClientProfile() {
  return useQuery({
    queryKey: [...CUSTOMER_QUERY_KEY, 'profile'],
    queryFn: async (): Promise<LabelCustomer | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('label_customers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching client profile:', error);
        return null;
      }

      return data as unknown as LabelCustomer | null;
    },
  });
}

/**
 * Get orders for the current client
 */
export function useClientOrders() {
  return useQuery({
    queryKey: CLIENT_ORDERS_KEY,
    queryFn: async (): Promise<LabelOrder[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('label_orders')
        .select(`
          *,
          dieline:label_dielines(*),
          substrate:label_stock(*),
          items:label_items(*),
          runs:label_runs(*)
        `)
        .eq('customer_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching client orders:', error);
        throw error;
      }

      return (data || []) as unknown as LabelOrder[];
    },
  });
}

/**
 * Get a specific order for client view
 */
export function useClientOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: [...CLIENT_ORDERS_KEY, orderId],
    queryFn: async (): Promise<LabelOrder | null> => {
      if (!orderId) return null;

      const { data, error } = await supabase
        .from('label_orders')
        .select(`
          *,
          dieline:label_dielines(*),
          substrate:label_stock(*),
          items:label_items(*),
          runs:label_runs(*)
        `)
        .eq('id', orderId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching client order:', error);
        throw error;
      }

      return data as unknown as LabelOrder | null;
    },
    enabled: !!orderId,
  });
}

/**
 * Get approval history for an order
 */
export function useOrderApprovals(orderId: string | undefined) {
  return useQuery({
    queryKey: ['label_proof_approvals', orderId],
    queryFn: async (): Promise<ProofApproval[]> => {
      if (!orderId) return [];

      const { data, error } = await supabase
        .from('label_proof_approvals')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching approvals:', error);
        throw error;
      }

      return (data || []) as ProofApproval[];
    },
    enabled: !!orderId,
  });
}

/**
 * Submit proof approval or rejection
 */
export function useSubmitProofApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      order_id: string;
      action: 'approved' | 'rejected';
      comment?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Insert approval record
      const { error: approvalError } = await supabase
        .from('label_proof_approvals')
        .insert({
          order_id: input.order_id,
          action: input.action,
          comment: input.comment || null,
          approved_by: user.id,
        });

      if (approvalError) throw approvalError;

      // Update order status
      const newStatus = input.action === 'approved' ? 'approved' : 'pending_approval';
      const updateData: Record<string, unknown> = { status: newStatus };
      
      if (input.action === 'approved') {
        updateData.client_approved_at = new Date().toISOString();
        updateData.client_approved_by = user.id;
      }

      const { error: orderError } = await supabase
        .from('label_orders')
        .update(updateData)
        .eq('id', input.order_id);

      if (orderError) throw orderError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: CLIENT_ORDERS_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_proof_approvals', variables.order_id] });
      toast.success(
        variables.action === 'approved' 
          ? 'Proof approved successfully' 
          : 'Proof rejected - feedback sent'
      );
    },
    onError: (error) => {
      console.error('Approval error:', error);
      toast.error('Failed to submit approval');
    },
  });
}

// Admin functions for managing clients

/**
 * Get all label customers (admin only)
 */
export function useLabelCustomers() {
  return useQuery({
    queryKey: CUSTOMER_QUERY_KEY,
    queryFn: async (): Promise<LabelCustomer[]> => {
      const { data, error } = await supabase
        .from('label_customers')
        .select('*')
        .order('company_name');

      if (error) {
        console.error('Error fetching customers:', error);
        throw error;
      }

      return (data || []) as unknown as LabelCustomer[];
    },
  });
}

/**
 * Create a new customer (admin only)
 */
export function useCreateLabelCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      company_name: string;
      billing_address?: string;
      notes?: string;
    }): Promise<LabelCustomer> => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('label_customers')
        .insert({
          company_name: input.company_name,
          billing_address: input.billing_address || null,
          notes: input.notes || null,
          // user_id is NULL for company records - only contacts have user_id
          user_id: null,
          contact_email: null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as LabelCustomer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEY });
      toast.success('Customer created');
    },
    onError: (error) => {
      toast.error(`Failed to create customer: ${error.message}`);
    },
  });
}

/**
 * Update an existing customer (admin only)
 */
export function useUpdateLabelCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      company_name?: string;
      billing_address?: string | null;
      notes?: string | null;
      is_active?: boolean;
    }): Promise<LabelCustomer> => {
      const { id, ...updates } = input;
      
      const { data, error } = await supabase
        .from('label_customers')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as LabelCustomer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEY });
      toast.success('Customer updated');
    },
    onError: (error) => {
      toast.error(`Failed to update customer: ${error.message}`);
    },
  });
}

/**
 * Archive a customer (soft delete - sets is_active = false)
 */
export function useArchiveLabelCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerId: string): Promise<void> => {
      const { error } = await supabase
        .from('label_customers')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEY });
      toast.success('Customer archived');
    },
    onError: (error) => {
      toast.error(`Failed to archive customer: ${error.message}`);
    },
  });
}

/**
 * Permanently delete a customer and all related contacts/auth records (admin only)
 */
export function useDeleteLabelCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerId: string): Promise<void> => {
      // Contacts cascade-delete due to FK, but delete auth records first
      const { data: contacts } = await supabase
        .from('label_customer_contacts')
        .select('id')
        .eq('customer_id', customerId);

      if (contacts && contacts.length > 0) {
        const contactIds = contacts.map(c => c.id);
        await supabase
          .from('label_client_auth')
          .delete()
          .in('contact_id', contactIds);
      }

      // Delete contacts explicitly
      await supabase
        .from('label_customer_contacts')
        .delete()
        .eq('customer_id', customerId);

      // Delete the customer
      const { error } = await supabase
        .from('label_customers')
        .delete()
        .eq('id', customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEY });
      toast.success('Customer permanently deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete customer: ${error.message}`);
    },
  });
}

/**
 * Link a customer to an order
 */
export function useLinkCustomerToOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, customerUserId }: { orderId: string; customerUserId: string }) => {
      const { error } = await supabase
        .from('label_orders')
        .update({ customer_user_id: customerUserId })
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['label_orders'] });
      toast.success('Customer linked to order');
    },
    onError: (error) => {
      toast.error(`Failed to link customer: ${error.message}`);
    },
  });
}
