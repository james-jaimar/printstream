import { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
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
  Loader2,
  CheckCheck,
  Upload,
  Eye,
  Package,
  FileUp,
  User,
  LogOut,
} from 'lucide-react';
import {
  useClientPortalOrder,
  useClientPortalApprovals,
  useClientPortalApproveItems,
  useClientPortalUploadArtwork,
} from '@/hooks/labels/useClientPortalData';
import ClientItemCard from '@/components/labels/portal/ClientItemCard';
import ApprovalDisclaimer from '@/components/labels/portal/ApprovalDisclaimer';
import impressLogo from '@/assets/impress-logo-colour.png';

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
    <div className="flex items-center justify-between gap-1 py-6 px-4">
      {workflowSteps.map((step, i) => {
        const isComplete = i < current;
        const isCurrent = i === current;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  isComplete
                    ? 'bg-[#00B8D4] text-white'
                    : isCurrent
                      ? 'text-[#00B8D4] border-2 border-[#00B8D4]/30 bg-white shadow-sm'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isComplete ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span className={`text-xs font-medium ${isComplete || isCurrent ? 'text-slate-900' : 'text-slate-400'}`}>
                {step.label}
              </span>
            </div>
            {i < workflowSteps.length - 1 && (
              <div
                className={`flex-1 h-[2px] mx-2 mb-6 rounded-full ${isComplete ? 'bg-[#00B8D4]' : 'bg-gradient-to-r from-slate-200 to-slate-100'}`}
              />
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

  // All state declarations
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectItemIds, setRejectItemIds] = useState<string[]>([]);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [approveItemIds, setApproveItemIds] = useState<string[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadTargetItemId, setUploadTargetItemId] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const { data: order, isLoading } = useClientPortalOrder(orderId);
  const { data: approvals } = useClientPortalApprovals(orderId);
  const approveItemsMutation = useClientPortalApproveItems();
  const uploadMutation = useClientPortalUploadArtwork();

  // Filter out parent/original PDF items (multi-page parents that were split)
  const visibleItems = useMemo(
    () => (order?.items || []).filter(
      (item) => !(item.page_count > 1 && !item.parent_item_id)
    ),
    [order]
  );

  const awaitingItems = useMemo(
    () => visibleItems.filter((i) => i.proofing_status === 'awaiting_client'),
    [visibleItems]
  );

  const allItemsApproved = useMemo(
    () => visibleItems.length > 0 && visibleItems.every((i) => i.proofing_status === 'approved'),
    [visibleItems]
  );

  // All handler functions
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
    try {
      await approveItemsMutation.mutateAsync({
        order_id: orderId,
        item_ids: approveItemIds,
        action: 'approved',
      });
      setDisclaimerOpen(false);
      setApproveItemIds([]);
      setSelectedItemIds([]);
    } catch (error) {
      console.error('Approval error:', error);
    }
  };

  const handleReject = (itemIds: string[]) => {
    setRejectItemIds(itemIds);
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!orderId || rejectItemIds.length === 0 || !rejectComment.trim()) return;
    try {
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
    } catch (error) {
      console.error('Reject error:', error);
    }
  };

  const handleUploadArtwork = async (itemId: string, file: File) => {
    if (!orderId) return;
    await uploadMutation.mutateAsync({ order_id: orderId, item_id: itemId, file });
  };

  const handleOrderUpload = async () => {
    if (!orderId || !uploadTargetItemId || !uploadFile) return;
    try {
      await uploadMutation.mutateAsync({
        order_id: orderId,
        item_id: uploadTargetItemId,
        file: uploadFile,
      });
      setUploadDialogOpen(false);
      setUploadTargetItemId('');
      setUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(1100px_520px_at_50%_-140px,rgba(0,184,212,0.18),transparent_60%),linear-gradient(to_bottom,rgba(248,250,252,1),rgba(241,245,249,1))]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00B8D4]" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(1100px_520px_at_50%_-140px,rgba(0,184,212,0.18),transparent_60%),linear-gradient(to_bottom,rgba(248,250,252,1),rgba(241,245,249,1))]">
        <Card className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Order not found</p>
            <Button variant="link" className="text-[#00B8D4]" onClick={() => navigate('/labels/portal')}>
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
    <div className="min-h-screen bg-[radial-gradient(1100px_520px_at_50%_-140px,rgba(0,184,212,0.18),transparent_60%),linear-gradient(to_bottom,rgba(248,250,252,1),rgba(241,245,249,1))]">
      {/* Branded Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#00B8D4] to-[#0097A7]" />
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/labels/portal')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <img src={impressLogo} alt="Impress" className="h-9 object-contain hidden sm:block" />
          <div className="hidden sm:block h-7 w-px bg-slate-200" />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-sm leading-tight text-slate-900 truncate">{order.order_number}</h1>
            <p className="text-[11px] text-slate-500 leading-tight">{order.customer_name}</p>
          </div>
          {order.status === 'pending_approval' && (
            <Button size="sm" className="bg-[#00B8D4] hover:bg-[#0097A7] text-white" onClick={() => setUploadDialogOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload Artwork
            </Button>
          )}
          {isApproved && (
            <Badge className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200">
              <CheckCircle className="h-3 w-3" />
              Approved
            </Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Workflow Stepper */}
        <Card className="mb-6 rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
          <CardContent className="p-2">
            <WorkflowStepper status={order.status} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-5">
            {/* All approved banner */}
            {allItemsApproved && (
              <div className="flex items-center gap-3 rounded-2xl p-4 border border-emerald-200/70 bg-emerald-50/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                <div>
                  <p className="font-medium text-sm">All items approved</p>
                  <p className="text-xs text-muted-foreground">
                    Your order has been approved and is moving into production.
                  </p>
                </div>
              </div>
            )}

            {/* Item cards */}
            <Card className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Label Items</CardTitle>
                <CardDescription>
                  {visibleItems.length} items in this order
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Select All checkbox */}
                {awaitingItems.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50/70 rounded-xl border border-slate-200/50">
                    <Checkbox
                      checked={selectedItemIds.length === awaitingItems.length && awaitingItems.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                    <span className="text-sm font-medium">
                      Select All ({awaitingItems.length} awaiting review)
                    </span>
                  </div>
                )}
                <div className="space-y-3">
                  {visibleItems.map((item) => (
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
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Order Summary */}
            <Card className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
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
              <Card className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Approval History</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-3">
                      {approvals.map((approval: any) => (
                        <div key={approval.id} className="flex gap-3 text-sm">
                          {approval.action === 'approved' ? (
                            <CheckCircle className="h-4 w-4 text-[#00B8D4] mt-0.5 flex-shrink-0" />
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
        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200/70 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] z-20 bg-white/90 backdrop-blur-lg">
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
                <Button size="sm" className="bg-[#00B8D4] hover:bg-[#0097A7] text-white" onClick={() => handleApprove(selectedItemIds)}>
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
        <DialogContent className="rounded-2xl">
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

      {/* Upload Artwork Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
        setUploadDialogOpen(open);
        if (!open) {
          setUploadTargetItemId('');
          setUploadFile(null);
          if (uploadInputRef.current) uploadInputRef.current.value = '';
        }
      }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Upload New Artwork</DialogTitle>
            <DialogDescription>
              Select which item to replace artwork for, then upload a PDF file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="upload-item">Select Item</Label>
              <select
                id="upload-item"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00B8D4]/30 focus:border-[#00B8D4]"
                value={uploadTargetItemId}
                onChange={(e) => setUploadTargetItemId(e.target.value)}
              >
                <option value="">Choose an item...</option>
                {visibleItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} (Page {item.item_number})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="upload-file">PDF File</Label>
              <input
                ref={uploadInputRef}
                id="upload-file"
                type="file"
                accept=".pdf"
                className="mt-2 w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-[#00B8D4]/10 file:text-[#00B8D4] hover:file:bg-[#00B8D4]/20"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
            {uploadFile && (
              <p className="text-xs text-muted-foreground">
                Selected: {uploadFile.name}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#00B8D4] hover:bg-[#0097A7] text-white"
              onClick={handleOrderUpload}
              disabled={!uploadTargetItemId || !uploadFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4 mr-2" />
              )}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
