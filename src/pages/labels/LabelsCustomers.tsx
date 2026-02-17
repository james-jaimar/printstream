import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Building2, Search, ChevronRight, Users, AlertCircle } from 'lucide-react';
import { useLabelCustomers, useCreateLabelCustomer, useUpdateLabelCustomer, useArchiveLabelCustomer, useDeleteLabelCustomer } from '@/hooks/labels/useClientPortal';
import { useCustomerContacts } from '@/hooks/labels/useCustomerContacts';
import { CustomerFormDialog } from '@/components/labels/customers/CustomerFormDialog';
import { CustomerDetailPanel } from '@/components/labels/customers/CustomerDetailPanel';

const glassCard = 'rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur';

interface LabelCustomer {
  id: string;
  user_id: string | null;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function CustomerListItem({ customer, isSelected, onClick }: { customer: LabelCustomer; isSelected: boolean; onClick: () => void }) {
  const { data: contacts } = useCustomerContacts(customer.id);
  const primaryContact = contacts?.find(c => c.is_primary);
  const contactCount = contacts?.length || 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 hover:bg-slate-50/60 transition-colors flex items-center justify-between ${isSelected ? 'bg-slate-100/80' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate text-slate-900">{customer.company_name}</p>
          {contactCount === 0 && <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />}
        </div>
        <p className="text-sm text-slate-500 truncate">{primaryContact ? primaryContact.email : 'No primary contact'}</p>
        {contactCount > 0 && <p className="text-xs text-slate-400 mt-1">{contactCount} contact{contactCount !== 1 ? 's' : ''}</p>}
      </div>
      <div className="flex items-center gap-2 ml-2">
        <Badge variant={customer.is_active ? 'default' : 'secondary'} className="shrink-0">{customer.is_active ? 'Active' : 'Archived'}</Badge>
        <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
      </div>
    </button>
  );
}

export default function LabelsCustomers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<LabelCustomer | null>(null);

  const { data: customers, isLoading } = useLabelCustomers();
  const createCustomerMutation = useCreateLabelCustomer();
  const updateCustomerMutation = useUpdateLabelCustomer();
  const archiveCustomerMutation = useArchiveLabelCustomer();
  const deleteCustomerMutation = useDeleteLabelCustomer();

  const filteredCustomers = customers?.filter(c => {
    const matchesSearch = c.company_name.toLowerCase().includes(searchTerm.toLowerCase()) || (c.contact_email?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = showArchived ? true : c.is_active;
    return matchesSearch && matchesStatus;
  }) || [];

  const selectedCustomer = customers?.find(c => c.id === selectedCustomerId);

  const handleEdit = (customer: LabelCustomer) => { setEditingCustomer(customer); setEditDialogOpen(true); };
  const handleArchive = async (customerId: string) => { await archiveCustomerMutation.mutateAsync(customerId); setSelectedCustomerId(null); };
  const handleDelete = async (customerId: string) => { await deleteCustomerMutation.mutateAsync(customerId); setSelectedCustomerId(null); };

  const handleCreateSubmit = async (data: { company_name: string; billing_address?: string; notes?: string }) => {
    await createCustomerMutation.mutateAsync(data);
    setCreateDialogOpen(false);
  };

  const handleEditSubmit = async (data: { id?: string; company_name: string; billing_address?: string; notes?: string }) => {
    if (!data.id) return;
    await updateCustomerMutation.mutateAsync({ id: data.id, company_name: data.company_name, billing_address: data.billing_address || null, notes: data.notes || null });
    setEditDialogOpen(false);
    setEditingCustomer(null);
  };

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Manage customer accounts and their contacts</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <Card className={`lg:col-span-1 ${glassCard}`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Building2 className="h-5 w-5 text-[#00B8D4]" />
              Customer List
            </CardTitle>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search customers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <div className="flex items-center gap-2">
                <Button variant={showArchived ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? 'Hide Archived' : 'Show Archived'}
                </Button>
                <span className="text-sm text-slate-500">{filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">Loading...</p>
            ) : filteredCustomers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No customers found</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-360px)]">
                <div className="divide-y divide-slate-200/60">
                  {filteredCustomers.map((customer) => (
                    <CustomerListItem key={customer.id} customer={customer} isSelected={selectedCustomerId === customer.id} onClick={() => setSelectedCustomerId(customer.id)} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Customer Detail Panel */}
        <div className="lg:col-span-2">
          {selectedCustomer ? (
            <CustomerDetailPanel customer={selectedCustomer} onClose={() => setSelectedCustomerId(null)} onEdit={handleEdit} onArchive={handleArchive} onDelete={handleDelete} />
          ) : (
            <Card className={`h-full flex items-center justify-center ${glassCard}`}>
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Select a customer to view details and manage contacts</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <CustomerFormDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSubmit={handleCreateSubmit} isSubmitting={createCustomerMutation.isPending} />
      <CustomerFormDialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingCustomer(null); }} onSubmit={handleEditSubmit} isSubmitting={updateCustomerMutation.isPending} customer={editingCustomer} />
    </div>
  );
}
