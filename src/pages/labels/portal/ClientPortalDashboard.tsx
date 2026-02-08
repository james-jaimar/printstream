import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Package, Eye, Clock, CheckCircle, AlertCircle, LogOut, Boxes } from 'lucide-react';
import { useClientOrders, useClientProfile } from '@/hooks/labels/useClientPortal';
import { supabase } from '@/integrations/supabase/client';
import type { LabelOrderStatus } from '@/types/labels';

const statusConfig: Record<LabelOrderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  quote: { label: 'Quote', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  pending_approval: { label: 'Pending Approval', variant: 'secondary', icon: <AlertCircle className="h-3 w-3" /> },
  approved: { label: 'Approved', variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
  in_production: { label: 'In Production', variant: 'default', icon: <Package className="h-3 w-3" /> },
  completed: { label: 'Completed', variant: 'secondary', icon: <CheckCircle className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
};

export default function ClientPortalDashboard() {
  const navigate = useNavigate();
  const { data: profile } = useClientProfile();
  const { data: orders, isLoading } = useClientOrders();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/labels/portal/login');
  };

  const pendingApprovalOrders = orders?.filter(o => o.status === 'pending_approval') || [];
  const otherOrders = orders?.filter(o => o.status !== 'pending_approval') || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Boxes className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-semibold">Label Client Portal</h1>
              <p className="text-sm text-muted-foreground">
                {profile?.company_name || 'Welcome'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Pending Approvals */}
        {pendingApprovalOrders.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Pending Your Approval
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingApprovalOrders.map((order) => (
                <Card key={order.id} className="border-yellow-500/50 bg-yellow-500/5">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{order.order_number}</CardTitle>
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                        Needs Approval
                      </Badge>
                    </div>
                    <CardDescription>{order.customer_name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Items</span>
                        <span>{order.items?.length || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Labels</span>
                        <span>{order.total_label_count.toLocaleString()}</span>
                      </div>
                      {order.due_date && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Due Date</span>
                          <span>{format(new Date(order.due_date), 'dd MMM yyyy')}</span>
                        </div>
                      )}
                    </div>
                    <Button 
                      className="w-full mt-4"
                      onClick={() => navigate(`/labels/portal/order/${order.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Review & Approve
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* All Orders */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Your Orders</h2>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading orders...</p>
          ) : orders?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No orders yet</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {otherOrders.map((order) => {
                  const config = statusConfig[order.status as LabelOrderStatus];
                  return (
                    <Card 
                      key={order.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/labels/portal/order/${order.id}`)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{order.order_number}</span>
                              <Badge variant={config?.variant || 'outline'}>
                                {config?.icon}
                                <span className="ml-1">{config?.label || order.status}</span>
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {order.items?.length || 0} items · {order.total_label_count.toLocaleString()} labels
                            </p>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            <p>{format(new Date(order.created_at), 'dd MMM yyyy')}</p>
                            {order.due_date && (
                              <p>Due: {format(new Date(order.due_date), 'dd MMM')}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </section>
      </main>
    </div>
  );
}
