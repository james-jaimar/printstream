import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CustomerContact {
  id: string;
  customer_id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  receives_proofs: boolean;
  receives_notifications: boolean;
  can_approve_proofs: boolean;
  is_primary: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContactInput {
  customer_id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  receives_proofs?: boolean;
  receives_notifications?: boolean;
  can_approve_proofs?: boolean;
  is_primary?: boolean;
  notes?: string;
  create_login?: boolean;
  password?: string;
}

export interface UpdateContactInput {
  name?: string;
  email?: string;
  phone?: string | null;
  role?: string | null;
  receives_proofs?: boolean;
  receives_notifications?: boolean;
  can_approve_proofs?: boolean;
  is_primary?: boolean;
  is_active?: boolean;
  notes?: string | null;
}

const CONTACTS_QUERY_KEY = ['label_customer_contacts'];

/**
 * Get all contacts for a specific customer
 */
export function useCustomerContacts(customerId: string | undefined) {
  return useQuery({
    queryKey: [...CONTACTS_QUERY_KEY, customerId],
    queryFn: async (): Promise<CustomerContact[]> => {
      if (!customerId) return [];

      const { data, error } = await supabase
        .from('label_customer_contacts')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
        .order('name');

      if (error) {
        console.error('Error fetching contacts:', error);
        throw error;
      }

      return (data || []) as unknown as CustomerContact[];
    },
    enabled: !!customerId,
  });
}

/**
 * Create a new contact for a customer
 */
export function useCreateCustomerContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateContactInput): Promise<CustomerContact> => {
      let userId: string | null = null;

      // Create auth user if login is requested
      if (input.create_login && input.password) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error('Failed to create user');
        userId = authData.user.id;
      }

      const { data, error } = await supabase
        .from('label_customer_contacts')
        .insert({
          customer_id: input.customer_id,
          user_id: userId,
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          role: input.role || 'contact',
          receives_proofs: input.receives_proofs ?? true,
          receives_notifications: input.receives_notifications ?? true,
          can_approve_proofs: input.can_approve_proofs ?? true,
          is_primary: input.is_primary ?? false,
          notes: input.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as CustomerContact;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...CONTACTS_QUERY_KEY, variables.customer_id] });
      toast.success('Contact added');
    },
    onError: (error) => {
      toast.error(`Failed to add contact: ${error.message}`);
    },
  });
}

/**
 * Update an existing contact
 */
export function useUpdateCustomerContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, customerId, ...input }: UpdateContactInput & { id: string; customerId: string }): Promise<CustomerContact> => {
      const { data, error } = await supabase
        .from('label_customer_contacts')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as CustomerContact;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...CONTACTS_QUERY_KEY, data.customer_id] });
      toast.success('Contact updated');
    },
    onError: (error) => {
      toast.error(`Failed to update contact: ${error.message}`);
    },
  });
}

/**
 * Delete a contact
 */
export function useDeleteCustomerContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, customerId }: { id: string; customerId: string }) => {
      const { error } = await supabase
        .from('label_customer_contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { customerId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [...CONTACTS_QUERY_KEY, result.customerId] });
      toast.success('Contact deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete contact: ${error.message}`);
    },
  });
}
