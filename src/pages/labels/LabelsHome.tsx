import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ClipboardList, 
  Tag, 
  Package, 
  Calendar, 
  AlertTriangle,
  TrendingUp,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useLabelOrders } from '@/hooks/labels/useLabelOrders';
import { useLabelStock, useLowStockAlerts } from '@/hooks/labels/useLabelStock';
import { NewLabelOrderDialog } from '@/components/labels/NewLabelOrderDialog';

const glassCard = 'rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur';

export default function LabelsHome() {
  const navigate = useNavigate();
  const { data: orders, isLoading: ordersLoading } = useLabelOrders();
  const { data: stock } = useLabelStock();
  const { data: lowStock } = useLowStockAlerts();

  const pendingApprovalCount = orders?.filter(o => o.status === 'pending_approval').length || 0;
  const inProductionCount = orders?.filter(o => o.status === 'in_production').length || 0;
  const quotesCount = orders?.filter(o => o.status === 'quote').length || 0;
  const lowStockCount = lowStock?.length || 0;

  const stats = [
    { title: 'Pending Approval', value: pendingApprovalCount, icon: Clock, accent: '#F59E0B', bg: 'bg-amber-50', link: '/labels/orders?status=pending_approval' },
    { title: 'In Production', value: inProductionCount, icon: TrendingUp, accent: '#3B82F6', bg: 'bg-blue-50', link: '/labels/orders?status=in_production' },
    { title: 'Open Quotes', value: quotesCount, icon: ClipboardList, accent: '#10B981', bg: 'bg-emerald-50', link: '/labels/orders?status=quote' },
    { title: 'Low Stock', value: lowStockCount, icon: AlertTriangle, accent: lowStockCount > 0 ? '#EF4444' : '#6B7280', bg: lowStockCount > 0 ? 'bg-red-50' : 'bg-gray-100', link: '/labels/stock' },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">Labels Division</h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage label orders, dielines, stock, and production schedule
          </p>
        </div>
        <NewLabelOrderDialog 
          onSuccess={(orderId) => navigate(`/labels/orders?selected=${orderId}`)} 
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.title} to={stat.link}>
            <Card className={`${glassCard} overflow-hidden transition-shadow hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_18px_55px_rgba(15,23,42,0.10)]`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{stat.title}</p>
                    <p className="text-3xl font-bold mt-1" style={{ color: stat.accent }}>{stat.value}</p>
                  </div>
                  <div className={`rounded-xl p-2.5 ${stat.bg}`}>
                    <stat.icon className="h-5 w-5" style={{ color: stat.accent }} />
                  </div>
                </div>
                <button className="mt-1 text-[11px] font-semibold flex items-center gap-1 hover:gap-2 transition-all text-[#00B8D4]">
                  View <ArrowRight className="h-3 w-3" />
                </button>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className={glassCard}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <ClipboardList className="h-5 w-5 text-[#00B8D4]" />
              Recent Orders
            </CardTitle>
            <CardDescription>Latest label orders</CardDescription>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : orders?.length === 0 ? (
              <p className="text-muted-foreground text-sm">No orders yet</p>
            ) : (
              <div className="space-y-2">
                {orders?.slice(0, 5).map((order) => (
                  <Link
                    key={order.id}
                    to={`/labels/orders?selected=${order.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm text-slate-900">{order.order_number}</p>
                      <p className="text-xs text-slate-500">{order.customer_name}</p>
                    </div>
                    <Badge variant={
                      order.status === 'approved' ? 'default' :
                      order.status === 'pending_approval' ? 'secondary' :
                      order.status === 'in_production' ? 'default' :
                      'outline'
                    }>
                      {order.status.replace('_', ' ')}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
            <Button variant="ghost" className="w-full mt-4 text-[#00B8D4] hover:text-[#0097A7]" asChild>
              <Link to="/labels/orders">View All Orders</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className={glassCard}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Tag className="h-5 w-5 text-[#00B8D4]" />
              Dieline Templates
            </CardTitle>
            <CardDescription>Standard label layouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Manage your library of dieline templates for quick order setup.
            </p>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/labels/dielines">Manage Dielines</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className={glassCard}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Package className="h-5 w-5 text-[#00B8D4]" />
              Stock Overview
            </CardTitle>
            <CardDescription>Roll stock inventory</CardDescription>
          </CardHeader>
          <CardContent>
            {lowStockCount > 0 && (
              <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-destructive mb-4">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">{lowStockCount} items below reorder level</span>
              </div>
            )}
            <p className="text-muted-foreground text-sm mb-4">
              {stock?.length || 0} substrate types in inventory
            </p>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/labels/stock">Manage Stock</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Preview */}
      <Card className={glassCard}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Calendar className="h-5 w-5 text-[#00B8D4]" />
            Production Schedule
          </CardTitle>
          <CardDescription>Upcoming label runs</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm mb-4">
            View and manage your production schedule with drag-and-drop.
          </p>
          <Button asChild>
            <Link to="/labels/schedule">Open Schedule Board</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
