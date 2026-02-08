import { useState } from 'react';
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
  Image as ImageIcon, 
  FileText, 
  Clock, 
  Package,
  Loader2
} from 'lucide-react';
import { useClientOrder, useOrderApprovals, useSubmitProofApproval } from '@/hooks/labels/useClientPortal';

export default function ClientOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  const { data: order, isLoading } = useClientOrder(orderId);
  const { data: approvals } = useOrderApprovals(orderId);
  const submitApprovalMutation = useSubmitProofApproval();

  const handleApprove = async () => {
    if (!orderId) return;
    await submitApprovalMutation.mutateAsync({
      order_id: orderId,
      action: 'approved',
    });
    setConfirmApproveOpen(false);
  };

  const handleReject = async () => {
    if (!orderId || !rejectComment.trim()) return;
    await submitApprovalMutation.mutateAsync({
      order_id: orderId,
      action: 'rejected',
      comment: rejectComment,
    });
    setRejectDialogOpen(false);
    setRejectComment('');
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

  const canApprove = order.status === 'pending_approval';
  const isApproved = order.status === 'approved' || order.status === 'in_production' || order.status === 'completed';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/labels/portal')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold">{order.order_number}</h1>
            <p className="text-sm text-muted-foreground">{order.customer_name}</p>
          </div>
          {canApprove && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRejectDialogOpen(true)}>
                <XCircle className="h-4 w-4 mr-2" />
                Request Changes
              </Button>
              <Button onClick={() => setConfirmApproveOpen(true)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </div>
          )}
          {isApproved && (
            <Badge variant="default" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Approved
            </Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Items */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Label Items</CardTitle>
                <CardDescription>
                  {order.items?.length || 0} items in this order
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {order.items?.map((item, idx) => (
                    <div key={item.id} className="flex gap-4 p-4 border rounded-lg">
                      <div className="w-20 h-20 bg-muted rounded flex items-center justify-center flex-shrink-0">
                        {item.artwork_thumbnail_url ? (
                          <img 
                            src={item.artwork_thumbnail_url} 
                            alt={item.name}
                            className="w-full h-full object-cover rounded"
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{item.name}</h4>
                          <Badge variant="outline">
                            {item.quantity.toLocaleString()} labels
                          </Badge>
                        </div>
                        {item.width_mm && item.height_mm && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {item.width_mm}mm × {item.height_mm}mm
                          </p>
                        )}
                        {item.artwork_pdf_url && (
                          <a 
                            href={item.artwork_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                          >
                            <FileText className="h-3 w-3" />
                            View Artwork PDF
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Production Runs */}
            {order.runs && order.runs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Production Layout</CardTitle>
                  <CardDescription>
                    Optimized print runs for your order
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {order.runs.map((run, idx) => (
                      <div key={run.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Run {run.run_number}</span>
                          <Badge variant="outline">
                            {run.frames_count} frames · {run.meters_to_print?.toFixed(1)}m
                          </Badge>
                        </div>
                        {run.ai_reasoning && (
                          <p className="text-sm text-muted-foreground">
                            {run.ai_reasoning}
                          </p>
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
          <div className="space-y-6">
            {/* Order Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                <CardHeader>
                  <CardTitle className="text-lg">Approval History</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-3">
                      {approvals.map((approval) => (
                        <div key={approval.id} className="flex gap-3 text-sm">
                          {approval.action === 'approved' ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive mt-0.5" />
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

      {/* Confirm Approve Dialog */}
      <Dialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Proof</DialogTitle>
            <DialogDescription>
              By approving, you confirm that the artwork and layout are correct and authorize production to begin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApproveOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleApprove}
              disabled={submitApprovalMutation.isPending}
            >
              {submitApprovalMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
            <DialogDescription>
              Please describe what changes are needed. Our team will review and update the proof.
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
              onClick={handleReject}
              disabled={submitApprovalMutation.isPending || !rejectComment.trim()}
            >
              {submitApprovalMutation.isPending ? (
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
