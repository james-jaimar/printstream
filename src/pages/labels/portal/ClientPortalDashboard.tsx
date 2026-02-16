import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  CheckCircle,
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
  LayoutDashboard,
  ShoppingBag,
  HelpCircle,
  Settings,
  Menu,
  X,
  Upload,
  Truck,
} from 'lucide-react';
import { useClientAuth } from '@/hooks/labels/useClientAuth';
import { useClientPortalOrders } from '@/hooks/labels/useClientPortalData';
import impressLogo from '@/assets/impress-logo-colour.png';
import type { LabelOrder } from '@/types/labels';

/* ─── Helpers ─── */

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

function getWorkflowStep(status: string): number {
  switch (status) {
    case 'pending_approval': return 1;
    case 'approved': return 2;
    case 'in_production': return 3;
    case 'completed': return 3;
    default: return 0;
  }
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

/* ─── Workflow Stepper (inline, for tracking widget) ─── */

const workflowSteps = [
  { key: 'review', label: 'Review', icon: Eye },
  { key: 'approved', label: 'Approved', icon: CheckCircle },
  { key: 'production', label: 'Production', icon: Factory },
  { key: 'shipped', label: 'Shipped', icon: Truck },
];

function TrackingStepper({ status }: { status: string }) {
  const current = getWorkflowStep(status);
  return (
    <div className="flex items-center gap-0 w-full py-4">
      {workflowSteps.map((step, i) => {
        const isComplete = i < current;
        const isCurrent = i === current;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isComplete
                    ? 'bg-[#00B8D4] text-white'
                    : isCurrent
                      ? 'border-2 border-[#00B8D4] text-[#00B8D4] bg-[#00B8D4]/10'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isComplete ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${isComplete || isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
            {i < workflowSteps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 mb-5 rounded-full ${isComplete ? 'bg-[#00B8D4]' : 'bg-gray-200'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Sidebar Navigation ─── */

const sidebarNav = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/labels/portal' },
  { key: 'orders', label: 'My Orders', icon: ShoppingBag, path: '/labels/portal?view=orders' },
  { key: 'account', label: 'Account Settings', icon: Settings, path: '/labels/portal/account' },
  { key: 'help', label: 'Help Center', icon: HelpCircle, path: null },
];

function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (item: typeof sidebarNav[0]) => {
    if (item.key === 'dashboard') return location.pathname === '/labels/portal' && !location.search;
    if (item.key === 'orders') return location.search.includes('view=orders');
    if (item.key === 'account') return location.pathname.includes('/account');
    return false;
  };

  return (
    <nav className={className}>
      {sidebarNav.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            onClick={() => {
              if (item.path) navigate(item.path);
              else window.location.href = 'mailto:support@impress.co.za';
              onNavigate?.();
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-[#00B8D4]/10 text-[#00B8D4]'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4.5 w-4.5 flex-shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ─── Main Dashboard ─── */

export default function ClientPortalDashboard() {
  const navigate = useNavigate();
  const { contact, logout } = useClientAuth();
  const { data: orders, isLoading } = useClientPortalOrders();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/labels/portal/login');
  };

  const actionOrders = useMemo(() => orders?.filter(needsAction) || [], [orders]);

  const stats = useMemo(() => {
    if (!orders) return { awaiting: 0, production: 0, completed: 0, total: 0 };
    return {
      awaiting: orders.filter(o => o.status === 'pending_approval').length,
      production: orders.filter(o => o.status === 'in_production').length,
      completed: orders.filter(o => o.status === 'completed').length,
      total: orders.length,
    };
  }, [orders]);

  // Most recent active order for tracking widget
  const trackingOrder = useMemo(() => {
    if (!orders) return null;
    return orders.find(o => o.status !== 'completed' && o.status !== 'cancelled') || null;
  }, [orders]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Top Header Bar ─── */}
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-[#00B8D4] to-[#0097A7]" />
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-1.5 rounded-md hover:bg-gray-100"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <img src={impressLogo} alt="Impress" className="h-9 object-contain" />
            <div className="hidden sm:block h-7 w-px bg-gray-200" />
            <div className="hidden sm:block">
              <h1 className="font-semibold text-sm leading-tight text-foreground">Client Portal</h1>
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

      {/* ─── Mobile Sidebar Overlay ─── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-[57px] bottom-0 w-64 bg-white border-r shadow-xl p-4">
            <div className="mb-4">
              <img src={impressLogo} alt="Impress" className="h-7 object-contain mb-4" />
            </div>
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-[calc(100vh-57px)]">
        {/* ─── Desktop Sidebar ─── */}
        <aside className="hidden lg:flex flex-col w-[220px] bg-white border-r flex-shrink-0">
          <div className="p-5 space-y-1">
            <Sidebar />
          </div>
          {/* Sidebar footer */}
          <div className="mt-auto p-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#00B8D4]/10 flex items-center justify-center">
                <User className="h-4 w-4 text-[#00B8D4]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{contact?.name || 'Client'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{contact?.email || ''}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* ─── Main Content ─── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* ─── Welcome ─── */}
            <section>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Welcome back{contact?.name ? `, ${contact.name.split(' ')[0]}` : ''}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Manage your label orders and track your prints.
              </p>
            </section>

            {/* ─── Stats Cards ─── */}
            <section>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Awaiting Approval', value: stats.awaiting, icon: Clock, accent: '#F59E0B', bg: 'bg-amber-50', filter: 'pending_approval' },
                  { label: 'In Production', value: stats.production, icon: Factory, accent: '#3B82F6', bg: 'bg-blue-50', filter: 'in_production' },
                  { label: 'Completed', value: stats.completed, icon: CheckCircle2, accent: '#10B981', bg: 'bg-emerald-50', filter: 'completed' },
                  { label: 'Total Orders', value: stats.total, icon: Package, accent: '#6B7280', bg: 'bg-gray-100', filter: null },
                ].map((s) => {
                  // Find orders matching this stat to show thumbnail
                  const matchingOrders = s.filter
                    ? orders?.filter(o => o.status === s.filter) || []
                    : orders || [];
                  const firstThumb = matchingOrders.length > 0
                    ? getVisibleItems(matchingOrders[0]).find(
                        (i) => (i as any).signed_proof_thumbnail_url || (i as any).signed_artwork_thumbnail_url
                      )
                    : null;
                  const thumbUrl = firstThumb
                    ? (firstThumb as any).signed_proof_thumbnail_url || (firstThumb as any).signed_artwork_thumbnail_url
                    : null;

                  return (
                    <Card key={s.label} className="bg-white border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</p>
                            <p className="text-3xl font-bold mt-1" style={{ color: s.accent }}>{s.value}</p>
                          </div>
                          <div className={`rounded-xl p-2.5 ${s.bg}`}>
                            <s.icon className="h-5 w-5" style={{ color: s.accent }} />
                          </div>
                        </div>
                        {/* Thumbnail strip */}
                        {thumbUrl && (
                          <div className="mt-2 h-10 bg-gray-50 rounded-md overflow-hidden flex items-center justify-center">
                            <img src={thumbUrl} alt="" className="h-full object-contain opacity-60" />
                          </div>
                        )}
                        {/* CTA */}
                        {s.value > 0 && (
                          <button
                            onClick={() => {
                              const params = s.filter ? `?view=orders&status=${s.filter}` : '?view=orders';
                              navigate(`/labels/portal${params}`);
                            }}
                            className="mt-3 text-[11px] font-semibold flex items-center gap-1 hover:gap-2 transition-all"
                            style={{ color: '#00B8D4' }}
                          >
                            View Orders
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            {isLoading ? (
              <div className="text-center py-20 text-muted-foreground">Loading your orders…</div>
            ) : !orders?.length ? (
              <Card className="border-dashed bg-white">
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
                      <h3 className="text-lg font-bold">Action Required</h3>
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
                            className="group cursor-pointer bg-white border-l-4 border-l-amber-400 hover:shadow-lg transition-all duration-200 overflow-hidden"
                            onClick={() => navigate(`/labels/portal/order/${order.id}`)}
                          >
                            <div className="flex">
                              {/* Thumbnail */}
                              <div className="w-28 sm:w-36 bg-gray-50 flex-shrink-0 flex items-center justify-center">
                                {thumbUrl ? (
                                  <img src={thumbUrl} alt="" className="w-full h-full object-contain p-3" />
                                ) : (
                                  <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
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

                {/* ─── Two-Column: Recent Orders + Tracking Widget ─── */}
                <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* Recent Orders Table — 3 cols */}
                  <div className="lg:col-span-3 space-y-4">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-full bg-gray-100 p-1.5">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-bold">Recent Orders</h3>
                    </div>
                    <Card className="bg-white shadow-sm">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="text-xs">Order #</TableHead>
                            <TableHead className="text-xs hidden sm:table-cell">Customer</TableHead>
                            <TableHead className="text-xs text-center">Items</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs hidden sm:table-cell">Due Date</TableHead>
                            <TableHead className="text-right text-xs" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders?.slice(0, 8).map((order) => {
                            const items = getVisibleItems(order);
                            return (
                              <TableRow
                                key={order.id}
                                className="cursor-pointer hover:bg-gray-50"
                                onClick={() => navigate(`/labels/portal/order/${order.id}`)}
                              >
                                <TableCell className="font-medium text-sm">{order.order_number}</TableCell>
                                <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">{order.customer_name}</TableCell>
                                <TableCell className="text-center text-sm">{items.length}</TableCell>
                                <TableCell><StatusBadge status={order.status} /></TableCell>
                                <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">
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
                  </div>

                  {/* Track Your Order Widget — 2 cols */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-full bg-[#00B8D4]/10 p-1.5">
                        <Truck className="h-4 w-4 text-[#00B8D4]" />
                      </div>
                      <h3 className="text-lg font-bold">Track Your Order</h3>
                    </div>
                    <Card className="bg-white shadow-sm">
                      <CardContent className="p-5">
                        {trackingOrder ? (
                          <div className="space-y-4">
                            <div>
                              <p className="font-bold text-base">{trackingOrder.order_number}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {trackingOrder.customer_name}
                                {trackingOrder.due_date && ` · Due ${format(new Date(trackingOrder.due_date), 'dd MMM yyyy')}`}
                              </p>
                            </div>
                            <TrackingStepper status={trackingOrder.status} />
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>
                                <span className="font-medium text-foreground">{getVisibleItems(trackingOrder).length}</span> items ·{' '}
                                <span className="font-medium text-foreground">{trackingOrder.total_label_count.toLocaleString()}</span> labels
                              </p>
                            </div>
                            <Button
                              size="sm"
                              className="w-full gap-2 bg-[#00B8D4] hover:bg-[#0097A7] text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/labels/portal/order/${trackingOrder.id}`);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View Details
                              <ArrowRight className="h-3.5 w-3.5 ml-auto" />
                            </Button>
                          </div>
                        ) : (
                          <div className="text-center py-8 space-y-2">
                            <Package className="h-10 w-10 mx-auto text-muted-foreground/20" />
                            <p className="text-sm text-muted-foreground">No active orders to track</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </section>
              </>
            )}

            {/* ─── Resources & Support ─── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-full bg-gray-100 p-1.5">
                  <Headphones className="h-4 w-4 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold">Resources & Support</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    icon: FileText,
                    title: 'File Guidelines',
                    desc: 'PDF specs, bleed requirements, and colour profiles for print-ready artwork.',
                    accent: '#00B8D4',
                  },
                  {
                    icon: Palette,
                    title: 'Artwork Templates',
                    desc: 'Download dieline templates and label layout guides for your products.',
                    accent: '#7C3AED',
                  },
                  {
                    icon: Headphones,
                    title: 'Contact Support',
                    desc: 'Email support@impress.co.za or call your account manager for assistance.',
                    accent: '#F59E0B',
                  },
                ].map((r) => (
                  <Card key={r.title} className="bg-white hover:shadow-md transition-shadow">
                    <CardContent className="p-6 text-center space-y-3">
                      <div className="rounded-xl p-3 w-fit mx-auto" style={{ backgroundColor: `${r.accent}10` }}>
                        <r.icon className="h-6 w-6" style={{ color: r.accent }} />
                      </div>
                      <h4 className="font-bold text-sm">{r.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>

          {/* ─── Footer ─── */}
          <footer className="border-t mt-12 bg-white">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <img src={impressLogo} alt="Impress" className="h-5 object-contain opacity-60" />
                <p>© {new Date().getFullYear()} Impress Digital · Litho · Web · Packaging · Signage</p>
              </div>
              <p>Need help? <span className="font-medium text-foreground">support@impress.co.za</span></p>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
