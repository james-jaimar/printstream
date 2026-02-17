import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Search, Filter, Eye, Trash2, Upload, Loader2 } from 'lucide-react';
import { useLabelOrders, useDeleteLabelOrder } from '@/hooks/labels/useLabelOrders';
import { NewLabelOrderDialog } from '@/components/labels/NewLabelOrderDialog';
import { LabelOrderModal } from '@/components/labels/order/LabelOrderModal';
import { format } from 'date-fns';
import type { LabelOrderStatus } from '@/types/labels';

const glassCard = 'rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur';

const statusOptions: { value: LabelOrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'quote', label: 'Quote' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_production', label: 'In Production' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const statusColors: Record<LabelOrderStatus, string> = {
  quote: 'bg-gray-100 text-gray-800',
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  in_production: 'bg-blue-100 text-blue-800',
  completed: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function LabelsOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const deleteOrder = useDeleteLabelOrder();
  
  const statusFilter = (searchParams.get('status') as LabelOrderStatus | null) || undefined;
  const { data: orders, isLoading } = useLabelOrders(statusFilter);

  const filteredOrders = orders?.filter((order) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(searchLower) ||
      order.customer_name.toLowerCase().includes(searchLower) ||
      order.quickeasy_wo_no?.toLowerCase().includes(searchLower)
    );
  });

  const handleStatusChange = (value: string) => {
    if (value === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', value);
    }
    setSearchParams(searchParams);
  };

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Label Orders</h1>
          <p className="text-sm text-slate-500">
            Manage quotes, orders, and production jobs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Import from Quickeasy
          </Button>
          <NewLabelOrderDialog 
            onSuccess={(orderId) => setSelectedOrderId(orderId)} 
          />
        </div>
      </div>

      {/* Filters */}
      <Card className={glassCard}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter || 'all'}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card className={glassCard}>
        <CardHeader>
          <CardTitle className="text-slate-900">Orders ({filteredOrders?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading orders...</p>
          ) : filteredOrders?.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No orders found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>WO No</TableHead>
                  <TableHead>Labels</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders?.map((order) => (
                  <TableRow 
                    key={order.id} 
                    className="cursor-pointer hover:bg-slate-50/60"
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <TableCell className="font-medium">
                      <span className="text-[#00B8D4] hover:underline">
                        {order.order_number}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-slate-900">{order.customer_name}</p>
                        {order.contact_name && (
                          <p className="text-xs text-slate-500">{order.contact_name}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{order.quickeasy_wo_no || '-'}</TableCell>
                    <TableCell>{order.total_label_count.toLocaleString()}</TableCell>
                    <TableCell>
                      {order.due_date ? format(new Date(order.due_date), 'dd MMM yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[order.status]}>
                        {order.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedOrderId(order.id); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}>
                              {deletingOrderId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Order?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete order <strong>{order.order_number}</strong>
                                {order.customer_name && ` for ${order.customer_name}`}.
                                All associated items, runs, and files will also be deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingOrderId(order.id);
                                  deleteOrder.mutate(order.id, { onSettled: () => setDeletingOrderId(null) });
                                }}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      <LabelOrderModal
        orderId={selectedOrderId || ''}
        open={!!selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />
    </div>
  );
}
