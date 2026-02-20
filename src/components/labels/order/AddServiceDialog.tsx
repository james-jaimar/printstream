import { useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useLabelFinishingOptions } from '@/hooks/labels/useLabelFinishing';
import { useLabelStages } from '@/hooks/labels/useLabelStages';
import { useAddOrderService, type LabelServiceType } from '@/hooks/labels/useLabelOrderServices';

interface AddServiceDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SERVICE_TYPES: { value: LabelServiceType; label: string; icon: string; description: string }[] = [
  { value: 'finishing', label: 'Finishing', icon: '✨', description: 'Lamination, UV varnish, sheeting' },
  { value: 'rewinding', label: 'Rewinding', icon: '🔄', description: 'Rewind to specified core sizes' },
  { value: 'joining', label: 'Joining Rolls', icon: '🔗', description: 'Join rolls into one continuous roll' },
  { value: 'handwork', label: 'Handwork', icon: '🖐', description: 'Manual application or sorting' },
  { value: 'qa', label: 'Quality Inspection', icon: '✅', description: 'QA colour and print check' },
  { value: 'packaging', label: 'Packaging', icon: '📦', description: 'Boxing and labelling' },
  { value: 'delivery', label: 'Delivery / Collection', icon: '🚚', description: 'Courier, local delivery or collection' },
];

const DELIVERY_OPTIONS = [
  { value: 'Collection', stage: null },
  { value: 'Local Delivery', stage: 'Local Delivery' },
  { value: 'Courier', stage: 'Courier' },
  { value: 'Postal', stage: null },
];

const QUANTITY_UNITS: Record<LabelServiceType, string[]> = {
  finishing: ['meters', 'labels'],
  rewinding: ['rolls'],
  joining: ['rolls'],
  handwork: ['labels', 'rolls', 'hours'],
  qa: ['rolls', 'labels'],
  packaging: ['boxes', 'rolls'],
  delivery: ['parcels', 'boxes'],
};

export function AddServiceDialog({ orderId, open, onOpenChange }: AddServiceDialogProps) {
  const { data: finishingOptions } = useLabelFinishingOptions();
  const { data: stages } = useLabelStages();
  const addService = useAddOrderService();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<LabelServiceType | null>(null);
  const [finishingOptionId, setFinishingOptionId] = useState<string>('');
  const [deliveryOption, setDeliveryOption] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quantityUnit, setQuantityUnit] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setStep(1);
    setSelectedType(null);
    setFinishingOptionId('');
    setDeliveryOption('');
    setDisplayName('');
    setQuantity('');
    setQuantityUnit('');
    setNotes('');
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleSelectType = (type: LabelServiceType) => {
    setSelectedType(type);
    const typeInfo = SERVICE_TYPES.find(t => t.value === type)!;
    // Pre-fill display name
    if (type !== 'finishing' && type !== 'delivery') {
      setDisplayName(typeInfo.label);
    }
    // Pre-fill default unit
    const units = QUANTITY_UNITS[type];
    if (units.length === 1) setQuantityUnit(units[0]);
    setStep(2);
  };

  const resolveStageId = (): string | null => {
    if (!stages) return null;
    if (selectedType === 'finishing' && finishingOptionId) {
      const opt = finishingOptions?.find(o => o.id === finishingOptionId);
      return opt?.triggers_stage_id || null;
    }
    if (selectedType === 'rewinding') return stages.find(s => s.name === 'Rewinding')?.id || null;
    if (selectedType === 'joining') return stages.find(s => s.name === 'Joining Rolls')?.id || null;
    if (selectedType === 'handwork') return stages.find(s => s.name === 'Handwork')?.id || null;
    if (selectedType === 'qa') return stages.find(s => s.name === 'Quality Inspection')?.id || null;
    if (selectedType === 'packaging') return stages.find(s => s.name === 'Labelling & Boxing')?.id || null;
    if (selectedType === 'delivery' && deliveryOption) {
      const opt = DELIVERY_OPTIONS.find(d => d.value === deliveryOption);
      return opt?.stage ? stages.find(s => s.name === opt.stage)?.id || null : null;
    }
    return null;
  };

  const handleSave = async () => {
    if (!selectedType || !displayName.trim()) return;
    await addService.mutateAsync({
      order_id: orderId,
      service_type: selectedType,
      display_name: displayName.trim(),
      finishing_option_id: finishingOptionId || null,
      stage_id: resolveStageId(),
      quantity: quantity ? parseFloat(quantity) : null,
      quantity_unit: quantityUnit || null,
      notes: notes || null,
    });
    handleClose(false);
  };

  const canSave = !!displayName.trim() && (
    selectedType !== 'finishing' || !!finishingOptionId
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Service
            {step === 2 && selectedType && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-base font-normal text-muted-foreground">
                  {SERVICE_TYPES.find(t => t.value === selectedType)?.label}
                </span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">Choose the type of service to add:</p>
            {SERVICE_TYPES.map(type => (
              <button
                key={type.value}
                onClick={() => handleSelectType(type.value)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border text-left hover:bg-muted/50 transition-colors"
              >
                <span className="text-xl">{type.icon}</span>
                <div>
                  <p className="text-sm font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && selectedType && (
          <div className="space-y-4">
            {/* Finishing — pick option */}
            {selectedType === 'finishing' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Finishing Option *</Label>
                <Select
                  value={finishingOptionId}
                  onValueChange={v => {
                    setFinishingOptionId(v);
                    const opt = finishingOptions?.find(o => o.id === v);
                    if (opt) setDisplayName(opt.display_name);
                  }}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(finishingOptions || []).filter(o => o.is_active).map(opt => (
                      <SelectItem key={opt.id} value={opt.id}>
                        <span className="flex items-center gap-2">
                          {opt.display_name}
                          <Badge variant="outline" className="text-[9px]">{opt.category.replace('_', ' ')}</Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Delivery — pick method */}
            {selectedType === 'delivery' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Delivery Method *</Label>
                <Select
                  value={deliveryOption}
                  onValueChange={v => {
                    setDeliveryOption(v);
                    setDisplayName(v);
                  }}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {DELIVERY_OPTIONS.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Display name */}
            <div className="space-y-1.5">
              <Label className="text-xs">Display Name *</Label>
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Rewind to 25mm cores"
                className="h-9 text-sm"
              />
            </div>

            {/* Quantity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="e.g. 12"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit</Label>
                <Select value={quantityUnit} onValueChange={setQuantityUnit}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    {QUANTITY_UNITS[selectedType].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any additional instructions…"
                className="text-sm min-h-[60px]"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setStep(1); setSelectedType(null); }}>
                Back
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!canSave || addService.isPending} className="flex-1">
                {addService.isPending ? 'Adding…' : 'Add Service'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
