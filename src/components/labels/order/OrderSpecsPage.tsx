/**
 * OrderSpecsPage — Page 1 of the Label Order Modal
 *
 * Shows all customer/order specs and finishing configuration.
 * This is also the client-facing summary page in the portal.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Building2,
  Mail,
  Phone,
  Calendar,
  Ruler,
  Layers,
  Scissors,
  Package,
  Truck,
  FileText,
  AlertTriangle,
  AlertCircle,
  Info,
  Gauge,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateLabelOrder } from '@/hooks/labels/useLabelOrders';
import { OrientationPicker, getOrientationLabel, getOrientationSvg } from '@/components/labels/OrientationPicker';
import { FinishingServicesCard } from './FinishingServicesCard';
import { AddServiceDialog } from './AddServiceDialog';
import type { LabelOrder, LabelOrderStatus, LabelInkConfig } from '@/types/labels';
import { INK_CONFIG_LABELS, INK_CONFIG_SPEEDS, LABEL_FINISHING_CONSTANTS } from '@/types/labels';
import { toast } from 'sonner';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: LabelOrderStatus; label: string }[] = [
  { value: 'quote', label: 'Quote' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_production', label: 'In Production' },
  { value: 'changes_requested', label: 'Changes Requested' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS: Record<LabelOrderStatus, string> = {
  quote: 'bg-muted text-muted-foreground border-border',
  pending_approval: 'bg-amber-500/10 text-amber-700 border-amber-300',
  changes_requested: 'bg-orange-500/10 text-orange-700 border-orange-300',
  approved: 'bg-emerald-500/10 text-emerald-700 border-emerald-300',
  in_production: 'bg-blue-500/10 text-blue-700 border-blue-300',
  completed: 'bg-primary/10 text-primary border-primary/30',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/30',
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 pb-3 border-b border-border/60">
      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div>
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</h3>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Spec row ─────────────────────────────────────────────────────────────────

function SpecRow({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-start justify-between gap-3 py-1.5 ${className}`}>
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5 min-w-[90px]">{label}</span>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface OrderSpecsPageProps {
  order: LabelOrder;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OrderSpecsPage({ order }: OrderSpecsPageProps) {
  const updateOrder = useUpdateLabelOrder();
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesValue, setNotesValue] = useState(order.notes ?? '');
  const [referenceValue, setReferenceValue] = useState((order as any).reference ?? '');
  const [poNumberValue, setPoNumberValue] = useState((order as any).po_number ?? '');

  const canEdit = order.status !== 'completed' && order.status !== 'cancelled';

  // ABG machine calculations
  const columnsAcross = order.dieline?.columns_across ?? 1;
  const runCount = order.runs?.length || 1;
  const outputRolls = columnsAcross * runCount;
  const totalLabels = order.total_label_count;
  const labelsPerRoll = outputRolls > 0 ? Math.round(totalLabels / outputRolls) : null;
  const { SHORT_ROLL_DANGER_THRESHOLD, SHORT_ROLL_WARNING_THRESHOLD } = LABEL_FINISHING_CONSTANTS;
  const rollWarning =
    labelsPerRoll !== null
      ? labelsPerRoll < SHORT_ROLL_DANGER_THRESHOLD
        ? 'danger'
        : labelsPerRoll < SHORT_ROLL_WARNING_THRESHOLD
          ? 'warning'
          : null
      : null;

  const abgSpeed = order.abg_speed_m_per_min ?? LABEL_FINISHING_CONSTANTS.ABG_MACHINE_SPEED_M_PER_MIN;

  const handleNotesBlur = () => {
    if (notesValue !== (order.notes ?? '')) {
      updateOrder.mutate({ id: order.id, updates: { notes: notesValue || null } as any });
    }
    setNotesEditing(false);
  };

  return (
    <div className="p-6 space-y-5">

      {/* ═══ ROW 1: Customer + Print Specifications ════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Customer & Order Card ───────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-4 space-y-4">
            <SectionHeader icon={Building2} title="Customer & Order" />

            {/* Customer name + status */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-bold text-foreground leading-tight">{order.customer_name}</p>
                {order.contact_name && (
                  <p className="text-sm text-muted-foreground mt-0.5">{order.contact_name}</p>
                )}
                {order.contact_email && (
                  <a
                    href={`mailto:${order.contact_email}`}
                    className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    <Mail className="h-3 w-3" />
                    {order.contact_email}
                  </a>
                )}
              </div>
              {/* Inline status select */}
              <Select
                value={order.status}
                onValueChange={(val) =>
                  updateOrder.mutate({ id: order.id, updates: { status: val as LabelOrderStatus } })
                }
              >
                <SelectTrigger className={`h-7 text-xs border px-2 min-w-[130px] ${STATUS_COLORS[order.status]}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="divide-y divide-border/50">
              {order.quickeasy_wo_no && (
                <SpecRow label="WO Number">
                  <Badge variant="outline" className="text-xs font-mono">
                    {order.quickeasy_wo_no}
                  </Badge>
                </SpecRow>
              )}
              {/* Reference */}
              <SpecRow label="Reference">
                <Input
                  className="h-7 text-xs text-right max-w-[160px] ml-auto"
                  placeholder="e.g. ABC-123"
                  value={referenceValue}
                  onChange={(e) => setReferenceValue(e.target.value)}
                  onBlur={() => {
                    if (referenceValue !== ((order as any).reference ?? '')) {
                      updateOrder.mutate({ id: order.id, updates: { reference: referenceValue || null } as any });
                    }
                  }}
                />
              </SpecRow>
              {/* PO Number */}
              <SpecRow label="PO Number">
                <Input
                  className="h-7 text-xs text-right max-w-[160px] ml-auto"
                  placeholder="e.g. PO-9876"
                  value={poNumberValue}
                  onChange={(e) => setPoNumberValue(e.target.value)}
                  onBlur={() => {
                    if (poNumberValue !== ((order as any).po_number ?? '')) {
                      updateOrder.mutate({ id: order.id, updates: { po_number: poNumberValue || null } as any });
                    }
                  }}
                />
              </SpecRow>
              {order.due_date && (
                <SpecRow label="Due Date">
                  <span className="flex items-center justify-end gap-1 text-xs font-medium">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    {format(new Date(order.due_date), 'dd MMM yyyy')}
                  </span>
                </SpecRow>
              )}
              <SpecRow label="Total Labels">
                <span className="text-sm font-mono font-semibold">{order.total_label_count.toLocaleString()}</span>
              </SpecRow>
              {order.estimated_meters && (
                <SpecRow label="Est. Meters">
                  <span className="text-xs font-mono">{order.estimated_meters.toFixed(1)} m</span>
                </SpecRow>
              )}
            </div>
          </div>
        </div>

        {/* ── Print Specifications Card ───────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Teal accent bar */}
          <div className="h-1 bg-gradient-to-r from-primary to-primary/50" />
          <div className="px-5 pt-4 pb-5 space-y-4">
            <SectionHeader icon={Ruler} title="Print Specifications" subtitle="Dieline · Substrate · Press" />

            {/* Dieline */}
            {order.dieline ? (
              <div className="bg-muted/40 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{order.dieline.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {order.dieline.label_width_mm} × {order.dieline.label_height_mm} mm
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {order.dieline.columns_across} across × {order.dieline.rows_around} around
                    </Badge>
                    <p className="text-[10px] text-muted-foreground">on {order.dieline.roll_width_mm}mm roll</p>
                  </div>
                </div>
                {/* Die metadata */}
                {(order.dieline.die_no || order.dieline.rpl || order.dieline.die_type) && (
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/50">
                    {order.dieline.die_no && (
                      <span className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 font-mono">
                        Die {order.dieline.die_no}
                      </span>
                    )}
                    {order.dieline.rpl && (
                      <span className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 font-mono">
                        RPL {order.dieline.rpl}
                      </span>
                    )}
                    {order.dieline.die_type && (
                      <span className="text-[10px] text-muted-foreground">{order.dieline.die_type}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground text-center">
                No dieline selected
              </div>
            )}

            <div className="divide-y divide-border/50">
              {/* Substrate */}
              {order.substrate && (
                <div className="py-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Substrate</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium">{order.substrate.name}</span>
                    <Badge variant="outline" className="text-[10px]">{order.substrate.width_mm}mm</Badge>
                    {order.substrate.finish && (
                      <Badge variant="outline" className="text-[10px]">{order.substrate.finish}</Badge>
                    )}
                    {order.substrate.glue_type && (
                      <Badge variant="outline" className="text-[10px]">{order.substrate.glue_type}</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Ink Config — editable */}
              <div className="py-2 space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ink Configuration</p>
                <Select
                  value={order.ink_config || 'CMYK'}
                  onValueChange={(val) =>
                    updateOrder.mutate({ id: order.id, updates: { ink_config: val as LabelInkConfig } })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(INK_CONFIG_LABELS) as LabelInkConfig[]).map((key) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {INK_CONFIG_LABELS[key]}
                        <span className="text-muted-foreground ml-1">— {INK_CONFIG_SPEEDS[key]} m/min</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Orientation */}
              <div className="py-2 space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Label Orientation (Rewind)</p>
                <div className="flex items-center gap-3">
                  <img
                    src={getOrientationSvg(order.orientation ?? 1)}
                    alt="Orientation diagram"
                    className="h-10 w-10 object-contain shrink-0"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-medium">{getOrientationLabel(order.orientation ?? 1)}</p>
                    <div className="mt-0.5">
                      {order.orientation_confirmed ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                          ✓ Client confirmed
                        </Badge>
                      ) : order.status !== 'quote' ? (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                          Awaiting confirmation
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {order.status === 'quote' && (
                    <OrientationPicker
                      value={order.orientation ?? 1}
                      onChange={(v) => updateOrder.mutate({ id: order.id, updates: { orientation: v } as any })}
                      size="sm"
                    />
                  )}
                  {order.orientation_confirmed && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Reset client confirmation"
                      onClick={() => {
                        updateOrder.mutate({ id: order.id, updates: { orientation_confirmed: false } as any });
                        toast.info('Orientation reset — client must re-confirm');
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ROW 2: Die Cutting & Finishing (ABG Machine) — full width ═══════ */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Amber/orange accent bar for finishing */}
        <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-400" />
        <div className="px-5 pt-4 pb-5 space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeader
              icon={Scissors}
              title="Die Cutting & Finishing"
              subtitle="ABG Machine — inline lamination, die cut & slit"
            />
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                onClick={() => setAddServiceOpen(true)}
              >
                + Add Service
              </Button>
            )}
          </div>

          {/* ABG Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Output Rolls */}
            <div className="bg-muted/40 rounded-lg p-3 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Output Rolls</p>
              <p className="text-2xl font-bold font-mono text-foreground">{outputRolls}</p>
              <p className="text-[10px] text-muted-foreground">
                {columnsAcross} across × {runCount} run{runCount !== 1 ? 's' : ''}
              </p>
            </div>

            {/* ABG Speed */}
            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Gauge className="h-3 w-3" /> ABG Speed
              </p>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  className="h-7 text-xs flex-1"
                  defaultValue={abgSpeed}
                  onBlur={(e) => {
                    const val = e.target.value
                      ? parseInt(e.target.value)
                      : LABEL_FINISHING_CONSTANTS.ABG_MACHINE_SPEED_M_PER_MIN;
                    updateOrder.mutate({ id: order.id, updates: { abg_speed_m_per_min: val } as any });
                  }}
                />
                <span className="text-[10px] text-muted-foreground shrink-0">m/min</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Default: 30 m/min</p>
            </div>
          </div>

          {/* Warning banner */}
          {rollWarning && (
            <div className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm ${
              rollWarning === 'danger'
                ? 'bg-destructive/10 border border-destructive/30 text-destructive'
                : 'bg-amber-500/10 border border-amber-300/50 text-amber-700'
            }`}>
              {rollWarning === 'danger' ? (
                <AlertCircle className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span className="text-xs font-medium">
                {rollWarning === 'danger'
                  ? `Only ${labelsPerRoll} labels/roll — rewinding and joining are required. Consider combining with other jobs.`
                  : `${labelsPerRoll} labels/roll — short rolls detected. Consider joining services.`}
              </span>
            </div>
          )}

          {/* Services — embedded */}
          <div className="border-t border-border/50 pt-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Services on this order</p>
            <FinishingServicesCard
              orderId={order.id}
              orderStatus={order.status}
              outputRollsCount={outputRolls}
              qtyPerRoll={order.qty_per_roll}
              embedded
            />
          </div>
        </div>
      </div>

      {/* ═══ ROW 3: Delivery & Output Specs + Notes ════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Delivery & Output Specs ─────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-5 space-y-4">
            <SectionHeader icon={Package} title="Output & Delivery Specs" />

            <div className="grid grid-cols-2 gap-3">
              {/* Core Size */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Core Size</label>
                <Select
                  value={order.core_size_mm ? String(order.core_size_mm) : 'none'}
                  onValueChange={(v) =>
                    updateOrder.mutate({
                      id: order.id,
                      updates: { core_size_mm: v === 'none' ? null : parseInt(v) } as any,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {[25, 38, 40, 76].map((s) => (
                      <SelectItem key={s} value={String(s)} className="text-xs">
                        {s}mm core
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Qty per Roll */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Qty per Roll</label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder="e.g. 1000"
                  defaultValue={order.qty_per_roll ?? ''}
                  onBlur={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    updateOrder.mutate({ id: order.id, updates: { qty_per_roll: val } as any });
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Delivery</label>
                <Select
                  value={order.delivery_method ?? 'none'}
                  onValueChange={(v) =>
                    updateOrder.mutate({
                      id: order.id,
                      updates: { delivery_method: v === 'none' ? null : v } as any,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="collection">Collection</SelectItem>
                    <SelectItem value="local_delivery">Local Delivery</SelectItem>
                    <SelectItem value="courier">Courier</SelectItem>
                    <SelectItem value="postal">Postal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Delivery address / notes */}
            {(order.delivery_method === 'courier' || order.delivery_method === 'local_delivery') && (
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Delivery Address / Notes</label>
                <Textarea
                  className="text-xs min-h-[60px] resize-none"
                  placeholder="Address or delivery instructions..."
                  defaultValue={order.delivery_notes ?? order.delivery_address ?? ''}
                  onBlur={(e) =>
                    updateOrder.mutate({
                      id: order.id,
                      updates: { delivery_notes: e.target.value || null } as any,
                    })
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Notes Card ──────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-5 space-y-4 h-full flex flex-col">
            <SectionHeader icon={FileText} title="Order Notes" subtitle="Visible to client in the portal" />
            <div className="flex-1">
              <Textarea
                className="text-xs resize-none w-full h-full min-h-[120px]"
                placeholder="Special instructions, client requirements, handling notes..."
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                onBlur={handleNotesBlur}
              />
            </div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Notes are saved automatically on blur
            </p>
          </div>
        </div>
      </div>

      {/* Add Service Dialog (standalone, triggered from the finishing card header) */}
      <AddServiceDialog
        orderId={order.id}
        open={addServiceOpen}
        onOpenChange={setAddServiceOpen}
        outputRollsCount={outputRolls}
      />
    </div>
  );
}
