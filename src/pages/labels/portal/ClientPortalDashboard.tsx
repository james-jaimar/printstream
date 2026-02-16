import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  LogOut,
  User,
  ArrowRight,
  Inbox,
  Image as ImageIcon,
  Package,
  FileText,
  Palette,
  Headphones,
  BarChart3,
  Factory,
} from 'lucide-react';
import { useClientAuth } from '@/hooks/labels/useClientAuth';
import { useClientPortalOrders } from '@/hooks/labels/useClientPortalData';
import impressLogo from '@/assets/impress-logo-colour.png';
import type { LabelOrder } from '@/types/labels';

/** Filter out parent items that were split into child pages */
function getVisibleItems(order: LabelOrder) {
  return (order.items || []).filter(
    (i) => !(i.page_count > 1 && !i.parent_item_id)
  );
}

function needsAction(order: LabelOrder): boolean {
  const items = getVisibleItems(order);
  const allApproved = items.length > 0 && items.every(i => i.proofing_status === 'approved');
  if (allApproved) return false;
  if (order.status === 'pending_approval') return true;
  return items.some(
    (i) => i.proofing_status === 'awaiting_client' || i.proofing_status === 'client_needs_upload'
  );
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending_approval: { label: 'Awaiting Approval', color: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-800' },
  in_production: { label: 'In Production', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  quote: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
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

  // Stats
  const stats = useMemo(() => {
    if (!orders) return { awaiting: 0, production: 0, completed: 0, total: 0 };
    return {
      awaiting: orders.filter(o => o.status === 'pending_approval').length,
      production: orders.filter(o => o.status === 'in_production').length,
      completed: orders.filter(o => o.status === 'completed').length,
      total: orders.length,
    };
  }, [orders]);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* ─── Branded Header ─── */}
      <header className="bg-card border-b sticky top-0 z-20 shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-[#00B8D4] to-[#0097A7]" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={impressLogo} alt="Impress" className="h-9 object-contain" />
            <div className="hidden sm:block h-7 w-px bg-border" />
            <div className="hidden sm:block">
              <h1 className="font-semibold text-sm leading-tight">Client Portal</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {contact?.company_name || 'Welcome'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/labels/portal/account')}>
              <User className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline text-xs">Account</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline text-xs">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* ─── Welcome + Stats ─── */}
        <section>
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Welcome back{contact?.name ? `, ${contact.name.split(' ')[0]}` : ''}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage your label orders and track your prints.
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: 'Awaiting Approval', value: stats.awaiting, icon: Clock, accent: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'In Production', value: stats.production, icon: Factory, accent: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Completed', value: stats.completed, icon: CheckCircle2, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Total Orders', value: stats.total, icon: Package, accent: 'text-foreground', bg: 'bg-muted' },
            ].map((s) => (
              <Card key={s.label} className="border bg-card">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{s.label}</p>
                      <p className={`text-3xl font-bold mt-1 ${s.accent}`}>{s.value}</p>
                    </div>
                    <div className={`rounded-lg p-2 ${s.bg}`}>
                      <s.icon className={`h-5 w-5 ${s.accent}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Loading your orders…</div>
        ) : !orders?.length ? (
          <Card className="border-dashed">
            <CardContent className="py-20 text-center space-y-4">
              <Inbox className="h-14 w-14 mx-auto text-muted-foreground/30" />
              <p className="text-lg font-medium text-muted-foreground">No orders yet</p>
              <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto">
                When your label orders are ready for review, they'll appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ─── Action Required ─── */}
            {actionOrders.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-full bg-destructive/10 p-1.5">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  </div>
                  <h3 className="text-lg font-semibold">Action Required</h3>
                  <Badge variant="destructive" className="text-xs">{actionOrders.length}</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {actionOrders.map((order) => {
                    const items = getVisibleItems(order);
                    const awaitingCount = items.filter(
                      i => i.proofing_status === 'awaiting_client' || i.proofing_status === 'client_needs_upload'
                    ).length;
                    const firstThumb = items.find(
                      i => (i as any).signed_proof_thumbnail_url || (i as any).signed_artwork_thumbnail_url
                    );
                    const thumbUrl = firstThumb
                      ? (firstThumb as any).signed_proof_thumbnail_url || (firstThumb as any).signed_artwork_thumbnail_url
                      : null;

                    return (
                      <Card
                        key={order.id}
                        className="group cursor-pointer border-l-4 border-l-amber-400 hover:shadow-lg transition-all duration-200 overflow-hidden"
                        onClick={() => navigate(`/labels/portal/order/${order.id}`)}
                      >
                        <div className="flex">
                          {/* Thumbnail */}
                          <div className="w-28 sm:w-36 bg-muted flex-shrink-0 flex items-center justify-center">
                            {thumbUrl ? (
                              <img src={thumbUrl} alt="" className="w-full h-full object-contain p-2" />
                            ) : (
                              <ImageIcon className="h-10 w-10 text-muted-foreground/25" />
                            )}
                          </div>
                          {/* Content */}
                          <CardContent className="p-4 flex-1 flex flex-col justify-between gap-3">
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-base">{order.order_number}</p>
                                {awaitingCount > 0 && (
                                  <Badge variant="destructive" className="text-[10px] gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {awaitingCount} to review
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{order.customer_name}</p>
                              <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                                <span>{items.length} items</span>
                                <span>·</span>
                                <span>{order.total_label_count.toLocaleString()} labels</span>
                                {order.due_date && (
                                  <>
                                    <span>·</span>
                                    <span>Due {format(new Date(order.due_date), 'dd MMM yyyy')}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <Button size="sm" className="w-full gap-2 bg-[#00B8D4] hover:bg-[#0097A7] text-white">
                              <Eye className="h-3.5 w-3.5" />
                              Review & Approve
                              <ArrowRight className="h-3.5 w-3.5 ml-auto" />
                            </Button>
                          </CardContent>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ─── Recent Orders Table ─── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-full bg-muted p-1.5">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">All Orders</h3>
              </div>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-center">Labels</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders?.map((order) => {
                      const items = getVisibleItems(order);
                      return (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/labels/portal/order/${order.id}`)}
                        >
                          <TableCell className="font-medium">{order.order_number}</TableCell>
                          <TableCell className="text-muted-foreground">{order.customer_name}</TableCell>
                          <TableCell className="text-center">{items.length}</TableCell>
                          <TableCell className="text-center">{order.total_label_count.toLocaleString()}</TableCell>
                          <TableCell><StatusBadge status={order.status} /></TableCell>
                          <TableCell className="text-muted-foreground">
                            {order.due_date ? format(new Date(order.due_date), 'dd MMM yyyy') : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <ArrowRight className="h-4 w-4 text-muted-foreground inline-block" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </section>
          </>
        )}

        {/* ─── Resources & Support ─── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-muted p-1.5">
              <Headphones className="h-4 w-4 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Resources & Support</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: FileText,
                title: 'File Guidelines',
                desc: 'PDF specs, bleed requirements, and colour profiles for print-ready artwork.',
              },
              {
                icon: Palette,
                title: 'Artwork Templates',
                desc: 'Download dieline templates and label layout guides for your products.',
              },
              {
                icon: Headphones,
                title: 'Contact Support',
                desc: 'Email support@impress.co.za or call your account manager for assistance.',
              },
            ].map((r) => (
              <Card key={r.title} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5 space-y-2">
                  <div className="rounded-lg bg-muted p-2.5 w-fit">
                    <r.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <h4 className="font-semibold text-sm">{r.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t mt-12 bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <img src={impressLogo} alt="Impress" className="h-5 object-contain opacity-60" />
            <p>© {new Date().getFullYear()} Impress Digital · Litho · Web · Packaging · Signage</p>
          </div>
          <p>Need help? <span className="font-medium text-foreground">support@impress.co.za</span></p>
        </div>
      </footer>
    </div>
  );
}
