import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import {
  Package,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  LogOut,
  User,
  Upload,
  ArrowRight,
  Inbox,
} from 'lucide-react';
import { useClientAuth } from '@/hooks/labels/useClientAuth';
import { useClientPortalOrders } from '@/hooks/labels/useClientPortalData';
import type { LabelOrder, LabelOrderStatus } from '@/types/labels';

const statusSteps: { key: string; label: string }[] = [
  { key: 'pending_approval', label: 'Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'in_production', label: 'Production' },
  { key: 'completed', label: 'Complete' },
];

function getStepIndex(status: string) {
  const idx = statusSteps.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function OrderProgressBar({ status }: { status: string }) {
  const step = getStepIndex(status);
  const pct = ((step + 1) / statusSteps.length) * 100;
  return (
    <div className="space-y-1.5">
      <Progress value={pct} className="h-1.5" />
      <div className="flex justify-between">
        {statusSteps.map((s, i) => (
          <span
            key={s.key}
            className={`text-[10px] font-medium ${i <= step ? 'text-primary' : 'text-muted-foreground/50'}`}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function needsAction(order: LabelOrder): boolean {
  if (order.status === 'pending_approval') return true;
  return (order.items || []).some(
    (i) => i.proofing_status === 'awaiting_client' || i.proofing_status === 'client_needs_upload'
  );
}

export default function ClientPortalDashboard() {
  const navigate = useNavigate();
  const { contact, logout } = useClientAuth();
  const { data: orders, isLoading } = useClientPortalOrders();

  const handleLogout = () => {
    logout();
    navigate('/labels/portal/login');
  };

  const actionOrders = useMemo(() => orders?.filter(needsAction) || [], [orders]);
  const inProgressOrders = useMemo(
    () => orders?.filter((o) => !needsAction(o) && o.status !== 'completed') || [],
    [orders]
  );
  const completedOrders = useMemo(
    () => orders?.filter((o) => o.status === 'completed') || [],
    [orders]
  );

  const renderOrderCard = (order: LabelOrder, highlight?: boolean) => {
    const awaitingCount = (order.items || []).filter(
      (i) => i.proofing_status === 'awaiting_client' || i.proofing_status === 'client_needs_upload'
    ).length;

    return (
      <Card
        key={order.id}
        className={`group cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
          highlight ? 'border-destructive/40 bg-destructive/5' : ''
        }`}
        onClick={() => navigate(`/labels/portal/order/${order.id}`)}
      >
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-base truncate">{order.order_number}</p>
              <p className="text-xs text-muted-foreground">{order.customer_name}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {highlight && awaitingCount > 0 && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertCircle className="h-3 w-3" />
                  {awaitingCount} to review
                </Badge>
              )}
              {order.due_date && (
                <span className="text-[11px] text-muted-foreground">
                  Due {format(new Date(order.due_date), 'dd MMM')}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{order.items?.length || 0} items</span>
            <span>{order.total_label_count.toLocaleString()} labels</span>
          </div>

          <OrderProgressBar status={order.status} />

          {highlight && (
            <Button size="sm" className="w-full gap-2" variant="default">
              <Eye className="h-3.5 w-3.5" />
              Review & Approve
              <ArrowRight className="h-3.5 w-3.5 ml-auto" />
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">Client Portal</h1>
              <p className="text-xs text-muted-foreground">
                {contact?.company_name || 'Welcome'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/labels/portal/account')}>
              <User className="h-4 w-4 mr-1.5" />
              Account
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-10 max-w-5xl">
        {/* Welcome Hero */}
        <div className="rounded-xl bg-primary/5 border border-primary/10 p-6 lg:p-8">
          <h2 className="text-2xl font-bold text-foreground">
            Welcome back{contact?.name ? `, ${contact.name.split(' ')[0]}` : ''}
          </h2>
          <p className="text-muted-foreground mt-1">
            {actionOrders.length > 0
              ? `You have ${actionOrders.length} order${actionOrders.length !== 1 ? 's' : ''} that need${actionOrders.length === 1 ? 's' : ''} your attention.`
              : 'All your orders are up to date.'}
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading your orders...</div>
        ) : !orders?.length ? (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <Inbox className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="text-lg font-medium text-muted-foreground">No orders yet</p>
              <p className="text-sm text-muted-foreground/70">
                When your label orders are ready for review, they'll appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Action Required */}
            {actionOrders.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <h3 className="text-lg font-semibold">Action Required</h3>
                  <Badge variant="destructive" className="ml-1">{actionOrders.length}</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {actionOrders.map((o) => renderOrderCard(o, true))}
                </div>
              </section>
            )}

            {/* In Progress */}
            {inProgressOrders.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">In Progress</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {inProgressOrders.map((o) => renderOrderCard(o))}
                </div>
              </section>
            )}

            {/* Completed */}
            {completedOrders.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Completed</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {completedOrders.map((o) => renderOrderCard(o))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
