import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, Mail, Phone, MapPin, Plus, MoreHorizontal, Pencil, Trash2, User, Bell, CheckCircle, X } from 'lucide-react';
import { useCustomerContacts, useDeleteCustomerContact, CustomerContact } from '@/hooks/labels/useCustomerContacts';
import { ContactFormDialog } from './ContactFormDialog';

interface LabelCustomer {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  billing_address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CustomerDetailPanelProps {
  customer: LabelCustomer;
  onClose: () => void;
}

export function CustomerDetailPanel({ customer, onClose }: CustomerDetailPanelProps) {
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);

  const { data: contacts, isLoading: contactsLoading } = useCustomerContacts(customer.id);
  const deleteContactMutation = useDeleteCustomerContact();

  const handleEditContact = (contact: CustomerContact) => {
    setEditingContact(contact);
    setContactDialogOpen(true);
  };

  const handleDeleteContact = async (contact: CustomerContact) => {
    if (confirm(`Delete contact "${contact.name}"?`)) {
      await deleteContactMutation.mutateAsync({ id: contact.id, customerId: customer.id });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {customer.company_name}
            </CardTitle>
            <Badge variant={customer.is_active ? 'default' : 'secondary'} className="mt-2">
              {customer.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="contacts" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="contacts" className="flex-1">
              Contacts ({contacts?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="details" className="flex-1">
              Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-muted-foreground">
                Manage who receives notifications and can approve proofs
              </p>
              <Button size="sm" onClick={() => { setEditingContact(null); setContactDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </div>

            {contactsLoading ? (
              <p className="text-muted-foreground text-center py-8">Loading contacts...</p>
            ) : contacts?.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <User className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No contacts yet</p>
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={() => { setEditingContact(null); setContactDialogOpen(true); }}
                >
                  Add the first contact
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {contacts?.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{contact.name}</p>
                            {contact.is_primary && (
                              <Badge variant="outline" className="text-xs">Primary</Badge>
                            )}
                            {contact.role && contact.role !== 'contact' && (
                              <Badge variant="secondary" className="text-xs">{contact.role}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {contact.email}
                            </span>
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            {contact.receives_proofs && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <CheckCircle className="h-3 w-3 text-green-500" />
                                Proofs
                              </span>
                            )}
                            {contact.receives_notifications && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Bell className="h-3 w-3 text-blue-500" />
                                Notifications
                              </span>
                            )}
                            {contact.can_approve_proofs && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <CheckCircle className="h-3 w-3 text-purple-500" />
                                Can Approve
                              </span>
                            )}
                            {contact.user_id && (
                              <Badge variant="outline" className="text-xs">Has Login</Badge>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditContact(contact)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteContact(contact)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="details" className="mt-4 space-y-4">
            <div className="grid gap-4">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Primary Email</p>
                  <p>{customer.contact_email}</p>
                </div>
              </div>

              {customer.contact_name && (
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Primary Contact</p>
                    <p>{customer.contact_name}</p>
                  </div>
                </div>
              )}

              {customer.contact_phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p>{customer.contact_phone}</p>
                  </div>
                </div>
              )}

              {customer.billing_address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Billing Address</p>
                    <p className="whitespace-pre-line">{customer.billing_address}</p>
                  </div>
                </div>
              )}

              {customer.notes && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-line">{customer.notes}</p>
                </div>
              )}

              <div className="pt-4 border-t text-sm text-muted-foreground">
                <p>Created: {new Date(customer.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <ContactFormDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        customerId={customer.id}
        contact={editingContact}
      />
    </Card>
  );
}
