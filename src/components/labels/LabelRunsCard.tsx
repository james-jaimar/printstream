import { useState } from 'react';
import { 
  Layers, 
  Play, 
  CheckCircle2, 
  Clock, 
  XCircle,
  ChevronRight,
  LayoutGrid,
  Printer,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RunDetailModal } from '@/components/labels/production';
import { RunLayoutDiagram } from '@/components/labels/optimizer/RunLayoutDiagram';
import { useBatchImpose } from '@/hooks/labels/useBatchImpose';
import type { LabelRun, LabelRunStatus, LabelItem, LabelDieline } from '@/types/labels';
import { LABEL_PRINT_CONSTANTS } from '@/types/labels';

interface LabelRunsCardProps {
  runs: LabelRun[];
  items: LabelItem[];
  dieline?: LabelDieline | null;
  orderId?: string;
  onViewRun?: (run: LabelRun) => void;
  onImpositionComplete?: () => void;
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

export function LabelRunsCard({ runs, items, dieline, orderId, onViewRun, onImpositionComplete }: LabelRunsCardProps) {
  const [selectedRun, setSelectedRun] = useState<LabelRun | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [layoutPreviewOpen, setLayoutPreviewOpen] = useState(false);
  const [layoutPreviewRun, setLayoutPreviewRun] = useState<LabelRun | null>(null);

  const { impose, isImposing, progress } = useBatchImpose(
    orderId || '',
    runs,
    items,
    dieline
  );
  
  const getItemName = (itemId: string) => {
    return items.find(i => i.id === itemId)?.name || 'Unknown';
  };

  const handleRunClick = (run: LabelRun) => {
    setSelectedRun(run);
    setDetailModalOpen(true);
    onViewRun?.(run);
  };

  const handleViewLayout = (run: LabelRun, e: React.MouseEvent) => {
    e.stopPropagation();
    setLayoutPreviewRun(run);
    setLayoutPreviewOpen(true);
  };

  const handleSendToPrint = async () => {
    await impose();
    onImpositionComplete?.();
  };

  const completedRuns = runs.filter(r => r.status === 'completed').length;
  const totalMeters = runs.reduce((sum, r) => sum + (r.meters_to_print || 0), 0);
  const totalFrames = runs.reduce((sum, r) => sum + (r.frames_count || 0), 0);

  const hasPlannedRuns = runs.some(r => r.status === 'planned');
  const allApprovedOrBeyond = runs.length > 0 && runs.every(r => r.status !== 'planned');
  const canSendToPrint = hasPlannedRuns && !!dieline && !!orderId && !isImposing;

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
          <div className="flex items-center gap-3">
            {/* Send to Print / Status */}
            {runs.length > 0 && (
              <>
                {isImposing ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Imposing Run {progress.currentRunNumber} ({progress.current + 1}/{progress.total})...</span>
                  </div>
                ) : allApprovedOrBeyond ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    All Imposed
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    disabled={!canSendToPrint}
                    onClick={handleSendToPrint}
                    className="gap-1"
                  >
                    <Printer className="h-4 w-4" />
                    Send to Print
                  </Button>
                )}
              </>
            )}
            <div className="text-right">
              <div className="text-2xl font-bold">{completedRuns}/{runs.length}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
          </div>
        </div>
        {isImposing && (
          <Progress value={((progress.current) / progress.total) * 100} className="h-2" />
        )}
        {!isImposing && runs.length > 0 && (
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
                  onClick={() => handleRunClick(run)}
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

                  {/* View Layout Button */}
                  {dieline && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={(e) => handleViewLayout(run, e)}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      <span className="hidden sm:inline">Layout</span>
                    </Button>
                  )}

                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Run Detail Modal */}
      <RunDetailModal
        run={selectedRun}
        items={items}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />

      {/* Layout Preview Dialog */}
      {dieline && (
        <Dialog open={layoutPreviewOpen} onOpenChange={setLayoutPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Run {layoutPreviewRun?.run_number} - Layout Diagram</DialogTitle>
              <DialogDescription>
                Visual representation of label arrangement on the press roll
              </DialogDescription>
            </DialogHeader>
            {layoutPreviewRun && (
              <RunLayoutDiagram
                runNumber={layoutPreviewRun.run_number}
                status={layoutPreviewRun.status}
                slotAssignments={layoutPreviewRun.slot_assignments || []}
                dieline={dieline}
                items={items}
                meters={layoutPreviewRun.meters_to_print}
                frames={layoutPreviewRun.frames_count}
                estimatedMinutes={layoutPreviewRun.estimated_duration_minutes}
                aiScore={layoutPreviewRun.ai_optimization_score}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
