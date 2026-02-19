import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, User, ChevronsUpDown, Check } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { DielineCombobox } from '@/components/labels/DielineCombobox';
import { OrientationPicker } from '@/components/labels/OrientationPicker';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCreateLabelOrder } from '@/hooks/labels/useLabelOrders';
import { useLabelDielines } from '@/hooks/labels/useLabelDielines';
import { useLabelStock } from '@/hooks/labels/useLabelStock';
import { useLabelCustomers } from '@/hooks/labels/useClientPortal';
import { useCustomerContacts, CustomerContact } from '@/hooks/labels/useCustomerContacts';
import { LABEL_PRINT_CONSTANTS, INK_CONFIG_LABELS, INK_CONFIG_SPEEDS } from '@/types/labels';
import type { LabelInkConfig } from '@/types/labels';

const formSchema = z.object({
  customer_id: z.string().optional(),
  customer_name: z.string().min(1, 'Customer name is required'),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  quickeasy_wo_no: z.string().optional(),
  dieline_id: z.string().optional(),
  roll_width_mm: z.number().optional(),
  substrate_id: z.string().optional(),
  ink_config: z.enum(['CMY', 'CMYK', 'CMYKW', 'CMYKO']).default('CMYK'),
  due_date: z.date().optional(),
  notes: z.string().optional(),
  orientation: z.number().min(1).max(8).default(1),
});

type FormData = z.infer<typeof formSchema>;

interface NewLabelOrderDialogProps {
  onSuccess?: (orderId: string) => void;
}

