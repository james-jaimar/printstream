import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Loader2, KeyRound } from 'lucide-react';
import { useCreateCustomerContact, useUpdateCustomerContact, CustomerContact } from '@/hooks/labels/useCustomerContacts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  contact?: CustomerContact | null;
}

export function ContactFormDialog({
  open,
  onOpenChange,
  customerId,
  contact,
}: ContactFormDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    receives_proofs: true,
    receives_notifications: true,
    can_approve_proofs: true,
    is_primary: false,
    notes: '',
  });
  const [portalPassword, setPortalPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const createMutation = useCreateCustomerContact();
  const updateMutation = useUpdateCustomerContact();

  const isEditing = !!contact;

  useEffect(() => {
    if (contact) {
      setFormData({
        name: contact.name,
        email: contact.email,
        phone: contact.phone || '',
        role: contact.role || '',
        receives_proofs: contact.receives_proofs,
        receives_notifications: contact.receives_notifications,
        can_approve_proofs: contact.can_approve_proofs,
        is_primary: contact.is_primary,
        notes: contact.notes || '',
      });
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        role: '',
        receives_proofs: true,
        receives_notifications: true,
        can_approve_proofs: true,
        is_primary: false,
        notes: '',
      });
    }
    setPortalPassword('');
  }, [contact, open]);

  const handleSetPortalPassword = async () => {
    if (!contact || !portalPassword || portalPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsSavingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('label-client-auth/set-password', {
        body: { contact_id: contact.id, password: portalPassword },
      });

      if (error || data?.error) {
        throw new Error(data?.error || 'Failed to set password');
      }

      toast.success('Portal password set successfully');
      setPortalPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to set portal password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email) {
      toast.error('Name and email are required');
      return;
    }

    try {
      if (isEditing && contact) {
        await updateMutation.mutateAsync({
          id: contact.id,
          customerId,
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          role: formData.role || null,
          receives_proofs: formData.receives_proofs,
          receives_notifications: formData.receives_notifications,
          can_approve_proofs: formData.can_approve_proofs,
          is_primary: formData.is_primary,
          notes: formData.notes || null,
        });
      } else {
        await createMutation.mutateAsync({
          customer_id: customerId,
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
          role: formData.role || undefined,
          receives_proofs: formData.receives_proofs,
          receives_notifications: formData.receives_notifications,
          can_approve_proofs: formData.can_approve_proofs,
          is_primary: formData.is_primary,
          notes: formData.notes || undefined,
        });
      }
      onOpenChange(false);
    } catch (error) {
      // Error already handled in mutation
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Update contact information and preferences'
              : 'Add a new contact to this customer account'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Contact name"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g. Marketing, Design"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+27..."
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Label className="text-sm font-medium">Permissions</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="receives_proofs"
                  checked={formData.receives_proofs}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, receives_proofs: !!checked })
                  }
                />
                <label htmlFor="receives_proofs" className="text-sm">
                  Receives proof emails
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="receives_notifications"
                  checked={formData.receives_notifications}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, receives_notifications: !!checked })
                  }
                />
                <label htmlFor="receives_notifications" className="text-sm">
                  Receives order notifications
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="can_approve_proofs"
                  checked={formData.can_approve_proofs}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, can_approve_proofs: !!checked })
                  }
                />
                <label htmlFor="can_approve_proofs" className="text-sm">
                  Can approve proofs
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_primary"
                  checked={formData.is_primary}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, is_primary: !!checked })
                  }
                />
                <label htmlFor="is_primary" className="text-sm">
                  Primary contact
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any notes about this contact..."
              rows={2}
            />
          </div>

          {/* Portal Access - only shown when editing an existing contact */}
          {isEditing && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Portal Access</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Set a password to allow this contact to log in to the client portal and view orders/approve proofs.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder="Set portal password (min 6 chars)"
                    className="flex-1"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSetPortalPassword}
                    disabled={isSavingPassword || portalPassword.length < 6}
                  >
                    {isSavingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Set Password'
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditing ? 'Saving...' : 'Adding...'}
              </>
            ) : (
              isEditing ? 'Save Changes' : 'Add Contact'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
