import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Link as LinkIcon, Plus } from 'lucide-react';
import { useLabelCustomers, useLinkCustomerToOrder } from '@/hooks/labels/useClientPortal';
import { useLabelOrders } from '@/hooks/labels/useLabelOrders';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export function ClientManagement() {
  const navigate = useNavigate();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [selectedCustomerUserId, setSelectedCustomerUserId] = useState<string>('');

  const { data: customers, isLoading: customersLoading } = useLabelCustomers();
  const { data: orders } = useLabelOrders();
  const linkCustomerMutation = useLinkCustomerToOrder();

  // Filter orders that don't have a customer linked
  const unlinkedOrders = orders?.filter(o => !o.customer_id) || [];

  const handleLinkCustomer = async () => {
    if (!selectedOrderId || !selectedCustomerUserId) {
      toast.error('Please select both order and customer');
      return;
    }

    await linkCustomerMutation.mutateAsync({
      orderId: selectedOrderId,
      customerUserId: selectedCustomerUserId,
    });

    setLinkDialogOpen(false);
    setSelectedOrderId('');
    setSelectedCustomerUserId('');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Client Management
            </CardTitle>
            <CardDescription>
              Manage client accounts and link them to orders
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Link to Order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Link Customer to Order</DialogTitle>
                  <DialogDescription>
                    Connect a customer account to an order for portal access
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Order</Label>
                    <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an order..." />
                      </SelectTrigger>
                      <SelectContent>
                        {unlinkedOrders.map((order) => (
                          <SelectItem key={order.id} value={order.id}>
                            {order.order_number} - {order.customer_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Customer</Label>
                    <Select value={selectedCustomerUserId} onValueChange={setSelectedCustomerUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a customer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {customers?.map((customer) => (
                          <SelectItem key={customer.id} value={customer.user_id}>
                            {customer.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleLinkCustomer}
                    disabled={linkCustomerMutation.isPending}
                  >
                    {linkCustomerMutation.isPending ? 'Linking...' : 'Link Customer'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button size="sm" onClick={() => navigate('/labels/customers')}>
              <Plus className="h-4 w-4 mr-2" />
              New Customer
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {customersLoading ? (
          <p className="text-muted-foreground text-center py-4">Loading clients...</p>
        ) : customers?.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No clients yet</p>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {customers?.map((customer) => (
                <div 
                  key={customer.id} 
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <p className="font-medium">{customer.company_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {customer.contact_email || 'No primary contact'}
                    </p>
                  </div>
                  <Badge variant={customer.is_active ? 'default' : 'secondary'}>
                    {customer.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
