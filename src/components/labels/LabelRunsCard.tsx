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
  Loader2,
  FileDown,
  Download,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RunDetailModal } from '@/components/labels/production';
import { RunLayoutDiagram } from '@/components/labels/optimizer/RunLayoutDiagram';
import { useBatchImpose } from '@/hooks/labels/useBatchImpose';
import { useUpdateRunStatus } from '@/hooks/labels/useLabelRuns';
import type { LabelRun, LabelRunStatus, LabelItem, LabelDieline } from '@/types/labels';
import { LABEL_PRINT_CONSTANTS } from '@/types/labels';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
interface LabelRunsCardProps {
  runs: LabelRun[];
  items: LabelItem[];
  dieline?: LabelDieline | null;
  orderId?: string;
  orderNumber?: string;
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

export function LabelRunsCard({ runs, items, dieline, orderId, orderNumber, onViewRun, onImpositionComplete }: LabelRunsCardProps) {
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

  const updateStatus = useUpdateRunStatus();
  
  const getItemName = (itemId: string) => {
    return items.find(i => i.id === itemId)?.name || 'Unknown';
  };

  // Print Files helpers
  const runsWithPdfs = runs
    .filter(r => r.imposed_pdf_url)
    .sort((a, b) => a.run_number - b.run_number);

  const extractStoragePath = (publicUrl: string): string | null => {
    const marker = '/object/public/label-files/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return publicUrl.substring(idx + marker.length);
  };

  const getCopiesForRun = (run: LabelRun): number => {
    if (!run.slot_assignments || run.slot_assignments.length === 0) return 0;
    const maxQty = Math.max(...run.slot_assignments.map(s => s.quantity_in_slot));
    return Math.ceil(maxQty / (dieline?.columns_across || 1));
  };

  const handleDownloadPdf = async (run: LabelRun) => {
    if (!run.imposed_pdf_url) return;
    const path = extractStoragePath(run.imposed_pdf_url);
    if (!path) {
      toast.error('Could not determine file path');
      return;
    }
    const { data, error } = await supabase.storage
      .from('label-files')
      .createSignedUrl(path, 3600, { download: true });
    if (error || !data?.signedUrl) {
      toast.error('Failed to generate download link');
      return;
    }
    const copies = getCopiesForRun(run);
    const fileName = `Run-${run.run_number}_${orderNumber || 'order'}_${copies}-copies.pdf`;

    // Fetch as blob to force download instead of opening in browser
    try {
      const res = await fetch(data.signedUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback to direct link
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = fileName;
      link.click();
    }
  };

  const handleDownloadAll = async () => {
    for (const run of runsWithPdfs) {
      await handleDownloadPdf(run);
    }
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
    await impose(false);
    onImpositionComplete?.();
  };

  const handleReprocessAll = async () => {
    await impose(true);
    onImpositionComplete?.();
  };

  const handleStartAllPrinting = async () => {
    const approvedRuns = runs.filter(r => r.status === 'approved');
    for (const run of approvedRuns) {
      await updateStatus.mutateAsync({ id: run.id, status: 'printing' });
    }
    toast.success(`Started printing ${approvedRuns.length} runs`);
  };

  const handleCompleteAllRuns = async () => {
    const printingRuns = runs.filter(r => r.status === 'printing');
    for (const run of printingRuns) {
      await updateStatus.mutateAsync({ 
        id: run.id, 
        status: 'completed',
        actual_meters_printed: run.meters_to_print || 0,
      });
    }
    toast.success(`Completed ${printingRuns.length} runs`);
  };

  const completedRuns = runs.filter(r => r.status === 'completed').length;
  const totalMeters = runs.reduce((sum, r) => sum + (r.meters_to_print || 0), 0);
  const totalFrames = runs.reduce((sum, r) => sum + (r.frames_count || 0), 0);

  const hasPlannedRuns = runs.some(r => r.status === 'planned');
  const allApprovedOrBeyond = runs.length > 0 && runs.every(r => r.status !== 'planned');
  const allApproved = runs.length > 0 && runs.every(r => r.status === 'approved');
  const allPrinting = runs.length > 0 && runs.every(r => r.status === 'printing');
  const allCompleted = runs.length > 0 && runs.every(r => r.status === 'completed');
  const canSendToPrint = hasPlannedRuns && !!dieline && !!orderId && !isImposing;
  const canReprocessAll = runs.length > 0 && !!dieline && !!orderId && !isImposing;

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
            {/* Order-level controls */}
            {runs.length > 0 && (
              <>
                {isImposing ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Imposing Run {progress.currentRunNumber} ({progress.current + 1}/{progress.total})...</span>
                  </div>
                ) : allCompleted ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReprocessAll}
                      disabled={!canReprocessAll}
                      className="gap-1"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reprocess All
                    </Button>
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      All Completed
                    </Badge>
                  </div>
                ) : allPrinting ? (
                  <Button
                    size="sm"
                    onClick={handleCompleteAllRuns}
                    disabled={updateStatus.isPending}
                    className="gap-1 bg-green-600 hover:bg-green-700"
                  >
                    {updateStatus.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Complete All Runs
                  </Button>
                ) : allApproved ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReprocessAll}
                      disabled={!canReprocessAll}
                      className="gap-1"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reprocess All
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleStartAllPrinting}
                      disabled={updateStatus.isPending}
                      className="gap-1"
                    >
                      {updateStatus.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Start Printing
                    </Button>
                  </div>
                ) : allApprovedOrBeyond ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReprocessAll}
                      disabled={!canReprocessAll}
                      className="gap-1"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reprocess All
                    </Button>
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      All Imposed
                    </Badge>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {runs.some(r => r.status !== 'planned') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReprocessAll}
                        disabled={!canReprocessAll}
                        className="gap-1"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Reprocess All
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={!canSendToPrint}
                      onClick={handleSendToPrint}
                      className="gap-1"
                    >
                      <Printer className="h-4 w-4" />
                      Send to Print
                    </Button>
                  </div>
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
      <CardContent className="space-y-4">
        {/* Print Files Section */}
        {runsWithPdfs.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-sm">Print Files</span>
                <Badge variant="secondary" className="text-xs">{runsWithPdfs.length} ready</Badge>
              </div>
              {runsWithPdfs.length > 1 && (
                <Button variant="outline" size="sm" className="gap-1" onClick={handleDownloadAll}>
                  <Download className="h-3.5 w-3.5" />
                  Download All
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              {runsWithPdfs.map((run) => {
                const copies = getCopiesForRun(run);
                return (
                  <div
                    key={run.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-medium">Run {run.run_number}</span>
                      {orderNumber && <span className="text-muted-foreground">{orderNumber}</span>}
                      <Badge variant="outline" className="text-xs">{copies} copies</Badge>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={() => handleDownloadPdf(run)}>
                      <FileDown className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
