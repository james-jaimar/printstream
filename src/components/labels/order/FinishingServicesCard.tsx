import { useState } from 'react';
import { Plus, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AddServiceDialog } from './AddServiceDialog';
import { useOrderServices, useRemoveOrderService, type LabelOrderService } from '@/hooks/labels/useLabelOrderServices';
import type { LabelOrderStatus } from '@/types/labels';

interface FinishingServicesCardProps {
  orderId: string;
  orderStatus: LabelOrderStatus;
  outputRollsCount?: number | null;
  qtyPerRoll?: number | null;
}

const SERVICE_ICONS: Record<string, string> = {
  finishing: '✨',
  rewinding: '🔄',
  joining: '🔗',
  handwork: '🖐',
  qa: '✅',
  packaging: '📦',
  delivery: '🚚',
};

const SERVICE_COLORS: Record<string, string> = {
  finishing: 'bg-primary/10 text-primary',
  rewinding: 'bg-accent text-accent-foreground',
  joining: 'bg-accent text-accent-foreground',
  handwork: 'bg-secondary text-secondary-foreground',
  qa: 'bg-primary/10 text-primary',
  packaging: 'bg-secondary text-secondary-foreground',
  delivery: 'bg-muted text-muted-foreground',
};

function ServiceRow({
  service,
  canEdit,
  orderId,
  qtyPerRoll,
}: {
  service: LabelOrderService;
  canEdit: boolean;
  orderId: string;
  qtyPerRoll?: number | null;
}) {
  const remove = useRemoveOrderService();

  const rewindingRollQty = service.service_type === 'rewinding' && service.quantity ? service.quantity : null;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg border bg-card hover:bg-muted/20 transition-colors">
      <span className="text-base shrink-0">{SERVICE_ICONS[service.service_type] || '⚙️'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{service.display_name}</span>
          {service.quantity && (
            <Badge variant="outline" className="text-xs font-normal">
              {service.quantity} {service.quantity_unit || ''}
            </Badge>
          )}
          {rewindingRollQty && qtyPerRoll && (
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              {qtyPerRoll.toLocaleString()} labels/roll
            </Badge>
          )}
        </div>
        {service.notes && <p className="text-xs text-muted-foreground">{service.notes}</p>}
        {service.stage && (
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: service.stage.color }} />
            <span className="text-xs text-muted-foreground">→ {service.stage.name}</span>
          </div>
        )}
      </div>
      <Badge variant="secondary" className={`text-[10px] shrink-0 ${SERVICE_COLORS[service.service_type] || ''}`}>
        {service.service_type}
      </Badge>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => remove.mutate({ id: service.id, orderId })}
          disabled={remove.isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function FinishingServicesCard({ orderId, orderStatus, outputRollsCount, qtyPerRoll }: FinishingServicesCardProps) {
  const { data: services, isLoading } = useOrderServices(orderId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canEdit = orderStatus !== 'completed' && orderStatus !== 'cancelled';

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Finishing &amp; Services
              {(services?.length || 0) > 0 && (
                <Badge variant="secondary" className="text-xs">{services?.length}</Badge>
              )}
            </span>
            {canEdit && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (services?.length || 0) === 0 ? (
            <div className="text-center py-6 border-2 border-dashed rounded-lg">
              <p className="text-xs text-muted-foreground">No finishing or services added yet</p>
              {canEdit && (
                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add first service
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(services || []).map(svc => (
                <ServiceRow key={svc.id} service={svc} canEdit={canEdit} orderId={orderId} qtyPerRoll={qtyPerRoll} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddServiceDialog
        orderId={orderId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        outputRollsCount={outputRollsCount}
      />
    </>
  );
}
