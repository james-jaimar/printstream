/**
 * Request Artwork Dialog
 * Allows admin to flag items as needing new artwork and notify client
 */

import { useState, useMemo } from 'react';
import { ImageOff, Send, User, Mail, Loader2, AlertTriangle, Check } from 'lucide-react';
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
import { useRequestNewArtwork } from '@/hooks/labels/useProofingWorkflow';
import type { LabelOrder, LabelItem } from '@/types/labels';

interface RequestArtworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: LabelOrder;
  items: LabelItem[];
}

export function RequestArtworkDialog({
  open,
  onOpenChange,
  order,
  items,
}: RequestArtworkDialogProps) {
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [issue, setIssue] = useState('');
  
  const { data: contacts = [], isLoading: contactsLoading } = useCustomerContacts(order.customer_id ?? undefined);
  const requestArtwork = useRequestNewArtwork();

  // Filter contacts that can receive notifications
  const activeContacts = useMemo(() => 
    contacts.filter(c => c.is_active && c.receives_notifications),
    [contacts]
  );

  // Items that have issues or can be flagged
  const flaggableItems = useMemo(() => 
    items.filter(item => 
      item.preflight_status === 'failed' || 
      item.preflight_status === 'warnings' ||
      item.proofing_status === 'draft' ||
      item.proofing_status === 'awaiting_client'
    ),
    [items]
  );

  const handleToggleItem = (itemId: string, checked: boolean) => {
    setSelectedItemIds(prev =>
      checked
        ? [...prev, itemId]
        : prev.filter(id => id !== itemId)
    );
  };

  const handleToggleContact = (contactId: string, checked: boolean) => {
    setSelectedContactIds(prev =>
      checked
        ? [...prev, contactId]
        : prev.filter(id => id !== contactId)
    );
  };

  const handleSubmit = async () => {
    if (selectedItemIds.length === 0 || !issue.trim()) return;

    try {
      await requestArtwork.mutateAsync({
        orderId: order.id,
        itemIds: selectedItemIds,
        issue: issue.trim(),
        contactIds: selectedContactIds,
      });
      onOpenChange(false);
      setSelectedItemIds([]);
      setSelectedContactIds([]);
      setIssue('');
    } catch {
      // Error handled by hook
    }
  };

  const getItemStatus = (item: LabelItem) => {
    if (item.preflight_status === 'failed') return { label: 'Failed', variant: 'destructive' as const };
    if (item.preflight_status === 'warnings') return { label: 'Warnings', variant: 'secondary' as const };
    return { label: 'Pending', variant: 'outline' as const };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageOff className="h-5 w-5" />
            Request New Artwork from Client
          </DialogTitle>
          <DialogDescription>
            Flag items that need corrected artwork and notify the client
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Item Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Items with Issues</Label>
            
            {flaggableItems.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  All items appear to be valid. Upload artwork to see validation results.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2 max-h-[150px] overflow-y-auto border rounded-lg p-2">
                {flaggableItems.map((item) => {
                  const status = getItemStatus(item);
                  return (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedItemIds.includes(item.id)}
                        onCheckedChange={(checked) => 
                          handleToggleItem(item.id, checked as boolean)
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{item.name}</span>
                          <Badge variant={status.variant} className="text-xs">
                            {status.label}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Qty: {item.quantity.toLocaleString()}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Issue Description */}
          <div className="space-y-2">
            <Label htmlFor="issue" className="text-sm font-medium">
              Issue Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="issue"
              placeholder="Describe what's wrong with the artwork and what the client needs to fix..."
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              This message will be shown to the client when they view the order.
            </p>
          </div>

          {/* Contact Selection (optional) */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Notify Contacts (Optional)</Label>
            
            {contactsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : activeContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No contacts configured for notifications.
              </p>
            ) : (
              <div className="space-y-2 max-h-[120px] overflow-y-auto border rounded-lg p-2">
                {activeContacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedContactIds.includes(contact.id)}
                      onCheckedChange={(checked) => 
                        handleToggleContact(contact.id, checked as boolean)
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{contact.name}</span>
                        {contact.is_primary && (
                          <Badge variant="outline" className="text-xs">Primary</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedItemIds.length === 0 || !issue.trim() || requestArtwork.isPending}
            variant="destructive"
          >
            {requestArtwork.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Request New Artwork
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
