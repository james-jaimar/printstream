import { Link } from 'react-router-dom';
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
  Clock
} from 'lucide-react';
import { useLabelOrders } from '@/hooks/labels/useLabelOrders';
import { useLabelStock, useLowStockAlerts } from '@/hooks/labels/useLabelStock';
import { NewLabelOrderDialog } from '@/components/labels/NewLabelOrderDialog';

export default function LabelsHome() {
  const { data: orders, isLoading: ordersLoading } = useLabelOrders();
  const { data: stock } = useLabelStock();
  const { data: lowStock } = useLowStockAlerts();

  // Calculate stats
  const pendingApprovalCount = orders?.filter(o => o.status === 'pending_approval').length || 0;
  const inProductionCount = orders?.filter(o => o.status === 'in_production').length || 0;
  const quotesCount = orders?.filter(o => o.status === 'quote').length || 0;
  const lowStockCount = lowStock?.length || 0;

  const stats = [
    {
      title: 'Pending Approval',
      value: pendingApprovalCount,
      icon: Clock,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      link: '/labels/orders?status=pending_approval',
    },
    {
      title: 'In Production',
      value: inProductionCount,
      icon: TrendingUp,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      link: '/labels/orders?status=in_production',
    },
    {
      title: 'Open Quotes',
      value: quotesCount,
      icon: ClipboardList,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      link: '/labels/orders?status=quote',
    },
    {
      title: 'Low Stock Alerts',
      value: lowStockCount,
      icon: AlertTriangle,
      color: lowStockCount > 0 ? 'text-red-500' : 'text-muted-foreground',
      bgColor: lowStockCount > 0 ? 'bg-red-500/10' : 'bg-muted',
      link: '/labels/stock',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Labels Division</h1>
          <p className="text-muted-foreground">
            Manage label orders, dielines, stock, and production schedule
          </p>
        </div>
        <NewLabelOrderDialog 
          onSuccess={(orderId) => window.location.href = `/labels/orders/${orderId}`} 
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.title} to={stat.link}>
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
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
              <div className="space-y-3">
                {orders?.slice(0, 5).map((order) => (
                  <Link
                    key={order.id}
                    to={`/labels/orders/${order.id}`}
                    className="flex items-center justify-between p-2 rounded hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{order.order_number}</p>
                      <p className="text-xs text-muted-foreground">{order.customer_name}</p>
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
            <Button variant="ghost" className="w-full mt-4" asChild>
              <Link to="/labels/orders">View All Orders</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Dieline Templates
            </CardTitle>
            <CardDescription>Standard label layouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm mb-4">
              Manage your library of dieline templates for quick order setup.
            </p>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/labels/dielines">
                Manage Dielines
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
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
              <Link to="/labels/stock">
                Manage Stock
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Production Schedule
          </CardTitle>
          <CardDescription>Upcoming label runs</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm mb-4">
            View and manage your production schedule with drag-and-drop.
          </p>
          <Button asChild>
            <Link to="/labels/schedule">
              Open Schedule Board
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
