import { useState, useMemo } from 'react';
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
import { MoreHorizontal, TrendingUp, Eye, Barcode, Pencil, Trash2, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useDeleteLabelStock } from '@/hooks/labels/useLabelStock';
import type { LabelStock } from '@/types/labels';

interface StockListViewProps {
  stock: LabelStock[];
  onAddStock: (stockId: string) => void;
  onViewDetails: (stockId: string) => void;
  onPrintBarcode: (stock: LabelStock) => void;
  onEdit: (stock: LabelStock) => void;
}

type SortKey = 'name' | 'substrate_type' | 'finish' | 'glue_type' | 'width_mm' | 'current_stock_meters' | 'reorder_level_meters' | 'cost_per_meter';
type SortDir = 'asc' | 'desc';

const SUBSTRATE_COLORS: Record<string, string> = {
  'PP': 'bg-blue-100 text-blue-800 border-blue-200',
  'PE': 'bg-purple-100 text-purple-800 border-purple-200',
  'PET': 'bg-teal-100 text-teal-800 border-teal-200',
  'Vinyl': 'bg-orange-100 text-orange-800 border-orange-200',
  'Semi Gloss': 'bg-pink-100 text-pink-800 border-pink-200',
  'Paper': 'bg-amber-100 text-amber-800 border-amber-200',
};

const GLUE_COLORS: Record<string, string> = {
  'Hot Melt': 'bg-red-100 text-red-800 border-red-200',
  'Acrylic': 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

export function StockListView({ stock, onAddStock, onViewDetails, onPrintBarcode, onEdit }: StockListViewProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const deleteMutation = useDeleteLabelStock();

  const compareValues = (aVal: unknown, bVal: unknown): number => {
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    return typeof aVal === 'string' ? (aVal as string).localeCompare(bVal as string) : (aVal as number) - (bVal as number);
  };

  const sortedStock = useMemo(() => {
    if (!sortKey) return stock;
    // Secondary sort chains: name → glue_type → width_mm
    const secondarySorts: Partial<Record<SortKey, SortKey[]>> = {
      name: ['glue_type', 'width_mm'],
      glue_type: ['name', 'width_mm'],
      substrate_type: ['name', 'glue_type', 'width_mm'],
    };
    const extras = secondarySorts[sortKey] ?? [];

    return [...stock].sort((a, b) => {
      const primary = compareValues(a[sortKey], b[sortKey]);
      const primaryResult = sortDir === 'asc' ? primary : -primary;
      if (primaryResult !== 0) return primaryResult;

      for (const key of extras) {
        const cmp = compareValues(a[key], b[key]);
        if (cmp !== 0) return cmp; // secondary sorts always ascending
      }
      return 0;
    });
  }, [stock, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

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
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')}>
                <div className="flex items-center">Name <SortIcon column="name" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('substrate_type')}>
                <div className="flex items-center">Type <SortIcon column="substrate_type" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('finish')}>
                <div className="flex items-center">Finish <SortIcon column="finish" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('glue_type')}>
                <div className="flex items-center">Glue <SortIcon column="glue_type" /></div>
              </TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('width_mm')}>
                <div className="flex items-center justify-end">Width <SortIcon column="width_mm" /></div>
              </TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('current_stock_meters')}>
                <div className="flex items-center justify-end">Stock <SortIcon column="current_stock_meters" /></div>
              </TableHead>
              <TableHead className="w-[140px]">Level</TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('reorder_level_meters')}>
                <div className="flex items-center justify-end">Reorder <SortIcon column="reorder_level_meters" /></div>
              </TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('cost_per_meter')}>
                <div className="flex items-center justify-end">Cost/m <SortIcon column="cost_per_meter" /></div>
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStock.map((item) => {
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
                    <Badge className={`border ${SUBSTRATE_COLORS[item.substrate_type] ?? 'bg-secondary text-secondary-foreground'}`}>
                      {item.substrate_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.finish}</TableCell>
                  <TableCell>
                    {item.glue_type ? (
                      <Badge className={`border ${GLUE_COLORS[item.glue_type] ?? 'bg-secondary text-secondary-foreground'}`}>
                        {item.glue_type}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
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
                    <DropdownMenu modal={false}>
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
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
