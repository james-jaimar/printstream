import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  FileText,
  Loader2,
  CheckCheck,
  Upload,
  Eye,
  Package,
} from 'lucide-react';
import {
  useClientPortalOrder,
  useClientPortalApprovals,
  useClientPortalApproveItems,
  useClientPortalUploadArtwork,
} from '@/hooks/labels/useClientPortalData';
import ClientItemCard from '@/components/labels/portal/ClientItemCard';
import ApprovalDisclaimer from '@/components/labels/portal/ApprovalDisclaimer';

const workflowSteps = [
  { key: 'upload', label: 'Upload', icon: Upload },
  { key: 'review', label: 'Review', icon: Eye },
  { key: 'approve', label: 'Approve', icon: CheckCircle },
  { key: 'production', label: 'Production', icon: Package },
];

function getWorkflowStep(status: string): number {
  switch (status) {
    case 'pending_approval': return 1;
    case 'approved': return 2;
    case 'in_production': return 3;
    case 'completed': return 3;
    default: return 0;
  }
}

function WorkflowStepper({ status }: { status: string }) {
  const current = getWorkflowStep(status);
  return (
    <div className="flex items-center justify-between gap-1 py-4 px-2">
      {workflowSteps.map((step, i) => {
        const isComplete = i < current;
        const isCurrent = i === current;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  isComplete
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'bg-primary/20 text-primary border-2 border-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isComplete ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-medium ${isComplete || isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
            {i < workflowSteps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-5 ${isComplete ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ClientOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectItemIds, setRejectItemIds] = useState<string[]>([]);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [approveItemIds, setApproveItemIds] = useState<string[]>([]);

  const { data: order, isLoading } = useClientPortalOrder(orderId);
  const { data: approvals } = useClientPortalApprovals(orderId);
  const approveItemsMutation = useClientPortalApproveItems();
  const uploadMutation = useClientPortalUploadArtwork();

  const awaitingItems = useMemo(
    () => order?.items?.filter((i) => i.proofing_status === 'awaiting_client') || [],
    [order]
  );

  const allItemsApproved = useMemo(
    () => order?.items?.length && order.items.every((i) => i.proofing_status === 'approved'),
    [order]
  );

  const handleToggleSelect = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedItemIds.length === awaitingItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(awaitingItems.map((i) => i.id));
    }
  };

  const handleApprove = (itemIds: string[]) => {
    setApproveItemIds(itemIds);
    setDisclaimerOpen(true);
  };

  const handleConfirmApproval = async () => {
    if (!orderId || approveItemIds.length === 0) return;
    await approveItemsMutation.mutateAsync({
      order_id: orderId,
      item_ids: approveItemIds,
      action: 'approved',
    });
    setDisclaimerOpen(false);
    setApproveItemIds([]);
    setSelectedItemIds([]);
  };

  const handleReject = (itemIds: string[]) => {
    setRejectItemIds(itemIds);
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!orderId || rejectItemIds.length === 0 || !rejectComment.trim()) return;
    await approveItemsMutation.mutateAsync({
      order_id: orderId,
      item_ids: rejectItemIds,
      action: 'rejected',
      comment: rejectComment,
    });
    setRejectDialogOpen(false);
    setRejectComment('');
    setRejectItemIds([]);
    setSelectedItemIds([]);
  };

  const handleUploadArtwork = async (itemId: string, file: File) => {
    if (!orderId) return;
    await uploadMutation.mutateAsync({ order_id: orderId, item_id: itemId, file });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Order not found</p>
            <Button variant="link" onClick={() => navigate('/labels/portal')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isApproved =
    order.status === 'approved' ||
    order.status === 'in_production' ||
    order.status === 'completed';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/labels/portal')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{order.order_number}</h1>
            <p className="text-xs text-muted-foreground">{order.customer_name}</p>
          </div>
          {isApproved && (
            <Badge variant="default" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Approved
            </Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Workflow Stepper */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <WorkflowStepper status={order.status} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-5">
            {/* All approved banner */}
            {allItemsApproved && (
              <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg p-4">
                <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">All items approved</p>
                  <p className="text-xs text-muted-foreground">
                    Your order has been approved and is moving into production.
                  </p>
                </div>
              </div>
            )}

            {/* Item cards */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Label Items</CardTitle>
                <CardDescription>
                  {order.items?.length || 0} items in this order
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {order.items?.map((item) => (
                    <ClientItemCard
                      key={item.id}
                      item={item as any}
                      selected={selectedItemIds.includes(item.id)}
                      onToggleSelect={handleToggleSelect}
                      onApprove={(id) => handleApprove([id])}
                      onReject={(id) => handleReject([id])}
                      onUploadArtwork={handleUploadArtwork}
                      isUploading={uploadMutation.isPending}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Production Runs */}
            {order.runs && order.runs.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Production Layout</CardTitle>
                  <CardDescription>Optimized print runs for your order</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {order.runs.map((run) => (
                      <div key={run.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Run {run.run_number}</span>
                          <Badge variant="outline">
                            {run.frames_count} frames · {run.meters_to_print?.toFixed(1)}m
                          </Badge>
                        </div>
                        {run.ai_reasoning && (
                          <p className="text-sm text-muted-foreground">{run.ai_reasoning}</p>
                        )}
                        {run.imposed_pdf_with_dielines_url && (
                          <a
                            href={run.imposed_pdf_with_dielines_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                          >
                            <FileText className="h-3 w-3" />
                            View Proof PDF
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Order Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Labels</span>
                  <span className="font-medium">{order.total_label_count.toLocaleString()}</span>
                </div>
                {order.estimated_meters && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estimated Meters</span>
                    <span className="font-medium">{order.estimated_meters.toFixed(1)}m</span>
                  </div>
                )}
                {order.dieline && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Dieline</span>
                    <span className="font-medium">{order.dieline.name}</span>
                  </div>
                )}
                {order.substrate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Substrate</span>
                    <span className="font-medium">{order.substrate.name}</span>
                  </div>
                )}
                {order.due_date && (
                  <>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Due Date</span>
                      <span className="font-medium">
                        {format(new Date(order.due_date), 'dd MMM yyyy')}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Approval History */}
            {approvals && approvals.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Approval History</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-3">
                      {approvals.map((approval: any) => (
                        <div key={approval.id} className="flex gap-3 text-sm">
                          {approval.action === 'approved' ? (
                            <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                          )}
                          <div>
                            <p className="font-medium">
                              {approval.action === 'approved' ? 'Approved' : 'Changes Requested'}
                            </p>
                            {approval.comment && (
                              <p className="text-muted-foreground">{approval.comment}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(approval.created_at), 'dd MMM yyyy HH:mm')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Sticky Approval Toolbar */}
      {awaitingItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t shadow-lg z-20">
          <div className="container mx-auto px-4 py-3 max-w-5xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedItemIds.length === awaitingItems.length ? 'Deselect All' : 'Select All'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {selectedItemIds.length} of {awaitingItems.length} selected
              </span>
            </div>
            {selectedItemIds.length > 0 && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReject(selectedItemIds)}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Request Changes
                </Button>
                <Button size="sm" onClick={() => handleApprove(selectedItemIds)}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  Approve ({selectedItemIds.length})
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Disclaimer Dialog */}
      <ApprovalDisclaimer
        open={disclaimerOpen}
        onOpenChange={setDisclaimerOpen}
        onConfirm={handleConfirmApproval}
        isPending={approveItemsMutation.isPending}
        itemCount={approveItemIds.length}
      />

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
            <DialogDescription>
              Please describe what changes are needed for{' '}
              {rejectItemIds.length} item{rejectItemIds.length !== 1 ? 's' : ''}.
              Our team will review and update the proof.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-comment">Required Changes</Label>
            <Textarea
              id="reject-comment"
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Describe the changes needed..."
              rows={4}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={approveItemsMutation.isPending || !rejectComment.trim()}
            >
              {approveItemsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
