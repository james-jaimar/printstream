import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useLabelFinishingOptions,
  useCreateFinishingOption,
  useUpdateFinishingOption,
  useDeleteFinishingOption,
  type LabelFinishingOption,
  type LabelFinishingCategory,
  type CreateFinishingOptionInput,
} from '@/hooks/labels/useLabelFinishing';
import { useLabelStages } from '@/hooks/labels/useLabelStages';

const CATEGORIES: { value: LabelFinishingCategory; label: string }[] = [
  { value: 'lamination', label: 'Lamination' },
  { value: 'uv_varnish', label: 'UV Varnish' },
  { value: 'sheeting', label: 'Sheeting' },
];

const CATEGORY_COLORS: Record<LabelFinishingCategory, string> = {
  lamination: 'bg-indigo-100 text-indigo-700',
  uv_varnish: 'bg-amber-100 text-amber-700',
  sheeting: 'bg-emerald-100 text-emerald-700',
};

interface FormState {
  name: string;
  display_name: string;
  category: LabelFinishingCategory;
  description: string;
  triggers_stage_id: string;
}

const defaultForm = (cat: LabelFinishingCategory): FormState => ({
  name: '', display_name: '', category: cat, description: '', triggers_stage_id: '',
});

function FinishingList({ category }: { category: LabelFinishingCategory }) {
  const { data: options, isLoading } = useLabelFinishingOptions(category);
  const { data: stages } = useLabelStages();
  const create = useCreateFinishingOption();
  const update = useUpdateFinishingOption();
  const remove = useDeleteFinishingOption();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm(category));

  const buildInput = (f: FormState): CreateFinishingOptionInput => ({
    name: f.name,
    display_name: f.display_name,
    category: f.category,
    description: f.description || undefined,
    triggers_stage_id: f.triggers_stage_id || null,
  });

  const handleAdd = async () => {
    if (!form.name.trim() || !form.display_name.trim()) return;
    await create.mutateAsync(buildInput(form));
    setShowAdd(false);
    setForm(defaultForm(category));
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    await update.mutateAsync({ id: editingId, updates: buildInput(form) });
    setEditingId(null);
  };

  const startEdit = (opt: LabelFinishingOption) => {
    setEditingId(opt.id);
    setShowAdd(false);
    setForm({ name: opt.name, display_name: opt.display_name, category: opt.category, description: opt.description || '', triggers_stage_id: opt.triggers_stage_id || '' });
  };

  const OptionForm = ({ onSave, onCancel, isPending }: { onSave: () => void; onCancel: () => void; isPending: boolean }) => (
    <div className="p-3 border rounded-lg bg-muted/30 space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Internal Key *</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. gloss_lamination" className="h-8 text-sm font-mono" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Display Name *</Label>
          <Input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="e.g. Gloss Lamination" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Triggers Stage</Label>
          <Select value={form.triggers_stage_id || 'none'} onValueChange={v => setForm(f => ({ ...f, triggers_stage_id: v === 'none' ? '' : v }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {(stages || []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={isPending || !form.name.trim() || !form.display_name.trim()}>
          <Check className="h-3.5 w-3.5 mr-1" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10" />)}</div>;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => { setShowAdd(true); setEditingId(null); setForm(defaultForm(category)); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Option
        </Button>
      </div>
      {showAdd && <OptionForm onSave={handleAdd} onCancel={() => setShowAdd(false)} isPending={create.isPending} />}
      {(options || []).length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground text-center py-4">No options configured yet.</p>
      )}
      <div className="space-y-1">
        {(options || []).map(opt => (
          <div key={opt.id}>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
              {opt.triggers_stage && (
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.triggers_stage.color }} />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{opt.display_name}</span>
                {opt.description && <p className="text-xs text-muted-foreground">{opt.description}</p>}
                {opt.triggers_stage && (
                  <p className="text-xs text-muted-foreground">→ triggers: {opt.triggers_stage.name}</p>
                )}
              </div>
              <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[opt.category]}`}>{opt.category.replace('_', ' ')}</Badge>
              <Switch checked={opt.is_active} onCheckedChange={v => update.mutate({ id: opt.id, updates: { is_active: v } })} />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(opt)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete "${opt.display_name}"?`)) remove.mutate(opt.id); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {editingId === opt.id && <OptionForm onSave={handleUpdate} onCancel={() => setEditingId(null)} isPending={update.isPending} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LabelFinishingManagement() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-foreground">Finishing Options</h3>
        <p className="text-xs text-muted-foreground">Configure finishing options that can be applied to label orders. Each option can trigger a production stage.</p>
      </div>
      <Tabs defaultValue="lamination">
        <TabsList>
          {CATEGORIES.map(c => (
            <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>
          ))}
        </TabsList>
        {CATEGORIES.map(c => (
          <TabsContent key={c.value} value={c.value} className="mt-4">
            <FinishingList category={c.value} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
