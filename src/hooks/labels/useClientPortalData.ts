import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientAuth } from './useClientAuth';
import { toast } from 'sonner';
import type { LabelOrder } from '@/types/labels';

const CLIENT_ORDERS_KEY = ['label_client_orders'];

function useClientFetch() {
  const { token } = useClientAuth();

  return async (path: string, options?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }) => {
    const { data, error } = await supabase.functions.invoke(`label-client-data${path}`, {
      method: (options?.method || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      body: options?.body,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) throw new Error('Request failed');
    if (data?.error) throw new Error(data.error);
    return data;
  };
}

export function useClientPortalOrders() {
  const { token } = useClientAuth();
  const clientFetch = useClientFetch();

  return useQuery({
    queryKey: CLIENT_ORDERS_KEY,
    queryFn: async (): Promise<LabelOrder[]> => {
      const data = await clientFetch('/orders');
      return (data?.orders || []) as unknown as LabelOrder[];
    },
    enabled: !!token,
  });
}

export function useClientPortalOrder(orderId: string | undefined) {
  const { token } = useClientAuth();
  const clientFetch = useClientFetch();

  return useQuery({
    queryKey: [...CLIENT_ORDERS_KEY, orderId],
    queryFn: async (): Promise<LabelOrder | null> => {
      if (!orderId) return null;
      const data = await clientFetch(`/order/${orderId}`);
      return (data?.order || null) as unknown as LabelOrder | null;
    },
    enabled: !!token && !!orderId,
  });
}

export function useClientPortalApprovals(orderId: string | undefined) {
  const { token } = useClientAuth();
  const clientFetch = useClientFetch();

  return useQuery({
    queryKey: ['label_proof_approvals', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const data = await clientFetch(`/approvals/${orderId}`);
      return data?.approvals || [];
    },
    enabled: !!token && !!orderId,
  });
}

// Legacy order-level approval
export function useClientPortalApprove() {
  const queryClient = useQueryClient();
  const clientFetch = useClientFetch();

  return useMutation({
    mutationFn: async (input: {
      order_id: string;
      action: 'approved' | 'rejected';
      comment?: string;
    }) => {
      await clientFetch('/approve', {
        method: 'POST',
        body: input,
      });
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

// Item-level approval
export function useClientPortalApproveItems() {
  const queryClient = useQueryClient();
  const clientFetch = useClientFetch();

  return useMutation({
    mutationFn: async (input: {
      order_id: string;
      item_ids: string[];
      action: 'approved' | 'rejected';
      comment?: string;
    }) => {
      const data = await clientFetch('/approve-items', {
        method: 'POST',
        body: input,
      });
      return data as { success: boolean; all_approved?: boolean; auto_impose_triggered?: boolean };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: CLIENT_ORDERS_KEY });
      queryClient.invalidateQueries({ queryKey: [...CLIENT_ORDERS_KEY, variables.order_id] });
      queryClient.invalidateQueries({ queryKey: ['label_proof_approvals', variables.order_id] });

      if (data.all_approved) {
        toast.success('All items approved — order moving to production!');
      } else if (variables.action === 'approved') {
        toast.success(`${variables.item_ids.length} item(s) approved`);
      } else {
        toast.success('Changes requested — feedback sent');
      }
    },
    onError: (error) => {
      console.error('Item approval error:', error);
      toast.error('Failed to submit approval');
    },
  });
}

// Client artwork upload
export function useClientPortalUploadArtwork() {
  const queryClient = useQueryClient();
  const { token } = useClientAuth();

  return useMutation({
    mutationFn: async (input: { order_id: string; item_id: string; file: File }) => {
      const formData = new FormData();
      formData.append('order_id', input.order_id);
      formData.append('item_id', input.item_id);
      formData.append('file', input.file);

      const { data, error } = await supabase.functions.invoke('label-client-data/upload-artwork', {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw new Error('Upload failed');
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...CLIENT_ORDERS_KEY, variables.order_id] });
      toast.success('Artwork uploaded — our team will review it shortly');
    },
    onError: (error) => {
      console.error('Upload error:', error);
      toast.error('Failed to upload artwork');
    },
  });
}

// Confirm orientation
export function useClientPortalConfirmOrientation() {
  const queryClient = useQueryClient();
  const clientFetch = useClientFetch();

  return useMutation({
    mutationFn: async (orderId: string) => {
      await clientFetch('/confirm-orientation', {
        method: 'POST',
        body: { order_id: orderId },
      });
    },
    onSuccess: (_, orderId) => {
      queryClient.invalidateQueries({ queryKey: CLIENT_ORDERS_KEY });
      queryClient.invalidateQueries({ queryKey: [...CLIENT_ORDERS_KEY, orderId] });
      toast.success('Orientation confirmed successfully');
    },
    onError: (error) => {
      console.error('Orientation confirm error:', error);
      toast.error('Failed to confirm orientation');
    },
  });
}
