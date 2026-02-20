import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useLabelStages,
  useCreateLabelStage,
  useUpdateLabelStage,
  useDeleteLabelStage,
  type LabelProductionStage,
  type LabelStageGroup,
  type CreateLabelStageInput,
} from '@/hooks/labels/useLabelStages';

const GROUP_LABELS: Record<LabelStageGroup, string> = {
  finishing: 'Finishing',
  services: 'Services',
  qa: 'Quality Assurance',
  packaging: 'Packaging',
  dispatch: 'Dispatch',
};

const GROUP_COLORS: Record<LabelStageGroup, string> = {
  finishing: 'bg-blue-100 text-blue-700',
  services: 'bg-cyan-100 text-cyan-700',
  qa: 'bg-green-100 text-green-700',
  packaging: 'bg-lime-100 text-lime-700',
  dispatch: 'bg-slate-100 text-slate-700',
};

const SPEED_UNITS = ['labels_per_hour', 'meters_per_hour', 'rolls_per_hour'];

interface StageFormState {
  name: string;
  description: string;
  stage_group: LabelStageGroup;
  color: string;
  is_conditional: boolean;
  default_duration_minutes: string;
  speed_per_hour: string;
  speed_unit: string;
}

const defaultForm: StageFormState = {
  name: '',
  description: '',
  stage_group: 'finishing',
  color: '#6B7280',
  is_conditional: false,
  default_duration_minutes: '',
  speed_per_hour: '',
  speed_unit: 'labels_per_hour',
};

export function LabelStageManagement() {
  const { data: stages, isLoading } = useLabelStages();
  const createStage = useCreateLabelStage();
  const updateStage = useUpdateLabelStage();
  const deleteStage = useDeleteLabelStage();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StageFormState>(defaultForm);

  const grouped = (stages || []).reduce((acc, s) => {
    if (!acc[s.stage_group]) acc[s.stage_group] = [];
    acc[s.stage_group].push(s);
    return acc;
  }, {} as Record<string, LabelProductionStage[]>);

  const startEdit = (stage: LabelProductionStage) => {
    setEditingId(stage.id);
    setShowAddForm(false);
    setForm({
      name: stage.name,
      description: stage.description || '',
      stage_group: stage.stage_group,
      color: stage.color,
      is_conditional: stage.is_conditional,
      default_duration_minutes: stage.default_duration_minutes?.toString() || '',
      speed_per_hour: stage.speed_per_hour?.toString() || '',
      speed_unit: stage.speed_unit || 'labels_per_hour',
    });
  };

  const buildInput = (f: StageFormState): CreateLabelStageInput => ({
    name: f.name,
    description: f.description || undefined,
    stage_group: f.stage_group,
    color: f.color,
    is_conditional: f.is_conditional,
    default_duration_minutes: f.default_duration_minutes ? parseInt(f.default_duration_minutes) : undefined,
    speed_per_hour: f.speed_per_hour ? parseFloat(f.speed_per_hour) : undefined,
    speed_unit: f.speed_per_hour ? f.speed_unit : undefined,
  });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createStage.mutateAsync(buildInput(form));
    setShowAddForm(false);
    setForm(defaultForm);
  };

  const handleUpdate = async () => {
    if (!editingId || !form.name.trim()) return;
    await updateStage.mutateAsync({ id: editingId, updates: buildInput(form) });
    setEditingId(null);
  };

  const StageForm = ({ onSave, onCancel, isPending }: { onSave: () => void; onCancel: () => void; isPending: boolean }) => (
    <div className="p-4 border rounded-lg bg-muted/30 space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Stage Name *</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Gloss Lamination" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Group</Label>
          <Select value={form.stage_group} onValueChange={v => setForm(f => ({ ...f, stage_group: v as LabelStageGroup }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(GROUP_LABELS) as [LabelStageGroup, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Color</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-8 w-14 rounded border cursor-pointer" />
            <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-8 text-sm font-mono" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Default Duration (min)</Label>
          <Input value={form.default_duration_minutes} onChange={e => setForm(f => ({ ...f, default_duration_minutes: e.target.value }))} type="number" placeholder="e.g. 30" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Speed per Hour</Label>
          <div className="flex gap-2">
            <Input value={form.speed_per_hour} onChange={e => setForm(f => ({ ...f, speed_per_hour: e.target.value }))} type="number" placeholder="e.g. 500" className="h-8 text-sm flex-1" />
            <Select value={form.speed_unit} onValueChange={v => setForm(f => ({ ...f, speed_unit: v }))}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SPEED_UNITS.map(u => <SelectItem key={u} value={u}>{u.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.is_conditional} onCheckedChange={v => setForm(f => ({ ...f, is_conditional: v }))} />
        <Label className="text-xs">Conditional stage (only created when triggered by a service/spec)</Label>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={isPending || !form.name.trim()}>
          <Check className="h-3.5 w-3.5 mr-1" />
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Production Stages</h3>
          <p className="text-xs text-muted-foreground">Manage label-specific workflow stages. These are isolated from the digital division.</p>
        </div>
        <Button size="sm" onClick={() => { setShowAddForm(true); setEditingId(null); setForm(defaultForm); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Stage
        </Button>
      </div>

      {showAddForm && (
        <StageForm
          onSave={handleAdd}
          onCancel={() => { setShowAddForm(false); setForm(defaultForm); }}
          isPending={createStage.isPending}
        />
      )}

      {(Object.keys(GROUP_LABELS) as LabelStageGroup[]).map(group => {
        const groupStages = grouped[group] || [];
        return (
          <div key={group}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={`text-xs ${GROUP_COLORS[group]}`}>{GROUP_LABELS[group]}</Badge>
              <span className="text-xs text-muted-foreground">{groupStages.length} stage{groupStages.length !== 1 ? 's' : ''}</span>
            </div>
            {groupStages.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-2 py-2">No stages in this group yet.</p>
            ) : (
              <div className="space-y-1">
                {groupStages.map(stage => (
                  <div key={stage.id}>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{stage.name}</span>
                          {stage.is_conditional && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Conditional</Badge>
                          )}
                          {!stage.is_active && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Inactive</Badge>
                          )}
                        </div>
                        {stage.description && <p className="text-xs text-muted-foreground truncate">{stage.description}</p>}
                      </div>
                      {stage.default_duration_minutes && (
                        <span className="text-xs text-muted-foreground shrink-0">{stage.default_duration_minutes}min</span>
                      )}
                      <Switch
                        checked={stage.is_active}
                        onCheckedChange={v => updateStage.mutate({ id: stage.id, updates: { is_active: v } })}
                        className="shrink-0"
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startEdit(stage)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete "${stage.name}"?`)) deleteStage.mutate(stage.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {editingId === stage.id && (
                      <StageForm
                        onSave={handleUpdate}
                        onCancel={() => setEditingId(null)}
                        isPending={updateStage.isPending}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
