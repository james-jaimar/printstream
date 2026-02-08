import { 
  Layers, 
  Play, 
  CheckCircle2, 
  Clock, 
  XCircle,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { LabelRun, LabelRunStatus, LabelItem } from '@/types/labels';
import { LABEL_PRINT_CONSTANTS } from '@/types/labels';

interface LabelRunsCardProps {
  runs: LabelRun[];
  items: LabelItem[];
  onViewRun?: (run: LabelRun) => void;
}

const statusConfig: Record<LabelRunStatus, { 
  icon: typeof Clock; 
  label: string; 
  color: string 
}> = {
  planned: { icon: Clock, label: 'Planned', color: 'bg-slate-500' },
  approved: { icon: CheckCircle2, label: 'Approved', color: 'bg-blue-500' },
  printing: { icon: Play, label: 'Printing', color: 'bg-amber-500' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'bg-green-500' },
  cancelled: { icon: XCircle, label: 'Cancelled', color: 'bg-red-500' },
};

export function LabelRunsCard({ runs, items, onViewRun }: LabelRunsCardProps) {
  const getItemName = (itemId: string) => {
    return items.find(i => i.id === itemId)?.name || 'Unknown';
  };

  const completedRuns = runs.filter(r => r.status === 'completed').length;
  const totalMeters = runs.reduce((sum, r) => sum + (r.meters_to_print || 0), 0);
  const totalFrames = runs.reduce((sum, r) => sum + (r.frames_count || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Production Runs
            </CardTitle>
            <CardDescription>
              {runs.length} runs planned • {totalMeters.toFixed(1)}m total • {totalFrames} frames
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{completedRuns}/{runs.length}</div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </div>
        </div>
        {runs.length > 0 && (
          <Progress value={(completedRuns / runs.length) * 100} className="h-2" />
        )}
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No production runs created yet</p>
            <p className="text-sm">Use the AI Layout Engine to optimize print runs</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => {
              const status = statusConfig[run.status];
              const StatusIcon = status.icon;
              const slotCount = run.slot_assignments?.length || 0;

              return (
                <div
                  key={run.id}
                  className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => onViewRun?.(run)}
                >
                  <div className={`w-2 h-12 rounded-full ${status.color}`} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">Run {run.run_number}</span>
                      <Badge variant="outline" className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                      {run.ai_optimization_score && (
                        <Badge variant="secondary">
                          AI Score: {run.ai_optimization_score}%
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{slotCount} slots used</span>
                      <span>{run.meters_to_print?.toFixed(1) || '—'}m</span>
                      <span>{run.frames_count || '—'} frames</span>
                      {run.estimated_duration_minutes && (
                        <span>~{run.estimated_duration_minutes} min</span>
                      )}
                    </div>
                    {run.slot_assignments && run.slot_assignments.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {run.slot_assignments.slice(0, 6).map((slot, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            S{slot.slot}: {getItemName(slot.item_id).slice(0, 15)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
