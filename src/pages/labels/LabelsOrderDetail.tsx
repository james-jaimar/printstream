import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  Calendar, 
  User, 
  Mail, 
  FileText, 
  Ruler,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Settings,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useLabelOrder } from '@/hooks/labels/useLabelOrders';
import { LabelItemsTable } from '@/components/labels/LabelItemsTable';
import { LabelRunsCard } from '@/components/labels/LabelRunsCard';
import { AddLabelItemDialog } from '@/components/labels/AddLabelItemDialog';
import type { LabelOrderStatus } from '@/types/labels';

const statusConfig: Record<LabelOrderStatus, { 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: typeof Clock;
}> = {
  quote: { label: 'Quote', variant: 'secondary', icon: FileText },
  pending_approval: { label: 'Pending Approval', variant: 'outline', icon: Clock },
  approved: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  in_production: { label: 'In Production', variant: 'default', icon: Settings },
  completed: { label: 'Completed', variant: 'default', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: AlertCircle },
};

export function LabelsOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading, error } = useLabelOrder(orderId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Order Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The order you're looking for doesn't exist or you don't have access to it.
        </p>
        <Button onClick={() => navigate('/labels/orders')}>
          Back to Orders
        </Button>
      </div>
    );
  }

  const status = statusConfig[order.status];
  const StatusIcon = status.icon;
  const items = order.items || [];
  const runs = order.runs || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/labels/orders')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{order.order_number}</h1>
              <Badge variant={status.variant} className="gap-1">
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {order.customer_name}
              {order.quickeasy_wo_no && (
                <span className="ml-2 text-sm">• WO# {order.quickeasy_wo_no}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Generate Proof
          </Button>
          <Button>
            <Sparkles className="h-4 w-4 mr-2" />
            AI Layout
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Customer Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Company:</span>
              <span className="ml-2 font-medium">{order.customer_name}</span>
            </div>
            {order.contact_name && (
              <div>
                <span className="text-muted-foreground">Contact:</span>
                <span className="ml-2">{order.contact_name}</span>
              </div>
            )}
            {order.contact_email && (
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <a href={`mailto:${order.contact_email}`} className="text-primary hover:underline">
                  {order.contact_email}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Print Specs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Print Specifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {order.dieline ? (
              <div>
                <span className="text-muted-foreground">Dieline:</span>
                <span className="ml-2 font-medium">{order.dieline.name}</span>
              </div>
            ) : (
              <div className="text-muted-foreground">No dieline selected</div>
            )}
            {order.roll_width_mm && (
              <div>
                <span className="text-muted-foreground">Roll Width:</span>
                <span className="ml-2 font-mono">{order.roll_width_mm}mm</span>
              </div>
            )}
            {order.substrate && (
              <div>
                <span className="text-muted-foreground">Substrate:</span>
                <span className="ml-2">{order.substrate.name}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Order Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Total Labels:</span>
              <span className="ml-2 font-mono font-medium">
                {order.total_label_count.toLocaleString()}
              </span>
            </div>
            {order.estimated_meters && (
              <div>
                <span className="text-muted-foreground">Est. Meters:</span>
                <span className="ml-2 font-mono">{order.estimated_meters.toFixed(1)}m</span>
              </div>
            )}
            {order.due_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Due:</span>
                <span className="ml-1 font-medium">
                  {format(new Date(order.due_date), 'PPP')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {order.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Label Items */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Label Items</h2>
            <p className="text-sm text-muted-foreground">
              {items.length} artwork{items.length !== 1 ? 's' : ''} in this order
            </p>
          </div>
        <AddLabelItemDialog orderId={order.id} />
      </div>
      <LabelItemsTable items={items} orderId={order.id} />
      </div>

      <Separator />

      {/* Production Runs */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Production</h2>
          <p className="text-sm text-muted-foreground">
            AI-optimized print runs and production schedule
          </p>
        </div>
        <LabelRunsCard runs={runs} items={items} />
      </div>

      {/* Timestamps */}
      <div className="text-xs text-muted-foreground flex items-center gap-4 pt-4">
        <span>Created: {format(new Date(order.created_at), 'PPp')}</span>
        <span>Updated: {format(new Date(order.updated_at), 'PPp')}</span>
        {order.client_approved_at && (
          <span>Approved: {format(new Date(order.client_approved_at), 'PPp')}</span>
        )}
      </div>
    </div>
  );
}
