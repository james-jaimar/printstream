import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Building2, Search, ChevronRight, Users } from 'lucide-react';
import { useLabelCustomers, useCreateLabelCustomer } from '@/hooks/labels/useClientPortal';
import { CustomerFormDialog } from '@/components/labels/customers/CustomerFormDialog';
import { CustomerDetailPanel } from '@/components/labels/customers/CustomerDetailPanel';

export default function LabelsCustomers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const { data: customers, isLoading } = useLabelCustomers();
  const createCustomerMutation = useCreateLabelCustomer();

  const filteredCustomers = customers?.filter(c =>
    c.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.contact_email.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const selectedCustomer = customers?.find(c => c.id === selectedCustomerId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground">
            Manage customer accounts and their contacts
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" />
              Customer List
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">Loading...</p>
            ) : filteredCustomers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No customers found</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="divide-y">
                  {filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className={`w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-center justify-between ${
                        selectedCustomerId === customer.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{customer.company_name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {customer.contact_email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant={customer.is_active ? 'default' : 'secondary'} className="shrink-0">
                          {customer.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Customer Detail Panel */}
        <div className="lg:col-span-2">
          {selectedCustomer ? (
            <CustomerDetailPanel 
              customer={selectedCustomer} 
              onClose={() => setSelectedCustomerId(null)}
            />
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Select a customer to view details and manage contacts
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <CustomerFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={async (data) => {
          await createCustomerMutation.mutateAsync(data);
          setCreateDialogOpen(false);
        }}
        isSubmitting={createCustomerMutation.isPending}
      />
    </div>
  );
}
