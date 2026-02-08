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
import { Loader2 } from 'lucide-react';
import { useCreateCustomerContact, useUpdateCustomerContact, CustomerContact } from '@/hooks/labels/useCustomerContacts';
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
    create_login: false,
    password: '',
  });

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
        create_login: false,
        password: '',
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
        create_login: false,
        password: '',
      });
    }
  }, [contact, open]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.email) {
      toast.error('Name and email are required');
      return;
    }

    if (formData.create_login && !formData.password) {
      toast.error('Password is required when creating login');
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
          create_login: formData.create_login,
          password: formData.password || undefined,
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

          {!isEditing && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="create_login"
                  checked={formData.create_login}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, create_login: !!checked })
                  }
                />
                <label htmlFor="create_login" className="text-sm font-medium">
                  Create portal login for this contact
                </label>
              </div>
              {formData.create_login && (
                <div className="space-y-2 pl-6">
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any notes about this contact..."
              rows={2}
            />
          </div>
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
