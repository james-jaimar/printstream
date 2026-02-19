import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { MoreHorizontal, TrendingUp, Eye, Barcode, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useDeleteLabelStock } from '@/hooks/labels/useLabelStock';
import type { LabelStock } from '@/types/labels';

interface StockListViewProps {
  stock: LabelStock[];
  onAddStock: (stockId: string) => void;
  onViewDetails: (stockId: string) => void;
  onPrintBarcode: (stock: LabelStock) => void;
  onEdit: (stock: LabelStock) => void;
}

export function StockListView({ stock, onAddStock, onViewDetails, onPrintBarcode, onEdit }: StockListViewProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteMutation = useDeleteLabelStock();

  const getStockLevel = (current: number, reorder: number) => {
    const pct = (current / reorder) * 100;
    if (pct <= 50) return 'critical';
    if (pct <= 100) return 'low';
    return 'good';
  };

  const getProgressColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-destructive';
      case 'low': return 'bg-yellow-500';
      default: return 'bg-green-500';
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteMutation.mutateAsync(deleteId);
    setDeleteId(null);
  };

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Finish</TableHead>
              <TableHead className="text-right">Width</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="w-[140px]">Level</TableHead>
              <TableHead className="text-right">Reorder</TableHead>
              <TableHead className="text-right">Cost/m</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stock.map((item) => {
              const level = getStockLevel(item.current_stock_meters, item.reorder_level_meters);
              const pct = Math.min((item.current_stock_meters / item.reorder_level_meters) * 100, 200);
              return (
                <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onViewDetails(item.id)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {item.name}
                      {item.barcode && (
                        <Badge variant="outline" className="text-xs px-1">
                          <Barcode className="h-3 w-3" />
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.substrate_type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.finish}</TableCell>
                  <TableCell className="text-right">{item.width_mm}mm</TableCell>
                  <TableCell className="text-right font-medium">
                    <div className="flex items-center justify-end gap-1">
                      {level === 'critical' && <AlertTriangle className="h-3 w-3 text-destructive" />}
                      {item.current_stock_meters.toLocaleString()}m
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`absolute top-0 left-0 h-full rounded-full transition-all ${getProgressColor(level)}`}
                        style={{ width: `${Math.min(pct / 2, 100)}%` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {item.reorder_level_meters.toLocaleString()}m
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {item.cost_per_meter ? `R${item.cost_per_meter.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddStock(item.id); }}>
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Add Stock
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewDetails(item.id); }}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPrintBarcode(item); }}>
                          <Barcode className="h-4 w-4 mr-2" />
                          Print Barcode
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(item); }}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            {stock.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No stock items found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stock Item</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this stock item and all its transaction history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
