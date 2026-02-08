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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface LabelCustomer {
  id: string;
  company_name: string;
  billing_address: string | null;
  notes: string | null;
  is_active: boolean;
}

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    id?: string;
    company_name: string;
    billing_address?: string;
    notes?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  customer?: LabelCustomer | null;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  customer,
}: CustomerFormDialogProps) {
  const [formData, setFormData] = useState({
    company_name: '',
    billing_address: '',
    notes: '',
  });

  const isEditing = !!customer;

  // Populate form when editing
  useEffect(() => {
    if (customer) {
      setFormData({
        company_name: customer.company_name || '',
        billing_address: customer.billing_address || '',
        notes: customer.notes || '',
      });
    } else {
      setFormData({
        company_name: '',
        billing_address: '',
        notes: '',
      });
    }
  }, [customer, open]);

  const handleSubmit = async () => {
    if (!formData.company_name.trim()) {
      toast.error('Please enter a company name');
      return;
    }

    try {
      await onSubmit({
        id: customer?.id,
        company_name: formData.company_name.trim(),
        billing_address: formData.billing_address.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });

      // Reset form only on create
      if (!isEditing) {
        setFormData({
          company_name: '',
          billing_address: '',
          notes: '',
        });
      }
    } catch (error: any) {
      console.error('Error saving customer:', error);
      toast.error(error.message || 'Failed to save customer');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Customer' : 'Create Customer'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the company details below.'
              : 'Add a new customer company. You can add contacts after creation.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Company Name *</Label>
            <Input
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              placeholder="Company (Pty) Ltd"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Billing Address</Label>
            <Textarea
              value={formData.billing_address}
              onChange={(e) => setFormData({ ...formData, billing_address: e.target.value })}
              placeholder="Enter billing address..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes about this customer..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditing ? 'Saving...' : 'Creating...'}
              </>
            ) : (
              isEditing ? 'Save Changes' : 'Create Customer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
