/**
 * Send Proofing Dialog
 * Before sending: increments proof_version, sets status to pending_approval,
 * marks draft items as ready_for_proof.
 * Then allows admin to select contacts and send proof notifications.
 */

import { useState, useMemo } from 'react';
import { Send, Mail, Check, AlertTriangle, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCustomerContacts } from '@/hooks/labels/useCustomerContacts';
import { useSendProofNotification } from '@/hooks/labels/useProofingWorkflow';
import { useUpdateLabelOrder } from '@/hooks/labels/useLabelOrders';
import { supabase } from '@/integrations/supabase/client';
import type { LabelOrder, LabelItem } from '@/types/labels';

interface SendProofingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: LabelOrder;
  items: LabelItem[];
}

export function SendProofingDialog({
  open,
  onOpenChange,
  order,
  items,
}: SendProofingDialogProps) {
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  
  const { data: contacts = [], isLoading: contactsLoading } = useCustomerContacts(order.customer_id ?? undefined);
  const sendProof = useSendProofNotification();
  const updateOrder = useUpdateLabelOrder();

  const nextVersion = (order.proof_version ?? 0) + 1;

  // Filter contacts that can receive proofs
  const proofContacts = useMemo(() => 
    contacts.filter(c => c.is_active && c.receives_proofs),
    [contacts]
  );

  // Exclude multi-page parent PDFs (page_count > 1 and no parent_item_id)
  const visibleItems = useMemo(() =>
    items.filter(item => !(item.page_count > 1 && !item.parent_item_id)),
    [items]
  );

  // Items ready for proofing
  const readyItems = useMemo(() => 
    visibleItems.filter(item => 
      item.proofing_status === 'ready_for_proof' || 
      item.proofing_status === 'draft' ||
      (item.proof_pdf_url || item.artwork_pdf_url)
    ),
    [visibleItems]
  );

  const handleToggleContact = (contactId: string, checked: boolean) => {
    setSelectedContactIds(prev =>
      checked
        ? [...prev, contactId]
        : prev.filter(id => id !== contactId)
    );
  };

  const handleSend = async () => {
    if (selectedContactIds.length === 0) return;

    try {
      // 1. Increment proof_version and set status to pending_approval
      await updateOrder.mutateAsync({
        id: order.id,
        updates: {
          proof_version: nextVersion,
          status: 'pending_approval' as const,
        },
      });

      // 2. Mark all draft/ready items with artwork as ready_for_proof
      const itemsToMark = visibleItems.filter(item =>
        (item.proofing_status === 'draft' || item.proofing_status === 'client_needs_upload') &&
        (item.proof_pdf_url || item.artwork_pdf_url)
      );
      if (itemsToMark.length > 0) {
        await supabase
          .from('label_items')
          .update({ proofing_status: 'ready_for_proof' })
          .in('id', itemsToMark.map(i => i.id));
      }

      // 3. Send proof notification emails
      await sendProof.mutateAsync({
        orderId: order.id,
        contactIds: selectedContactIds,
        message: message.trim() || undefined,
      });

      onOpenChange(false);
      setSelectedContactIds([]);
      setMessage('');
    } catch {
      // Error handled by hooks
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Proof v{nextVersion} for Approval
          </DialogTitle>
          <DialogDescription>
            Select contacts to notify about the proof for order {order.order_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Summary */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Items to include in proof:</span>
            <Badge variant={readyItems.length > 0 ? 'default' : 'secondary'}>
              {readyItems.length} of {visibleItems.length}
            </Badge>
          </div>

          {readyItems.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No items have artwork uploaded. Upload proof artwork first.
              </AlertDescription>
            </Alert>
          )}

          {/* Version info */}
          {(order.proof_version ?? 0) > 0 && (
            <Alert>
              <AlertDescription className="text-sm">
                This will send <strong>revision v{nextVersion}</strong> to the client. Previous version was v{order.proof_version}.
              </AlertDescription>
            </Alert>
          )}

          {/* Contact Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Contacts to Notify</Label>
            
            {contactsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : proofContacts.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No contacts configured to receive proofs. Add contacts in Customer settings.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-lg p-2">
                {proofContacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedContactIds.includes(contact.id)}
                      onCheckedChange={(checked) => 
                        handleToggleContact(contact.id, checked as boolean)
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium text-sm">{contact.name}</span>
                        {contact.is_primary && (
                          <Badge variant="outline" className="text-xs">Primary</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </div>
                      <div className="flex gap-2 mt-1">
                        {contact.can_approve_proofs && (
                          <Badge variant="secondary" className="text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            Can approve
                          </Badge>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Optional Message */}
          <div className="space-y-2">
            <Label htmlFor="message" className="text-sm font-medium">
              Optional Message
            </Label>
            <Textarea
              id="message"
              placeholder="Add a note for the client..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={selectedContactIds.length === 0 || readyItems.length === 0 || sendProof.isPending || updateOrder.isPending}
          >
            {sendProof.isPending || updateOrder.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Proof v{nextVersion}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
