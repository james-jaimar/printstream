/**
 * Order Detail Modal for Schedule Board
 * Shows full order info when clicking a card
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Clock, Ruler, Layers, Package } from 'lucide-react';
import { getSubstrateColor } from '@/hooks/labels/useLabelSchedule';
import type { ScheduledOrderGroup, UnscheduledOrderGroup } from '@/hooks/labels/useLabelSchedule';

type OrderDetail = ScheduledOrderGroup | UnscheduledOrderGroup;

interface ScheduleOrderDetailModalProps {
  order: OrderDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isScheduled(order: OrderDetail): order is ScheduledOrderGroup {
  return 'scheduled_date' in order;
}

export function ScheduleOrderDetailModal({ order, open, onOpenChange }: ScheduleOrderDetailModalProps) {
  if (!order) return null;

  const hours = Math.floor(order.total_duration_minutes / 60);
  const mins = order.total_duration_minutes % 60;
  const colorClass = getSubstrateColor(order.substrate_type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {order.order_number}
            {isScheduled(order) && (
              <Badge variant="outline" className="text-xs">
                {order.status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div>
            <p className="text-sm font-medium">{order.customer_name}</p>
            {isScheduled(order) && (
              <p className="text-xs text-muted-foreground">Scheduled: {order.scheduled_date}</p>
            )}
          </div>

          <Separator />

          {/* Material */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Material</p>
            <div className="flex flex-wrap gap-1.5">
              {order.substrate_type && (
                <Badge className={colorClass} variant="outline">
                  {order.substrate_type}
                </Badge>
              )}
              {order.glue_type && (
                <Badge variant="outline" className="text-xs">
                  {order.glue_type}
                </Badge>
              )}
              {order.substrate_width_mm && (
                <Badge variant="outline" className="text-xs">
                  {order.substrate_width_mm}mm
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Aggregated Metrics */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Production Metrics</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5 text-sm">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span>{order.run_count} run{order.run_count !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{hours > 0 ? `${hours}h ` : ''}{mins}m</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span>{order.total_meters.toFixed(1)}m</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span>{order.total_frames} frames</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Individual Runs */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Runs</p>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {order.runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/50">
                  <span className="font-medium">Run {run.run_number}</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    {run.meters_to_print && <span>{run.meters_to_print.toFixed(1)}m</span>}
                    {run.frames_count && <span>{run.frames_count}f</span>}
                    {run.estimated_duration_minutes && <span>{run.estimated_duration_minutes}m</span>}
                    <Badge variant="outline" className="text-[10px]">{run.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
