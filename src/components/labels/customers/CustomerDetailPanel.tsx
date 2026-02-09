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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Building2, Mail, Phone, MapPin, Plus, MoreHorizontal, Pencil, Trash2, User, Bell, CheckCircle, X, Archive, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCustomerContacts, useDeleteCustomerContact, CustomerContact } from '@/hooks/labels/useCustomerContacts';
import { ContactFormDialog } from './ContactFormDialog';

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

interface CustomerDetailPanelProps {
  customer: LabelCustomer;
  onClose: () => void;
  onEdit?: (customer: LabelCustomer) => void;
  onArchive?: (customerId: string) => void;
  onDelete?: (customerId: string) => void;
}

export function CustomerDetailPanel({ customer, onClose, onEdit, onArchive, onDelete }: CustomerDetailPanelProps) {
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordContact, setPasswordContact] = useState<CustomerContact | null>(null);
  const [portalPassword, setPortalPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const { data: contacts, isLoading: contactsLoading } = useCustomerContacts(customer.id);
  const deleteContactMutation = useDeleteCustomerContact();

  const primaryContact = contacts?.find(c => c.is_primary);

  const handleEditContact = (contact: CustomerContact) => {
    setEditingContact(contact);
    setContactDialogOpen(true);
  };

  const handleDeleteContact = async (contact: CustomerContact) => {
    if (confirm(`Delete contact "${contact.name}"?`)) {
      await deleteContactMutation.mutateAsync({ id: contact.id, customerId: customer.id });
    }
  };

  const handleSetPortalPassword = async () => {
    if (!passwordContact || !portalPassword || portalPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setIsSavingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('label-client-auth/set-password', {
        body: { contact_id: passwordContact.id, password: portalPassword },
      });
      if (error || data?.error) throw new Error(data?.error || 'Failed to set password');
      toast.success(`Portal password set for ${passwordContact.name}`);
      setPasswordContact(null);
      setPortalPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to set portal password');
    } finally {
      setIsSavingPassword(false);
    }
  };



  const handleArchiveConfirm = () => {
    if (onArchive) {
      onArchive(customer.id);
    }
    setArchiveDialogOpen(false);
  };

  const handleDeleteConfirm = () => {
    if (onDelete) {
      onDelete(customer.id);
    }
    setDeleteDialogOpen(false);
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
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={customer.is_active ? 'default' : 'secondary'}>
                {customer.is_active ? 'Active' : 'Archived'}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {contacts?.length || 0} contacts
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(customer)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Company
                  </DropdownMenuItem>
                )}
                {onArchive && customer.is_active && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setArchiveDialogOpen(true)}
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Archive Customer
                    </DropdownMenuItem>
                  </>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Permanently
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Quick summary */}
        {primaryContact && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Primary Contact</p>
            <p className="font-medium">{primaryContact.name}</p>
            <p className="text-sm text-muted-foreground">{primaryContact.email}</p>
          </div>
        )}
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="contacts" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="contacts" className="flex-1">
              Contacts ({contacts?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="details" className="flex-1">
              Company Details
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
                            <DropdownMenuItem onClick={() => { setPasswordContact(contact); setPortalPassword(''); }}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              Set Portal Password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
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
            <div className="flex justify-end">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={() => onEdit(customer)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Details
                </Button>
              )}
            </div>
            
            <div className="grid gap-4">
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
                <p>Last Updated: {new Date(customer.updated_at).toLocaleDateString()}</p>
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

      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive "{customer.company_name}" and hide it from the active customers list.
              The customer and all their contacts will still be available in the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{customer.company_name}" and all their contacts.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set Portal Password Dialog */}
      <AlertDialog open={!!passwordContact} onOpenChange={(open) => { if (!open) { setPasswordContact(null); setPortalPassword(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Set Portal Password
            </AlertDialogTitle>
            <AlertDialogDescription>
              Set a password for <strong>{passwordContact?.name}</strong> ({passwordContact?.email}) to access the client portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>New Password</Label>
            <Input
              type="password"
              value={portalPassword}
              onChange={(e) => setPortalPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="mt-1"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingPassword}>Cancel</AlertDialogCancel>
            <Button onClick={handleSetPortalPassword} disabled={isSavingPassword || portalPassword.length < 6}>
              {isSavingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Set Password
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