export function NewLabelOrderDialog({ onSuccess }: NewLabelOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const createOrder = useCreateLabelOrder();
  const { data: dielines } = useLabelDielines();
  const { data: stock } = useLabelStock();
  const { data: customers } = useLabelCustomers();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customer_name: '',
      contact_name: '',
      contact_email: '',
      quickeasy_wo_no: '',
      notes: '',
      orientation: 1,
      ink_config: 'CMYK' as LabelInkConfig,
    },
  });

  const selectedCustomerId = form.watch('customer_id');
  const { data: contacts, isLoading: contactsLoading } = useCustomerContacts(selectedCustomerId);

  // Track which customer we've already auto-initialized to prevent re-running
  const autoSelectedCustomerRef = useRef<string | null>(null);

  // Stable reference to setValue to avoid dependency on entire form object
  const setValue = useCallback(form.setValue, []);

  // Reset selected contacts when customer changes - runs once per customer
  useEffect(() => {
    // If no customer selected, clear everything
    if (!selectedCustomerId) {
      setSelectedContacts([]);
      autoSelectedCustomerRef.current = null;
      return;
    }

    // Skip if we've already auto-selected for this customer
    if (autoSelectedCustomerRef.current === selectedCustomerId) {
      return;
    }
    
    // Wait for contacts to finish loading
    if (contactsLoading) {
      return;
    }

    // Mark this customer as initialized (do this before setting values)
    autoSelectedCustomerRef.current = selectedCustomerId;

    // Find and auto-select primary contact
    const primaryContact = contacts?.find(c => c.is_primary && c.is_active);
    if (primaryContact) {
      setSelectedContacts([primaryContact.id]);
      setValue('contact_name', primaryContact.name);
      setValue('contact_email', primaryContact.email);
    } else {
      setSelectedContacts([]);
      setValue('contact_name', '');
      setValue('contact_email', '');
    }
  }, [selectedCustomerId, contacts, contactsLoading, setValue]);

  const toggleContact = (contactId: string) => {
    setSelectedContacts(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const selectedDieline = dielines?.find(d => d.id === form.watch('dieline_id'));

  async function onSubmit(data: FormData) {
    try {
      const result = await createOrder.mutateAsync({
        customer_id: data.customer_id || undefined,
        customer_name: data.customer_name,
        contact_name: data.contact_name || undefined,
        contact_email: data.contact_email || undefined,
        quickeasy_wo_no: data.quickeasy_wo_no || undefined,
        dieline_id: data.dieline_id || undefined,
        roll_width_mm: data.roll_width_mm || selectedDieline?.roll_width_mm,
        substrate_id: data.substrate_id || undefined,
        due_date: data.due_date?.toISOString().split('T')[0],
        notes: data.notes || undefined,
        orientation: data.orientation ?? 1,
        ink_config: data.ink_config,
      });
      
      setOpen(false);
      form.reset();
      onSuccess?.(result.id);
    } catch (error) {
      // Error handled by mutation
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </DialogTrigger>
      <DialogContent 
        className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Create Label Order</DialogTitle>
          <DialogDescription>
            Start a new label printing order. You can add artwork items after creating the order.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Customer Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Customer Information</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer *</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          const customer = customers?.find(c => c.id === value);
                          if (customer) {
                            form.setValue('customer_name', customer.company_name);
                          }
                        }} 
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers?.filter(c => c.is_active).map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.company_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quickeasy_wo_no"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quickeasy WO#</FormLabel>
                      <FormControl>
                        <Input placeholder="WO-12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Hidden field for customer_name - populated from selection */}
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <input type="hidden" {...field} />
                )}
              />

              {/* Contact Selection */}
              {selectedCustomerId && contacts && contacts.length > 0 && (
                <div className="space-y-2">
                  <FormLabel>Select Contacts for this Order</FormLabel>
                  <div className="border rounded-lg p-3 space-y-2 max-h-[200px] overflow-y-auto">
                    {contacts.filter(c => c.is_active).map((contact) => (
                      <div 
                        key={contact.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors",
                          selectedContacts.includes(contact.id) 
                            ? "bg-primary/10 border border-primary/30" 
                            : "hover:bg-muted"
                        )}
                        onClick={() => toggleContact(contact.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox 
                              checked={selectedContacts.includes(contact.id)}
                              onCheckedChange={() => toggleContact(contact.id)}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium text-sm flex items-center gap-2">
                                {contact.name}
                                {contact.is_primary && (
                                  <Badge variant="secondary" className="text-xs">Primary</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{contact.email}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {contact.receives_proofs && (
                            <Badge variant="outline" className="text-xs">Proofs</Badge>
                          )}
                          {contact.can_approve_proofs && (
                            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">Can Approve</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedContacts.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              {selectedCustomerId && (!contacts || contacts.length === 0) && (
                <p className="text-sm text-muted-foreground italic">
                  No contacts found for this customer. You can add contacts later.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Contact Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Smith" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Contact Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Print Specifications */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Print Specifications</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dieline_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dieline Template</FormLabel>
                      <DielineCombobox
                        dielines={dielines ?? []}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="roll_width_mm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Roll Width (mm)</FormLabel>
                      <Select 
                        onValueChange={(v) => field.onChange(Number(v))} 
                        value={field.value?.toString() || selectedDieline?.roll_width_mm?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select width" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LABEL_PRINT_CONSTANTS.ROLL_WIDTHS_MM.map((width) => (
                            <SelectItem key={width} value={width.toString()}>
                              {width}mm
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="substrate_id"
                render={({ field }) => {
                  const activeStock = stock?.filter(s => s.is_active) || [];
                  const selectedSubstrate = activeStock.find(s => s.id === field.value);
                  // Group by width
                  const groupedByWidth = activeStock.reduce((acc, s) => {
                    const key = `${s.width_mm}mm`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(s);
                    return acc;
                  }, {} as Record<string, typeof activeStock>);
                  const sortedWidths = Object.keys(groupedByWidth).sort((a, b) => parseInt(a) - parseInt(b));

                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>Substrate</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {selectedSubstrate
                                ? `${selectedSubstrate.name} - ${selectedSubstrate.width_mm}mm (${selectedSubstrate.current_stock_meters}m)`
                                : "Select substrate"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start"
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <Command>
                            <CommandInput placeholder="Search substrates..." />
                            <CommandList>
                              <CommandEmpty>No substrate found.</CommandEmpty>
                              {sortedWidths.map((width) => (
                                <CommandGroup key={width} heading={`${width} Roll`}>
                                  {groupedByWidth[width].map((substrate) => (
                                    <CommandItem
                                      key={substrate.id}
                                      value={`${substrate.name} ${substrate.width_mm}mm ${substrate.finish} ${substrate.substrate_type}`}
                                      onSelect={() => field.onChange(substrate.id)}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.value === substrate.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <span className="flex-1">{substrate.name}</span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        {substrate.current_stock_meters}m available
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="ink_config"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ink Configuration</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select ink config" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.keys(INK_CONFIG_LABELS) as LabelInkConfig[]).map((key) => (
                          <SelectItem key={key} value={key}>
                            {INK_CONFIG_LABELS[key]} — {INK_CONFIG_SPEEDS[key]} m/min
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Label Orientation */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Label Orientation (Rewind Direction)</h3>
              <p className="text-xs text-muted-foreground">Select how the labels will be wound on the roll. Default is #1 — Outwound / Head to Lead.</p>
              <OrientationPicker
                value={form.watch('orientation') ?? 1}
                onChange={(v) => form.setValue('orientation', v)}
                size="sm"
              />
            </div>

            {/* Scheduling */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Scheduling</h3>
              
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Due Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-[240px] pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any special instructions or notes..."
                      className="min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createOrder.isPending}>
                {createOrder.isPending ? 'Creating...' : 'Create Order'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
