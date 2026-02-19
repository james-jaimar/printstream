import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateLabelItem } from '@/hooks/labels/useLabelItems';
import { toast } from 'sonner';

interface AddLabelItemDialogProps {
  orderId: string;
  onSuccess?: () => void;
  /** Auto-fill from dieline template */
  dielineWidth?: number;
  dielineHeight?: number;
  /** How many items already exist (for naming Page N+1, N+2…) */
  existingItemCount?: number;
}

export function AddLabelItemDialog({
  orderId,
  onSuccess,
  dielineWidth,
  dielineHeight,
  existingItemCount = 0,
}: AddLabelItemDialogProps) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const createItem = useCreateLabelItem();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (count < 1 || quantity < 1) return;
    setIsSubmitting(true);

    try {
      for (let i = 0; i < count; i++) {
        await createItem.mutateAsync({
          order_id: orderId,
          name: `Page ${existingItemCount + i + 1}`,
          quantity,
          width_mm: dielineWidth,
          height_mm: dielineHeight,
        });
      }
      toast.success(`Added ${count} placeholder${count > 1 ? 's' : ''}`);
      setOpen(false);
      setCount(1);
      setQuantity(1);
      onSuccess?.();
    } catch {
      // Error handled by mutation
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Placeholder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Placeholders</DialogTitle>
          <DialogDescription>
            Add placeholder items for quoting. Artwork can be uploaded later.
            {dielineWidth && dielineHeight && (
              <span className="block mt-1 text-xs">
                Size auto-filled from dieline: {dielineWidth}×{dielineHeight}mm
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Number of placeholders</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <p className="text-xs text-muted-foreground">
                Named Page {existingItemCount + 1}
                {count > 1 ? ` – Page ${existingItemCount + count}` : ''}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Quantity per label</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>

          {dielineWidth && dielineHeight && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Width (mm)</Label>
                <Input value={dielineWidth} disabled />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Height (mm)</Label>
                <Input value={dielineHeight} disabled />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : `Add ${count} Placeholder${count > 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
