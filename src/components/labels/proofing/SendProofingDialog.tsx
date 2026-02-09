/**
 * Send Proofing Dialog
 * Allows admin to select contacts and send proof notifications
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

  // Filter contacts that can receive proofs
  const proofContacts = useMemo(() => 
    contacts.filter(c => c.is_active && c.receives_proofs),
    [contacts]
  );

  // Items ready for proofing
  const readyItems = useMemo(() => 
    items.filter(item => 
      item.proofing_status === 'ready_for_proof' || 
      (item.proofing_status === 'draft' && (item.proof_pdf_url || item.artwork_pdf_url))
    ),
    [items]
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
      await sendProof.mutateAsync({
        orderId: order.id,
        contactIds: selectedContactIds,
        message: message.trim() || undefined,
      });
      onOpenChange(false);
      setSelectedContactIds([]);
      setMessage('');
    } catch {
      // Error handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Proof for Approval
          </DialogTitle>
          <DialogDescription>
            Select contacts to notify about the proof for order {order.order_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Summary */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Items ready for proofing:</span>
            <Badge variant={readyItems.length > 0 ? 'default' : 'secondary'}>
              {readyItems.length} of {items.length}
            </Badge>
          </div>

          {readyItems.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No items are marked as ready for proofing. Upload proof artwork first.
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
            disabled={selectedContactIds.length === 0 || readyItems.length === 0 || sendProof.isPending}
          >
            {sendProof.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Proof Notification
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
