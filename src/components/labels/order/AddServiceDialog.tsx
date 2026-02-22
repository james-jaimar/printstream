import { useState, useMemo } from 'react';
import { Plus, ChevronRight, Check, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useLabelFinishingOptions } from '@/hooks/labels/useLabelFinishing';
import { useLabelStages } from '@/hooks/labels/useLabelStages';
import { useAddOrderService, type LabelServiceType, type LabelOrderService } from '@/hooks/labels/useLabelOrderServices';

interface AddServiceDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outputRollsCount?: number | null;
  existingServices?: LabelOrderService[];
}

const CANONICAL_STEPS: { value: LabelServiceType; label: string; icon: string; description: string; sortOrder: number }[] = [
  { value: 'finishing', label: 'Die Cutting & Finishing', icon: '✨', description: 'Die cutting, lamination, UV varnish', sortOrder: 100 },
  { value: 'rewinding', label: 'Rewinding', icon: '🔄', description: 'Rewind to specified core sizes', sortOrder: 200 },
  { value: 'joining', label: 'Joining Rolls', icon: '🔗', description: 'Join rolls into one continuous roll', sortOrder: 300 },
  { value: 'handwork', label: 'Handwork', icon: '🖐', description: 'Manual application or sorting', sortOrder: 400 },
  { value: 'qa', label: 'Quality Inspection', icon: '✅', description: 'QA colour and print check', sortOrder: 500 },
  { value: 'packaging', label: 'Packaging', icon: '📦', description: 'Boxing and labelling', sortOrder: 600 },
  { value: 'delivery', label: 'Delivery / Collection', icon: '🚚', description: 'Courier, local delivery or collection', sortOrder: 700 },
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

export function AddServiceDialog({ orderId, open, onOpenChange, outputRollsCount, existingServices = [] }: AddServiceDialogProps) {
  const { data: finishingOptions } = useLabelFinishingOptions();
  const { data: stages } = useLabelStages();
  const addService = useAddOrderService();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [finishingOptionId, setFinishingOptionId] = useState('');
  const [deliveryOption, setDeliveryOption] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quantityUnit, setQuantityUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const existingTypes = useMemo(
    () => new Set(existingServices.map(s => s.service_type)),
    [existingServices]
  );

  const currentStep = CANONICAL_STEPS[currentStepIndex];
  const isAlreadyAdded = currentStep ? existingTypes.has(currentStep.value) : false;

  const resetFields = () => {
    setFinishingOptionId('');
    setDeliveryOption('');
    setDisplayName('');
    setQuantity('');
    setQuantityUnit('');
    setNotes('');
  };

  const resetAll = () => {
    setCurrentStepIndex(0);
    resetFields();
    setSaving(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetAll();
    onOpenChange(v);
  };

  const initStepFields = (stepIdx: number) => {
    resetFields();
    const step = CANONICAL_STEPS[stepIdx];
    if (!step) return;
    if (step.value !== 'finishing' && step.value !== 'delivery') {
      setDisplayName(step.label);
    }
    const units = QUANTITY_UNITS[step.value];
    if (units.length === 1) setQuantityUnit(units[0]);
    if (step.value === 'rewinding' && outputRollsCount != null) {
      setQuantity(String(outputRollsCount));
      setQuantityUnit('rolls');
    }
  };

  const goToStep = (idx: number) => {
    setCurrentStepIndex(idx);
    initStepFields(idx);
  };

  // Find the first unadded step at or after `from`
  const findNextAvailableStep = (from: number): number | null => {
    for (let i = from; i < CANONICAL_STEPS.length; i++) {
      if (!existingTypes.has(CANONICAL_STEPS[i].value)) return i;
    }
    return null;
  };

  const handleOpenChange = (v: boolean) => {
    if (v) {
      // On open, jump to the first unadded step
      const first = findNextAvailableStep(0);
      if (first !== null) {
        goToStep(first);
      } else {
        setCurrentStepIndex(0);
      }
    }
    handleClose(v);
  };

  const resolveStageId = (): string | null => {
    if (!stages || !currentStep) return null;
    if (currentStep.value === 'finishing' && finishingOptionId) {
      const opt = finishingOptions?.find(o => o.id === finishingOptionId);
      return opt?.triggers_stage_id || null;
    }
    if (currentStep.value === 'rewinding') return stages.find(s => s.name === 'Rewinding')?.id || null;
    if (currentStep.value === 'joining') return stages.find(s => s.name === 'Joining Rolls')?.id || null;
    if (currentStep.value === 'handwork') return stages.find(s => s.name === 'Handwork')?.id || null;
    if (currentStep.value === 'qa') return stages.find(s => s.name === 'Quality Inspection')?.id || null;
    if (currentStep.value === 'packaging') return stages.find(s => s.name === 'Labelling & Boxing')?.id || null;
    if (currentStep.value === 'delivery' && deliveryOption) {
      const opt = DELIVERY_OPTIONS.find(d => d.value === deliveryOption);
      return opt?.stage ? stages.find(s => s.name === opt.stage)?.id || null : null;
    }
    return null;
  };

  const advanceOrFinish = () => {
    const next = findNextAvailableStep(currentStepIndex + 1);
    if (next !== null) {
      goToStep(next);
    } else {
      handleClose(false);
    }
  };

  const handleAddAndContinue = async () => {
    if (!currentStep || !displayName.trim()) return;
    setSaving(true);
    try {
      await addService.mutateAsync({
        order_id: orderId,
        service_type: currentStep.value,
        display_name: displayName.trim(),
        finishing_option_id: finishingOptionId || null,
        stage_id: resolveStageId(),
        quantity: quantity ? parseFloat(quantity) : null,
        quantity_unit: quantityUnit || null,
        notes: notes || null,
        sort_order: currentStep.sortOrder,
      });
      // Mark as now existing so dots update
      existingTypes.add(currentStep.value);
      advanceOrFinish();
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    advanceOrFinish();
  };

  const canSave = !!displayName.trim() && (
    currentStep?.value !== 'finishing' || !!finishingOptionId
  ) && (
    currentStep?.value !== 'delivery' || !!deliveryOption
  );

  const isLastAvailableStep = findNextAvailableStep(currentStepIndex + 1) === null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[50vw] max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <Plus className="h-3.5 w-3.5" />
            Add Services
            {currentStep && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                — Step {currentStepIndex + 1}/{CANONICAL_STEPS.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator — compact dots */}
        <div className="flex items-center gap-1 py-1.5">
          {CANONICAL_STEPS.map((step, idx) => {
            const added = existingTypes.has(step.value);
            const isCurrent = idx === currentStepIndex;
            return (
              <button
                key={step.value}
                type="button"
                onClick={() => !added && goToStep(idx)}
                disabled={added}
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-xs transition-colors shrink-0",
                  isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                  !isCurrent && added && "bg-primary/15 text-primary",
                  !isCurrent && !added && "bg-muted text-muted-foreground hover:bg-accent",
                )}
                title={step.label}
              >
                {added ? <Check className="h-3 w-3" /> : <span className="text-[10px]">{step.icon}</span>}
              </button>
            );
          })}
        </div>

        {currentStep && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            {/* Step header */}
            <div className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-muted/30">
              <span className="text-xl">{currentStep.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{currentStep.label}</p>
                <p className="text-[11px] text-muted-foreground">{currentStep.description}</p>
              </div>
              {isAlreadyAdded && (
                <Badge className="ml-auto bg-primary/10 text-primary text-[10px]">Added</Badge>
              )}
            </div>

            {isAlreadyAdded ? (
              <div className="text-center py-3">
                <p className="text-xs text-muted-foreground mb-2">Already configured.</p>
                <Button size="sm" onClick={handleSkip} className="h-8 text-xs">
                  {isLastAvailableStep ? 'Finish' : 'Continue'} <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            ) : (
              <>
                {currentStep.value === 'finishing' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Finishing Option *</Label>
                    <Select
                      value={finishingOptionId}
                      onValueChange={v => {
                        setFinishingOptionId(v);
                        const opt = finishingOptions?.find(o => o.id === v);
                        if (opt) setDisplayName(opt.display_name);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {(finishingOptions || []).filter(o => o.is_active).map(opt => (
                          <SelectItem key={opt.id} value={opt.id}>
                            <span className="flex items-center gap-1.5">
                              {opt.display_name}
                              <Badge variant="outline" className="text-[9px]">{opt.category.replace('_', ' ')}</Badge>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {currentStep.value === 'delivery' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Delivery Method *</Label>
                    <Select
                      value={deliveryOption}
                      onValueChange={v => {
                        setDeliveryOption(v);
                        setDisplayName(v);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {DELIVERY_OPTIONS.map(d => (
                          <SelectItem key={d.value} value={d.value}>{d.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Display Name *</Label>
                  <Input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Rewind to 25mm cores"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      placeholder="e.g. 12"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <Select value={quantityUnit} onValueChange={setQuantityUnit}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unit" /></SelectTrigger>
                      <SelectContent>
                        {QUANTITY_UNITS[currentStep.value].map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any additional instructions…"
                    className="text-xs min-h-[50px] resize-none"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Fixed footer actions */}
        {currentStep && !isAlreadyAdded && (
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handleSkip} className="gap-1 h-8 text-xs">
              <SkipForward className="h-3 w-3" />
              Skip
            </Button>
            <Button
              size="sm"
              onClick={handleAddAndContinue}
              disabled={!canSave || saving}
              className="flex-1 h-8 text-xs"
            >
              {saving ? 'Adding…' : isLastAvailableStep ? 'Add & Finish' : 'Add & Continue'}
              {!isLastAvailableStep && <ChevronRight className="h-3 w-3 ml-1" />}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
