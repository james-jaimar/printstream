import { useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    user_id: string;
    company_name: string;
    contact_name?: string;
    contact_email: string;
    contact_phone?: string;
    billing_address?: string;
    notes?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: CustomerFormDialogProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    company_name: '',
    contact_name: '',
    contact_phone: '',
    billing_address: '',
    notes: '',
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const handleSubmit = async () => {
    if (!formData.email || !formData.password || !formData.company_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsCreatingUser(true);
    try {
      // Create auth user first
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      await onSubmit({
        user_id: authData.user.id,
        company_name: formData.company_name,
        contact_name: formData.contact_name || undefined,
        contact_email: formData.email,
        contact_phone: formData.contact_phone || undefined,
        billing_address: formData.billing_address || undefined,
        notes: formData.notes || undefined,
      });

      // Reset form
      setFormData({
        email: '',
        password: '',
        company_name: '',
        contact_name: '',
        contact_phone: '',
        billing_address: '',
        notes: '',
      });
    } catch (error: any) {
      console.error('Error creating customer:', error);
      toast.error(error.message || 'Failed to create customer');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const isPending = isCreatingUser || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Customer Account</DialogTitle>
          <DialogDescription>
            Create a new customer with portal access
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="client@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Company Name *</Label>
            <Input
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              placeholder="Company Ltd"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary Contact Name</Label>
              <Input
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                placeholder="+27..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Billing Address</Label>
            <Textarea
              value={formData.billing_address}
              onChange={(e) => setFormData({ ...formData, billing_address: e.target.value })}
              placeholder="Enter billing address..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes..."
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
                Creating...
              </>
            ) : (
              'Create Customer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
