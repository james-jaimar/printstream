import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CheckCircle2,
  Clock,
  Eye,
  Factory,
  Filter,
  Inbox,
  Package,
  Search,
  ShoppingBag,
  Truck,
  User,
  LogOut,
  Image as ImageIcon,
  X,
  Menu,
  LayoutDashboard,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { useClientAuth } from '@/hooks/labels/useClientAuth';
import { useClientPortalOrders } from '@/hooks/labels/useClientPortalData';
import { getOrientationSvg } from '@/components/labels/OrientationPicker';
import impressLogo from '@/assets/impress-logo-colour.png';
import type { LabelOrder } from '@/types/labels';

/* ─── Helpers ─── */

function getVisibleItems(order: LabelOrder) {
  return (order.items || []).filter(
    (i) => !(i.page_count > 1 && !i.parent_item_id)
  );
}

const statusConfig: Record<string, { label: string; color: string; accent: string }> = {
  pending_approval: { label: 'Awaiting Approval', color: 'bg-amber-100 text-amber-800', accent: '#F59E0B' },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-800', accent: '#10B981' },
  in_production: { label: 'In Production', color: 'bg-blue-100 text-blue-800', accent: '#3B82F6' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', accent: '#10B981' },
  quote: { label: 'Draft', color: 'bg-gray-100 text-gray-600', accent: '#6B7280' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', accent: '#EF4444' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

const workflowSteps = [
  { key: 'review', label: 'Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'production', label: 'Production' },
  { key: 'shipped', label: 'Shipped' },
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

function MiniStepper({ status }: { status: string }) {
  const current = getWorkflowStep(status);
  return (
    <div className="flex items-center gap-0 w-full">
      {workflowSteps.map((step, i) => {
        const isComplete = i < current;
        const isCurrent = i === current;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                  isComplete
                    ? 'bg-[#00B8D4] text-white'
                    : isCurrent
                      ? 'bg-white text-[#00B8D4] ring-1 ring-inset ring-[#00B8D4]/30'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isComplete ? <CheckCircle className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-[9px] font-medium whitespace-nowrap ${isComplete || isCurrent ? 'text-slate-700' : 'text-slate-400'}`}>
                {step.label}
              </span>
            </div>
            {i < workflowSteps.length - 1 && (
              <div className={`flex-1 h-[2px] mx-1 mb-4 rounded-full ${isComplete ? 'bg-[#00B8D4]' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Status Tabs ─── */

const statusTabs = [
  { key: 'all', label: 'All Orders', icon: ShoppingBag },
  { key: 'pending_approval', label: 'Awaiting Approval', icon: Clock },
  { key: 'in_production', label: 'In Production', icon: Factory },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
];

/* ─── Sidebar ─── */

const sidebarNav = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/labels/portal' },
  { key: 'orders', label: 'My Orders', icon: ShoppingBag, path: '/labels/portal/orders' },
  { key: 'account', label: 'Account Settings', icon: Settings, path: '/labels/portal/account' },
  { key: 'help', label: 'Help Center', icon: HelpCircle, path: null },
];

function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const navigate = useNavigate();

  return (
    <nav className={className}>
      {sidebarNav.map((item) => {
        const active = item.key === 'orders';
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
                ? 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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

/* ─── Sort helpers ─── */

type SortKey = 'newest' | 'oldest' | 'due_date';

function sortOrders(orders: LabelOrder[], sortKey: SortKey): LabelOrder[] {
  const sorted = [...orders];
  switch (sortKey) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    case 'due_date':
      return sorted.sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
    default:
      return sorted;
  }
}

/* ─── Main Page ─── */

export default function ClientPortalOrders() {
  const navigate = useNavigate();
  const { contact, logout } = useClientAuth();
  const { data: orders, isLoading } = useClientPortalOrders();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('newest');

  const activeStatus = searchParams.get('status') || 'all';
  const setActiveStatus = (status: string) => {
    if (status === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ status });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/labels/portal/login');
  };

  // Filter & search
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    let result = orders;

    // Status filter
    if (activeStatus !== 'all') {
      result = result.filter(o => o.status === activeStatus);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        (o.notes || '').toLowerCase().includes(q)
      );
    }

    return sortOrders(result, sortBy);
  }, [orders, activeStatus, search, sortBy]);

  // Counts per status
  const counts = useMemo(() => {
    if (!orders) return { all: 0, pending_approval: 0, in_production: 0, completed: 0 };
    return {
      all: orders.length,
      pending_approval: orders.filter(o => o.status === 'pending_approval').length,
      in_production: orders.filter(o => o.status === 'in_production').length,
      completed: orders.filter(o => o.status === 'completed').length,
    };
  }, [orders]);

  return (
    <div className="min-h-screen bg-[radial-gradient(1100px_520px_at_50%_-140px,rgba(0,184,212,0.18),transparent_60%),linear-gradient(to_bottom,rgba(248,250,252,1),rgba(241,245,249,1))]">
      {/* ─── Top Header Bar ─── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#00B8D4] to-[#0097A7]" />
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden p-1.5 rounded-md hover:bg-slate-100"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <img src={impressLogo} alt="Impress" className="h-9 object-contain" />
            <div className="hidden sm:block h-7 w-px bg-slate-200" />
            <div className="hidden sm:block">
              <h1 className="font-semibold text-sm leading-tight text-slate-900">Client Portal</h1>
              <p className="text-[11px] text-slate-500 leading-tight">
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
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-[calc(100vh-57px)]">
        {/* ─── Desktop Sidebar ─── */}
        <aside className="hidden lg:block w-[260px] flex-shrink-0">
          <div className="sticky top-[76px] p-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur p-3">
              <div className="px-2 pb-3">
                <div className="text-sm font-semibold text-slate-900">Client Portal</div>
                <div className="text-xs text-slate-500">{contact?.company_name || 'Welcome'}</div>
              </div>
              <Sidebar />
              <div className="mt-4 border-t border-slate-200/60 pt-4 px-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00B8D4]/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-[#00B8D4]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 truncate">{contact?.name || 'User'}</div>
                    <div className="text-[10px] text-slate-500 truncate">{contact?.email || ''}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ─── Main Content ─── */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            {/* ─── Page Header ─── */}
            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Button variant="ghost" size="sm" className="text-slate-500 -ml-2" onClick={() => navigate('/labels/portal')}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Dashboard
                  </Button>
                </div>
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">My Orders</h2>
                <p className="mt-1 text-sm text-slate-500">
                  View and manage all your label orders
                </p>
              </div>
            </div>

            {/* ─── Status Tabs ─── */}
            <div className="flex flex-wrap gap-2">
              {statusTabs.map((tab) => {
                const count = counts[tab.key as keyof typeof counts] || 0;
                const active = activeStatus === tab.key;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveStatus(tab.key)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      active
                        ? 'bg-[#00B8D4] text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ─── Search & Sort Bar ─── */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by order number, customer name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-white border-slate-200"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {(['newest', 'oldest', 'due_date'] as SortKey[]).map((key) => {
                  const labels: Record<SortKey, string> = { newest: 'Newest', oldest: 'Oldest', due_date: 'Due Date' };
                  return (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        sortBy === key
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {labels[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── Results Count ─── */}
            <div className="text-sm text-slate-500">
              {isLoading ? 'Loading orders…' : `${filteredOrders.length} order${filteredOrders.length !== 1 ? 's' : ''}`}
              {search && <span className="ml-1">matching "{search}"</span>}
            </div>

            {/* ─── Order Cards ─── */}
            {isLoading ? (
              <div className="text-center py-20 text-muted-foreground">Loading your orders…</div>
            ) : filteredOrders.length === 0 ? (
              <Card className="border-dashed bg-white">
                <CardContent className="py-20 text-center space-y-4">
                  <Inbox className="h-14 w-14 mx-auto text-muted-foreground/30" />
                  <p className="text-lg font-medium text-muted-foreground">
                    {search ? 'No matching orders' : 'No orders found'}
                  </p>
                  <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto">
                    {search
                      ? 'Try adjusting your search or filter criteria.'
                      : 'When your label orders are ready for review, they\'ll appear here.'}
                  </p>
                  {search && (
                    <Button variant="outline" size="sm" onClick={() => { setSearch(''); setActiveStatus('all'); }}>
                      Clear filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => {
                  const items = getVisibleItems(order);
                  const firstThumb = items.find(
                    (i) => (i as any).signed_proof_thumbnail_url || (i as any).signed_artwork_thumbnail_url
                  );
                  const thumbUrl = firstThumb
                    ? (firstThumb as any).signed_proof_thumbnail_url || (firstThumb as any).signed_artwork_thumbnail_url
                    : null;
                  const needsReview = items.some(
                    (i) => i.proofing_status === 'awaiting_client' || i.proofing_status === 'client_needs_upload'
                  );

                  return (
                    <Card
                      key={order.id}
                      className="group cursor-pointer rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur overflow-hidden hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_18px_55px_rgba(15,23,42,0.10)] transition-all duration-200"
                      onClick={() => navigate(`/labels/portal/order/${order.id}`)}
                    >
                      <div className="flex flex-col sm:flex-row">
                        {/* Thumbnail */}
                        <div className="w-full sm:w-32 h-28 sm:h-auto bg-slate-50 flex-shrink-0 flex items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-100">
                          {thumbUrl ? (
                            <img src={thumbUrl} alt="" className="w-full h-full object-contain p-4" />
                          ) : (
                            <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
                          )}
                        </div>

                        {/* Content */}
                        <CardContent className="flex-1 p-4 sm:p-5 flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-base text-slate-900">{order.order_number}</p>
                                <StatusBadge status={order.status} />
                                {needsReview && (
                                  <Badge variant="destructive" className="text-[10px] gap-1">
                                    Action Needed
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-slate-500 mt-0.5">{order.customer_name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#00B8D4] group-hover:gap-2 transition-all">
                              <span className="text-xs font-semibold hidden sm:inline">View</span>
                              <ArrowRight className="h-4 w-4" />
                            </div>
                          </div>

                          {/* Details row */}
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5" />
                              {items.length} item{items.length !== 1 ? 's' : ''}
                            </span>
                            <span>{order.total_label_count.toLocaleString()} labels</span>
                            {order.due_date && (
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                Due {format(new Date(order.due_date), 'dd MMM yyyy')}
                              </span>
                            )}
                            <span>
                              Placed {format(new Date(order.created_at), 'dd MMM yyyy')}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <img src={getOrientationSvg(order.orientation ?? 1)} alt="" className="h-4 w-4 object-contain" />
                              Orientation #{order.orientation ?? 1}
                            </span>
                          </div>

                          {/* Mini workflow stepper */}
                          <div className="max-w-xs">
                            <MiniStepper status={order.status} />
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
