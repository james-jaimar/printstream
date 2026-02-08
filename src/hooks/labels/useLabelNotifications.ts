/**
 * Label Notifications Hook
 * Handles sending email notifications for label orders
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type NotificationType = 'proof_ready' | 'approval_received' | 'order_complete';

interface SendNotificationInput {
  type: NotificationType;
  order_id: string;
  recipient_email?: string;
}

export function useSendLabelNotification() {
  return useMutation({
    mutationFn: async (input: SendNotificationInput): Promise<void> => {
      const { data, error } = await supabase.functions.invoke('label-notify', {
        body: input,
      });

      if (error) {
        console.error('Notification error:', error);
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to send notification');
      }
    },
    onSuccess: (_, variables) => {
      const messages: Record<NotificationType, string> = {
        proof_ready: 'Proof notification sent to client',
        approval_received: 'Approval confirmation sent',
        order_complete: 'Completion notification sent',
      };
      toast.success(messages[variables.type]);
    },
    onError: (error) => {
      toast.error(`Failed to send notification: ${error.message}`);
    },
  });
}
