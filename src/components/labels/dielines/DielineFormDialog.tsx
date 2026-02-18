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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LABEL_PRINT_CONSTANTS, type LabelDieline, type CreateLabelDielineInput } from '@/types/labels';

interface DielineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dieline?: LabelDieline | null;
  onSubmit: (data: CreateLabelDielineInput) => Promise<void>;
  isPending: boolean;
}

const DIE_TYPE_OPTIONS = [
  'rectangle', 'square', 'circle', 'oval', 'arch', 'hexagon', 
  'scallop', 'special shape', 'tappered', 'perf', 'custom',
] as const;

const RECT_TYPES = ['rectangle', 'square'];

const defaultFormData: CreateLabelDielineInput = {
  name: '',
  roll_width_mm: 320,
  label_width_mm: 50,
  label_height_mm: 30,
  columns_across: 6,
  rows_around: 4,
  horizontal_gap_mm: 3,
  vertical_gap_mm: 2.5,
  corner_radius_mm: 0,
  is_custom: false,
  die_no: '',
  die_type: 'rectangle',
  client: '',
  rpl: '',
};

export function DielineFormDialog({
  open,
  onOpenChange,
  dieline,
  onSubmit,
  isPending,
}: DielineFormDialogProps) {
  const [formData, setFormData] = useState<CreateLabelDielineInput>(defaultFormData);
  const isEditing = !!dieline;

  useEffect(() => {
    if (dieline) {
      setFormData({
        name: dieline.name,
        roll_width_mm: dieline.roll_width_mm,
        label_width_mm: dieline.label_width_mm,
        label_height_mm: dieline.label_height_mm,
        columns_across: dieline.columns_across,
        rows_around: dieline.rows_around,
        horizontal_gap_mm: dieline.horizontal_gap_mm,
        vertical_gap_mm: dieline.vertical_gap_mm,
        corner_radius_mm: dieline.corner_radius_mm ?? 0,
        is_custom: dieline.is_custom,
        die_no: dieline.die_no ?? '',
        die_type: dieline.die_type ?? 'rectangle',
        client: dieline.client ?? '',
        rpl: dieline.rpl ?? '',
      });
    } else {
      setFormData(defaultFormData);
    }
  }, [dieline, open]);

  const isRectType = RECT_TYPES.includes(formData.die_type || 'rectangle');

  const handleDieTypeChange = (value: string) => {
    const newData = { ...formData, die_type: value };
    if (!RECT_TYPES.includes(value)) {
      newData.corner_radius_mm = undefined;
    }
    setFormData(newData);
  };

  const generateName = () => {
    const typeLabel = formData.die_type && formData.die_type !== 'rectangle' ? ` (${formData.die_type})` : '';
    return `${formData.columns_across} Across x ${formData.rows_around} Around - ${formData.label_width_mm}x${formData.label_height_mm}mm${typeLabel}`;
  };

  const handleSubmit = async () => {
    const submitData = {
      ...formData,
      name: formData.name || generateName(),
    };
    await onSubmit(submitData);
    if (!isEditing) {
      setFormData(defaultFormData);
    }
  };

  const totalWidth = (formData.label_width_mm + (formData.horizontal_gap_mm ?? 3)) * formData.columns_across;
  const totalHeight = (formData.label_height_mm + (formData.vertical_gap_mm ?? 2.5)) * formData.rows_around;
  const labelsPerFrame = formData.columns_across * formData.rows_around;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Dieline Template' : 'Create New Dieline Template'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Update the label dimensions and layout for this die.'
              : 'Define the label dimensions and layout for the die.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Die No, Type & Client */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Die No</Label>
              <Input
                value={formData.die_no ?? ''}
                onChange={(e) => setFormData({ ...formData, die_no: e.target.value })}
                placeholder="e.g. LP00065"
              />
            </div>
            <div className="space-y-2">
              <Label>Die Type</Label>
              <Select
                value={formData.die_type || 'rectangle'}
                onValueChange={handleDieTypeChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIE_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Client</Label>
              <Input
                value={formData.client ?? ''}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Roll Width & Corner Radius */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Roll Width (mm)</Label>
              <Select
                value={String(formData.roll_width_mm)}
                onValueChange={(value) =>
                  setFormData({ ...formData, roll_width_mm: Number(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_PRINT_CONSTANTS.ROLL_WIDTHS_MM.map((w) => (
                    <SelectItem key={w} value={String(w)}>{w}mm</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Corner Radius (mm)</Label>
              <Input
                type="number"
                value={isRectType ? (formData.corner_radius_mm ?? 0) : ''}
                onChange={(e) =>
                  setFormData({ ...formData, corner_radius_mm: Number(e.target.value) })
                }
                min={0}
                step={0.5}
                disabled={!isRectType}
                placeholder={!isRectType ? 'N/A for this shape' : ''}
              />
            </div>
          </div>

          {/* Label Dimensions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Label Width (mm)</Label>
              <Input
                type="number"
                value={formData.label_width_mm}
                onChange={(e) =>
                  setFormData({ ...formData, label_width_mm: Number(e.target.value) })
                }
                min={10}
                step={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Label Height (mm)</Label>
              <Input
                type="number"
                value={formData.label_height_mm}
                onChange={(e) =>
                  setFormData({ ...formData, label_height_mm: Number(e.target.value) })
                }
                min={10}
                step={1}
              />
            </div>
          </div>

          {/* Layout Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Columns Across</Label>
              <Input
                type="number"
                value={formData.columns_across}
                onChange={(e) =>
                  setFormData({ ...formData, columns_across: Number(e.target.value) })
                }
                min={1}
                max={20}
              />
            </div>
            <div className="space-y-2">
              <Label>Rows Around</Label>
              <Input
                type="number"
                value={formData.rows_around}
                onChange={(e) =>
                  setFormData({ ...formData, rows_around: Number(e.target.value) })
                }
                min={1}
                max={20}
              />
            </div>
          </div>

          {/* Gaps */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Horizontal Gap (mm)</Label>
              <Input
                type="number"
                value={formData.horizontal_gap_mm ?? 3}
                onChange={(e) =>
                  setFormData({ ...formData, horizontal_gap_mm: Number(e.target.value) })
                }
                min={0}
                step={0.5}
              />
            </div>
            <div className="space-y-2">
              <Label>Vertical Gap (mm)</Label>
              <Input
                type="number"
                value={formData.vertical_gap_mm ?? 2.5}
                onChange={(e) =>
                  setFormData({ ...formData, vertical_gap_mm: Number(e.target.value) })
                }
                min={0}
                step={0.5}
              />
            </div>
          </div>

          {/* Template Name */}
          <div className="space-y-2">
            <Label>Template Name</Label>
            <Input
              value={formData.name || generateName()}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Auto-generated from dimensions"
            />
          </div>

          {/* Preview */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Layout Preview</p>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Labels per frame: <strong>{labelsPerFrame}</strong></span>
              <span>|</span>
              <span>Total width: <strong>{totalWidth}mm</strong></span>
              <span>|</span>
              <span>Total height: <strong>{totalHeight}mm</strong></span>
              {totalWidth > formData.roll_width_mm && (
                <>
                  <span>|</span>
                  <span className="text-destructive font-medium">
                    ⚠️ Exceeds roll width!
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isPending || totalWidth > formData.roll_width_mm}
          >
            {isPending 
              ? (isEditing ? 'Saving...' : 'Creating...') 
              : (isEditing ? 'Save Changes' : 'Create Dieline')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
