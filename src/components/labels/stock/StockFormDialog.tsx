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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateLabelStock, useUpdateLabelStock } from '@/hooks/labels/useLabelStock';
import type { LabelStock, SubstrateType, FinishType } from '@/types/labels';

const SUBSTRATE_TYPES: SubstrateType[] = ['Paper', 'PP', 'PE', 'PET', 'Vinyl'];
const FINISH_TYPES: FinishType[] = ['Gloss', 'Matt', 'Uncoated'];

interface StockFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editStock?: LabelStock | null;
}

const defaultForm = {
  name: '',
  substrate_type: 'PP' as SubstrateType,
  finish: 'Gloss' as FinishType,
  width_mm: 330,
  gsm: 80,
  roll_length_meters: 1000,
  current_stock_meters: 0,
  reorder_level_meters: 500,
  cost_per_meter: undefined as number | undefined,
  supplier: '',
};

export function StockFormDialog({ open, onOpenChange, editStock }: StockFormDialogProps) {
  const [form, setForm] = useState(defaultForm);

  const createMutation = useCreateLabelStock();
  const updateMutation = useUpdateLabelStock();
  const isEditing = !!editStock;

  useEffect(() => {
    if (editStock) {
      setForm({
        name: editStock.name,
        substrate_type: editStock.substrate_type,
        finish: editStock.finish,
        width_mm: editStock.width_mm,
        gsm: editStock.gsm ?? 80,
        roll_length_meters: editStock.roll_length_meters,
        current_stock_meters: editStock.current_stock_meters,
        reorder_level_meters: editStock.reorder_level_meters,
        cost_per_meter: editStock.cost_per_meter ?? undefined,
        supplier: editStock.supplier ?? '',
      });
    } else {
      setForm(defaultForm);
    }
  }, [editStock, open]);

  const handleSubmit = async () => {
    if (!form.name || form.width_mm <= 0) return;

    const payload = {
      name: form.name,
      substrate_type: form.substrate_type,
      finish: form.finish,
      width_mm: form.width_mm,
      gsm: form.gsm || null,
      roll_length_meters: form.roll_length_meters,
      current_stock_meters: form.current_stock_meters,
      reorder_level_meters: form.reorder_level_meters,
      cost_per_meter: form.cost_per_meter || null,
      supplier: form.supplier || null,
    };

    if (isEditing) {
      await updateMutation.mutateAsync({ id: editStock!.id, updates: payload });
    } else {
      await createMutation.mutateAsync(payload as any);
    }

    onOpenChange(false);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Stock Item' : 'Add Stock Item'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update stock item details' : 'Add a new substrate to your inventory'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. PP White Gloss 80gsm - 330mm"
            />
          </div>

          {/* Type & Finish */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Substrate Type</Label>
              <Select value={form.substrate_type} onValueChange={(v) => set('substrate_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBSTRATE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Finish</Label>
              <Select value={form.finish} onValueChange={(v) => set('finish', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FINISH_TYPES.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Width & GSM */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width (mm)</Label>
              <Input
                type="number"
                value={form.width_mm}
                onChange={(e) => set('width_mm', Number(e.target.value))}
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>GSM</Label>
              <Input
                type="number"
                value={form.gsm || ''}
                onChange={(e) => set('gsm', Number(e.target.value) || null)}
                placeholder="e.g. 80"
              />
            </div>
          </div>

          {/* Roll Length & Current Stock */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Roll Length (m)</Label>
              <Input
                type="number"
                value={form.roll_length_meters}
                onChange={(e) => set('roll_length_meters', Number(e.target.value))}
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Current Stock (m)</Label>
              <Input
                type="number"
                value={form.current_stock_meters}
                onChange={(e) => set('current_stock_meters', Number(e.target.value))}
                min={0}
              />
            </div>
          </div>

          {/* Reorder Level & Cost */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Reorder Level (m)</Label>
              <Input
                type="number"
                value={form.reorder_level_meters}
                onChange={(e) => set('reorder_level_meters', Number(e.target.value))}
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Cost per Meter (R)</Label>
              <Input
                type="number"
                value={form.cost_per_meter ?? ''}
                onChange={(e) => set('cost_per_meter', Number(e.target.value) || undefined)}
                placeholder="Optional"
                step={0.01}
              />
            </div>
          </div>

          {/* Supplier */}
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Input
              value={form.supplier}
              onChange={(e) => set('supplier', e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.name}>
            {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
