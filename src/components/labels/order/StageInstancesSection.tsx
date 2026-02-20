import { CheckCircle2, Circle, PlayCircle, PauseCircle, SkipForward, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrderStageInstances, useUpdateStageInstance, type LabelOrderStageInstance, type LabelStageStatus } from '@/hooks/labels/useLabelOrderServices';
import { format } from 'date-fns';

interface StageInstancesSectionProps {
  orderId: string;
}

const STATUS_CONFIG: Record<LabelStageStatus, { label: string; icon: typeof Circle; className: string; badgeClass: string }> = {
  pending:   { label: 'Pending',   icon: Circle,       className: 'text-muted-foreground', badgeClass: 'bg-muted text-muted-foreground' },
  active:    { label: 'Active',    icon: PlayCircle,   className: 'text-primary',          badgeClass: 'bg-primary/10 text-primary' },
  completed: { label: 'Done',      icon: CheckCircle2, className: 'text-primary',          badgeClass: 'bg-primary/20 text-primary' },
  held:      { label: 'On Hold',   icon: PauseCircle,  className: 'text-muted-foreground', badgeClass: 'bg-secondary text-secondary-foreground' },
  skipped:   { label: 'Skipped',   icon: SkipForward,  className: 'text-muted-foreground', badgeClass: 'bg-muted text-muted-foreground' },
};

function StageRow({ instance, orderId }: { instance: LabelOrderStageInstance; orderId: string }) {
  const updateStage = useUpdateStageInstance();
  const config = STATUS_CONFIG[instance.status];
  const StatusIcon = config.icon;

  const handleStart = () => {
    updateStage.mutate({
      id: instance.id,
      orderId,
      updates: { status: 'active', started_at: new Date().toISOString() },
    });
  };

  const handleComplete = () => {
    updateStage.mutate({
      id: instance.id,
      orderId,
      updates: { status: 'completed', completed_at: new Date().toISOString() },
    });
  };

  const handleHold = () => {
    updateStage.mutate({
      id: instance.id,
      orderId,
      updates: { status: instance.status === 'held' ? 'active' : 'held' },
    });
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card">
      <StatusIcon className={`h-5 w-5 shrink-0 ${config.className}`} />
      
      {instance.stage && (
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: instance.stage.color }} />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {instance.stage?.name || `Stage ${instance.stage_order}`}
          </span>
          <Badge variant="outline" className={`text-[10px] px-1.5 ${config.badgeClass}`}>
            {config.label}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          {instance.started_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Started {format(new Date(instance.started_at), 'PPp')}
            </span>
          )}
          {instance.completed_at && (
            <span>Completed {format(new Date(instance.completed_at), 'PPp')}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {instance.status === 'pending' && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleStart}
            disabled={updateStage.isPending}
          >
            Start
          </Button>
        )}
        {instance.status === 'active' && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={handleHold}
              disabled={updateStage.isPending}
            >
              Hold
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleComplete}
              disabled={updateStage.isPending}
            >
              Complete
            </Button>
          </>
        )}
        {instance.status === 'held' && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleHold}
            disabled={updateStage.isPending}
          >
            Resume
          </Button>
        )}
      </div>
    </div>
  );
}

export function StageInstancesSection({ orderId }: StageInstancesSectionProps) {
  const { data: instances, isLoading } = useOrderStageInstances(orderId);

  if (isLoading) return <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>;
  if (!instances?.length) return null;

  const completed = instances.filter(i => i.status === 'completed').length;
  const total = instances.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Post-Print Stages</h3>
          <p className="text-xs text-muted-foreground">{completed} of {total} stages completed</p>
        </div>
        <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        {instances.map(inst => (
          <StageRow key={inst.id} instance={inst} orderId={orderId} />
        ))}
      </div>
    </div>
  );
}
