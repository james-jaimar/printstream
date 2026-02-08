import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import { Plus, Users, Link as LinkIcon, Loader2 } from 'lucide-react';
import { useLabelCustomers, useCreateLabelCustomer, useLinkCustomerToOrder } from '@/hooks/labels/useClientPortal';
import { useLabelOrders } from '@/hooks/labels/useLabelOrders';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function ClientManagement() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [selectedCustomerUserId, setSelectedCustomerUserId] = useState<string>('');
  const [newClient, setNewClient] = useState({
    email: '',
    password: '',
    company_name: '',
    contact_name: '',
    contact_phone: '',
    notes: '',
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const { data: customers, isLoading: customersLoading } = useLabelCustomers();
  const { data: orders } = useLabelOrders();
  const createCustomerMutation = useCreateLabelCustomer();
  const linkCustomerMutation = useLinkCustomerToOrder();

  // Filter orders that don't have a customer linked
  const unlinkedOrders = orders?.filter(o => !o.customer_id) || [];

  const handleCreateClient = async () => {
    if (!newClient.email || !newClient.password || !newClient.company_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsCreatingUser(true);
    try {
      // Create auth user first
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newClient.email,
        password: newClient.password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      // Create customer record
      await createCustomerMutation.mutateAsync({
        user_id: authData.user.id,
        company_name: newClient.company_name,
        contact_name: newClient.contact_name || undefined,
        contact_email: newClient.email,
        contact_phone: newClient.contact_phone || undefined,
        notes: newClient.notes || undefined,
      });

      setCreateDialogOpen(false);
      setNewClient({
        email: '',
        password: '',
        company_name: '',
        contact_name: '',
        contact_phone: '',
        notes: '',
      });
      toast.success('Client account created successfully');
    } catch (error: any) {
      console.error('Error creating client:', error);
      toast.error(error.message || 'Failed to create client');
    } finally {
      setIsCreatingUser(false);
    }
  };

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

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Client
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Client Account</DialogTitle>
                  <DialogDescription>
                    Create a new client login for the proof portal
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        value={newClient.email}
                        onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                        placeholder="client@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <Input
                        type="password"
                        value={newClient.password}
                        onChange={(e) => setNewClient({ ...newClient, password: e.target.value })}
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Company Name *</Label>
                    <Input
                      value={newClient.company_name}
                      onChange={(e) => setNewClient({ ...newClient, company_name: e.target.value })}
                      placeholder="Company Ltd"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Contact Name</Label>
                      <Input
                        value={newClient.contact_name}
                        onChange={(e) => setNewClient({ ...newClient, contact_name: e.target.value })}
                        placeholder="John Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={newClient.contact_phone}
                        onChange={(e) => setNewClient({ ...newClient, contact_phone: e.target.value })}
                        placeholder="+27..."
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={newClient.notes}
                      onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                      placeholder="Any additional notes..."
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateClient}
                    disabled={isCreatingUser || createCustomerMutation.isPending}
                  >
                    {isCreatingUser || createCustomerMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                      {customer.contact_email}
                      {customer.contact_name && ` · ${customer.contact_name}`}
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
