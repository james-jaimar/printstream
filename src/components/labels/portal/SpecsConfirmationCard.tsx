import { useState } from 'react';
import { CheckCircle, Flag, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useClientPortalSpecConfirmations, useClientPortalConfirmSpec } from '@/hooks/labels/useClientPortalData';
import type { LabelOrder, LabelOrderSpecConfirmation, SpecConfirmationStatus } from '@/types/labels';

// ─── Spec row data builder ────────────────────────────────────────────────────

interface SpecItem {
  key: string;
  label: string;
  value: string;
  subValue?: string;
}

function buildSpecs(order: LabelOrder): SpecItem[] {
  const specs: SpecItem[] = [];

  // Material
  if (order.substrate?.name) {
    specs.push({ key: 'material', label: 'Material', value: order.substrate.name });
  }

  // Finishing
  const finishingServices = (order.services || []).filter(
    (s) => s.service_type === 'finishing'
  );
  const finishingValue = finishingServices.length > 0
    ? finishingServices.map((s) => s.display_name).join(', ')
    : 'No additional finishing';
  specs.push({ key: 'finishing', label: 'Finishing', value: finishingValue });

  // Core size
  if (order.core_size_mm != null) {
    specs.push({ key: 'core_size', label: 'Core Size', value: `${order.core_size_mm}mm` });
  }

  // Qty per roll
  if (order.qty_per_roll != null) {
    specs.push({ key: 'qty_per_roll', label: 'Qty per Roll', value: `${order.qty_per_roll.toLocaleString()} labels/roll` });
  }

  // Delivery
  if (order.delivery_method) {
    const deliveryLabels: Record<string, string> = {
      collection: 'Collection',
      local_delivery: 'Local Delivery',
      courier: 'Courier',
      postal: 'Postal',
    };
    const deliveryLabel = deliveryLabels[order.delivery_method] || order.delivery_method;
    const address = order.delivery_notes || order.delivery_address;
    specs.push({
      key: 'delivery',
      label: 'Delivery',
      value: deliveryLabel,
      subValue: (order.delivery_method === 'courier' || order.delivery_method === 'local_delivery') && address
        ? address
        : undefined,
    });
  }

  return specs;
}

// ─── Single spec row ──────────────────────────────────────────────────────────

interface SpecRowProps {
  spec: SpecItem;
  confirmation: LabelOrderSpecConfirmation | undefined;
  onConfirm: () => void;
  onFlag: (comment: string) => void;
  isPending: boolean;
}

function SpecRow({ spec, confirmation, onConfirm, onFlag, isPending }: SpecRowProps) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [comment, setComment] = useState(confirmation?.flagged_comment || '');

  const status: SpecConfirmationStatus = confirmation?.status || 'pending';

  const handleConfirm = () => {
    setFlagOpen(false);
    onConfirm();
  };

  const handleFlag = () => {
    if (comment.trim()) onFlag(comment);
  };

  return (
    <div className="py-3 border-b border-slate-100/80 last:border-0">
      <div className="flex items-start gap-3">
        {/* Label */}
        <span className="text-xs text-slate-500 shrink-0 min-w-[90px] pt-0.5">{spec.label}</span>

        {/* Value */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-800">{spec.value}</span>
          {spec.subValue && (
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{spec.subValue}</p>
          )}
          {status === 'flagged' && confirmation?.flagged_comment && !flagOpen && (
            <p className="text-xs text-red-600 mt-1 italic">"{confirmation.flagged_comment}"</p>
          )}
        </div>

        {/* Status / Actions */}
        <div className="shrink-0 flex items-center gap-1.5">
          {status === 'confirmed' ? (
            <Badge className="gap-1 text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
              <CheckCircle className="h-3 w-3" /> Confirmed
            </Badge>
          ) : status === 'flagged' ? (
            <div className="flex items-center gap-1">
              <Badge className="gap-1 text-[10px] bg-red-100 text-red-700 border-red-200">
                <Flag className="h-3 w-3" /> Flagged
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-400"
                onClick={() => setFlagOpen((v) => !v)}
              >
                {flagOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white px-2.5"
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                <span className="ml-1">Confirm</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-red-200 text-red-600 hover:bg-red-50 px-2.5"
                onClick={() => setFlagOpen((v) => !v)}
                disabled={isPending}
              >
                <Flag className="h-3 w-3" />
                <span className="ml-1">Flag</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Inline flag comment textarea */}
      {flagOpen && (
        <div className="mt-2 ml-[102px] space-y-2">
          <Textarea
            className="text-xs min-h-[64px] resize-none bg-white/80 border-red-200 focus-visible:ring-red-300"
            placeholder="Describe the issue — what should it be?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white px-3"
              onClick={handleFlag}
              disabled={!comment.trim() || isPending}
            >
              {isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Submit Flag
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => setFlagOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface SpecsConfirmationCardProps {
  order: LabelOrder;
  orderId: string;
}

export function SpecsConfirmationCard({ order, orderId }: SpecsConfirmationCardProps) {
  const { data: confirmations = [] } = useClientPortalSpecConfirmations(orderId);
  const confirmSpec = useClientPortalConfirmSpec();

  const specs = buildSpecs(order);

  const confirmationMap = new Map<string, LabelOrderSpecConfirmation>(
    confirmations.map((c: LabelOrderSpecConfirmation) => [c.spec_key, c])
  );

  const confirmedCount = specs.filter(
    (s) => confirmationMap.get(s.key)?.status === 'confirmed'
  ).length;
  const flaggedCount = specs.filter(
    (s) => confirmationMap.get(s.key)?.status === 'flagged'
  ).length;
  const pendingCount = specs.length - confirmedCount - flaggedCount;

  const allConfirmed = confirmedCount === specs.length && specs.length > 0;

  const borderClass = allConfirmed
    ? 'border-emerald-300/70'
    : flaggedCount > 0
      ? 'border-red-300/70'
      : 'border-amber-300/70';

  const headerBadge = allConfirmed ? (
    <Badge className="gap-1 text-xs bg-emerald-100 text-emerald-700 border-emerald-200">
      <CheckCircle className="h-3.5 w-3.5" /> All Confirmed
    </Badge>
  ) : flaggedCount > 0 ? (
    <Badge className="gap-1 text-xs bg-red-100 text-red-700 border-red-200">
      <Flag className="h-3.5 w-3.5" /> {flaggedCount} flagged
    </Badge>
  ) : (
    <Badge className="gap-1 text-xs bg-amber-100 text-amber-700 border-amber-200">
      <AlertTriangle className="h-3.5 w-3.5" /> {pendingCount} pending
    </Badge>
  );

  if (specs.length === 0) return null;

  return (
    <div className={`rounded-2xl border-2 ${borderClass} bg-white/70 backdrop-blur shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] overflow-hidden`}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-slate-100/80">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Order Specifications</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Please review and confirm each specification before finalising your artwork approval.
          </p>
        </div>
        {headerBadge}
      </div>

      {/* Spec rows */}
      <div className="px-5 py-1">
        {specs.map((spec) => (
          <SpecRow
            key={spec.key}
            spec={spec}
            confirmation={confirmationMap.get(spec.key)}
            isPending={confirmSpec.isPending}
            onConfirm={() =>
              confirmSpec.mutate({ order_id: orderId, spec_key: spec.key, status: 'confirmed' })
            }
            onFlag={(comment) =>
              confirmSpec.mutate({ order_id: orderId, spec_key: spec.key, status: 'flagged', comment })
            }
          />
        ))}
      </div>
    </div>
  );
}
