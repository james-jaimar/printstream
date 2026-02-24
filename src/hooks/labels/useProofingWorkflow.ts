/**
 * Proofing Workflow Hook
 * Manages the proofing process for label orders including:
 * - Sending proofs to selected contacts
 * - Requesting new artwork from clients
 * - Tracking proofing status
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ProofingStatus } from '@/types/labels';

export interface ProofingRequest {
  id: string;
  order_id: string;
  requested_by: string | null;
  message: string | null;
  status: 'pending' | 'sent' | 'viewed' | 'approved' | 'changes_needed';
  created_at: string;
  updated_at: string;
}

export interface ProofingNotification {
  id: string;
  request_id: string;
  contact_id: string;
  email: string;
  sent_at: string | null;
  viewed_at: string | null;
  created_at: string;
}

const PROOFING_QUERY_KEY = ['label_proofing'];

/**
 * Get proofing requests for an order
 */
export function useProofingRequests(orderId: string | undefined) {
  return useQuery({
    queryKey: [...PROOFING_QUERY_KEY, 'requests', orderId],
    queryFn: async (): Promise<ProofingRequest[]> => {
      if (!orderId) return [];

      const { data, error } = await supabase
        .from('label_proofing_requests')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching proofing requests:', error);
        throw error;
      }

      return (data || []) as unknown as ProofingRequest[];
    },
    enabled: !!orderId,
  });
}

/**
 * Send proof notification to selected contacts
 */
export function useSendProofNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      contactIds,
      message,
    }: {
      orderId: string;
      contactIds: string[];
      message?: string;
    }): Promise<{ requestId: string; emailsSent: number }> => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create proofing request
      const { data: request, error: requestError } = await supabase
        .from('label_proofing_requests')
        .insert({
          order_id: orderId,
          requested_by: user?.id,
          message: message || null,
          status: 'pending',
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Get contact details
      const { data: contacts, error: contactsError } = await supabase
        .from('label_customer_contacts')
        .select('id, email')
        .in('id', contactIds);

      if (contactsError) throw contactsError;

      // Create notification records
      const notifications = contacts.map(contact => ({
        request_id: request.id,
        contact_id: contact.id,
        email: contact.email,
      }));

      const { error: notifError } = await supabase
        .from('label_proofing_notifications')
        .insert(notifications);

      if (notifError) throw notifError;

      // Update item statuses to awaiting_client
      // When resending after changes_requested, also reset client_needs_upload items
      const statusesToUpdate = ['ready_for_proof', 'client_needs_upload'];
      const { error: itemError } = await supabase
        .from('label_items')
        .update({ proofing_status: 'awaiting_client', artwork_issue: null })
        .eq('order_id', orderId)
        .in('proofing_status', statusesToUpdate);

      if (itemError) {
        console.warn('Failed to update item statuses:', itemError);
      }

      // Call edge function to send emails
      const { error: emailError } = await supabase.functions.invoke('label-notify', {
        body: {
          type: 'proof_request',
          order_id: orderId,
          request_id: request.id,
          contact_ids: contactIds,
          message,
        },
      });

      if (emailError) {
        console.error('Failed to send emails:', emailError);
        // Update request status to reflect partial failure
        await supabase
          .from('label_proofing_requests')
          .update({ status: 'pending' })
          .eq('id', request.id);
        throw new Error('Proofing request created but email sending failed');
      }

      // Update request status to sent
      await supabase
        .from('label_proofing_requests')
        .update({ status: 'sent' })
        .eq('id', request.id);

      return { requestId: request.id, emailsSent: contacts.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: PROOFING_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['label_orders'] });
      queryClient.invalidateQueries({ queryKey: ['label_items'] });
      toast.success(`Proof notification sent to ${result.emailsSent} contact(s)`);
    },
    onError: (error) => {
      toast.error(`Failed to send proof: ${error.message}`);
    },
  });
}

/**
 * Request new artwork from client for specific items
 */
export function useRequestNewArtwork() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      itemIds,
      issue,
      contactIds,
    }: {
      orderId: string;
      itemIds: string[];
      issue: string;
      contactIds: string[];
    }): Promise<void> => {
      // Update items to client_needs_upload with the issue message
      const { error: updateError } = await supabase
        .from('label_items')
        .update({
          proofing_status: 'client_needs_upload',
          artwork_issue: issue,
        })
        .in('id', itemIds);

      if (updateError) throw updateError;

      // Send notification to contacts
      if (contactIds.length > 0) {
        const { error: emailError } = await supabase.functions.invoke('label-notify', {
          body: {
            type: 'artwork_request',
            order_id: orderId,
            item_ids: itemIds,
            issue,
            contact_ids: contactIds,
          },
        });

        if (emailError) {
          console.error('Failed to send artwork request notification:', emailError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['label_items'] });
      queryClient.invalidateQueries({ queryKey: ['label_orders'] });
      toast.success('Artwork request sent to client');
    },
    onError: (error) => {
      toast.error(`Failed to request artwork: ${error.message}`);
    },
  });
}

/**
 * Mark items as ready for proofing
 */
export function useMarkReadyForProof() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemIds,
    }: {
      itemIds: string[];
    }): Promise<void> => {
      const { error } = await supabase
        .from('label_items')
        .update({ proofing_status: 'ready_for_proof' })
        .in('id', itemIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['label_items'] });
      toast.success('Items marked as ready for proofing');
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });
}

/**
 * Mark items as approved
 */
export function useMarkProofApproved() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      itemIds,
      approvedBy,
      comment,
    }: {
      orderId: string;
      itemIds: string[];
      approvedBy?: string;
      comment?: string;
    }): Promise<void> => {
      // Update items
      const { error: itemError } = await supabase
        .from('label_items')
        .update({ proofing_status: 'approved' })
        .in('id', itemIds);

      if (itemError) throw itemError;

      // Record the approval
      const { error: approvalError } = await supabase
        .from('label_proof_approvals')
        .insert({
          order_id: orderId,
          action: 'approved',
          approved_by: approvedBy,
          comment,
        });

      if (approvalError) {
        console.warn('Failed to record approval:', approvalError);
      }

      // Update order status if all items approved
      const { data: items } = await supabase
        .from('label_items')
        .select('proofing_status')
        .eq('order_id', orderId);

      const allApproved = items?.every(i => i.proofing_status === 'approved');
      if (allApproved) {
        await supabase
          .from('label_orders')
          .update({ 
            status: 'approved',
            client_approved_at: new Date().toISOString(),
          })
          .eq('id', orderId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['label_items'] });
      queryClient.invalidateQueries({ queryKey: ['label_orders'] });
      toast.success('Proof approved');
    },
    onError: (error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });
}

/**
 * Update item proofing status
 */
export function useUpdateProofingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      status,
      artworkIssue,
    }: {
      itemId: string;
      status: ProofingStatus;
      artworkIssue?: string | null;
    }): Promise<void> => {
      const updates: Record<string, unknown> = { proofing_status: status };
      if (artworkIssue !== undefined) {
        updates.artwork_issue = artworkIssue;
      }

      const { error } = await supabase
        .from('label_items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['label_items'] });
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });
}
