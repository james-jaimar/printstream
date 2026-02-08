import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Package, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { useLabelStock, useAddStockTransaction } from '@/hooks/labels/useLabelStock';
import type { SubstrateType, FinishType, StockTransactionType } from '@/types/labels';

const substrateTypes: SubstrateType[] = ['Paper', 'PP', 'PE', 'PET', 'Vinyl'];
const finishTypes: FinishType[] = ['Gloss', 'Matt', 'Uncoated'];
const transactionTypes: { value: StockTransactionType; label: string }[] = [
  { value: 'receipt', label: 'Stock Receipt' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'waste', label: 'Waste' },
];

export default function LabelsStock() {
  const [search, setSearch] = useState('');
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transaction, setTransaction] = useState({
    type: 'receipt' as StockTransactionType,
    meters: 0,
    notes: '',
  });

  const { data: stock, isLoading } = useLabelStock();
  const addTransactionMutation = useAddStockTransaction();

  const filteredStock = stock?.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.substrate_type.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddTransaction = async () => {
    if (!selectedStock) return;
    
    await addTransactionMutation.mutateAsync({
      stock_id: selectedStock,
      transaction_type: transaction.type,
      meters: transaction.meters,
      notes: transaction.notes,
    });
    
    setIsTransactionOpen(false);
    setSelectedStock(null);
    setTransaction({ type: 'receipt', meters: 0, notes: '' });
  };

  const getStockLevel = (current: number, reorder: number) => {
    const percentage = (current / reorder) * 100;
    if (percentage <= 50) return 'critical';
    if (percentage <= 100) return 'low';
    return 'good';
  };

  const getProgressColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-destructive';
      case 'low': return 'bg-yellow-500';
      default: return 'bg-green-500';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock Management</h1>
          <p className="text-muted-foreground">
            Roll substrate inventory and tracking
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Stock Item
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search stock..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stock Grid */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading stock...</p>
      ) : filteredStock?.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No stock items found</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStock?.map((item) => {
            const stockLevel = getStockLevel(item.current_stock_meters, item.reorder_level_meters);
            const percentage = Math.min((item.current_stock_meters / item.reorder_level_meters) * 100, 200);
            
            return (
              <Card key={item.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <CardDescription>
                        {item.substrate_type} • {item.finish} • {item.width_mm}mm
                      </CardDescription>
                    </div>
                    {stockLevel === 'critical' && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Low
                      </Badge>
                    )}
                    {stockLevel === 'low' && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                        Reorder
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Stock Level */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Current Stock</span>
                        <span className="font-medium">
                          {item.current_stock_meters.toLocaleString()}m
                        </span>
                      </div>
                      <div className="relative">
                        <Progress 
                          value={Math.min(percentage, 100)} 
                          className="h-2"
                        />
                        <div 
                          className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor(stockLevel)}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Reorder at {item.reorder_level_meters.toLocaleString()}m
                      </p>
                    </div>

                    {/* Info */}
                    {item.gsm && (
                      <p className="text-sm text-muted-foreground">
                        {item.gsm}gsm
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Dialog open={isTransactionOpen && selectedStock === item.id} onOpenChange={(open) => {
                        setIsTransactionOpen(open);
                        if (!open) setSelectedStock(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => setSelectedStock(item.id)}
                          >
                            <TrendingUp className="h-4 w-4 mr-1" />
                            Add Stock
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Stock Transaction</DialogTitle>
                            <DialogDescription>
                              Record a stock movement for {item.name}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                              <Label>Transaction Type</Label>
                              <Select
                                value={transaction.type}
                                onValueChange={(v) => 
                                  setTransaction({ ...transaction, type: v as StockTransactionType })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {transactionTypes.map((t) => (
                                    <SelectItem key={t.value} value={t.value}>
                                      {t.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Meters</Label>
                              <Input
                                type="number"
                                value={transaction.meters}
                                onChange={(e) =>
                                  setTransaction({ ...transaction, meters: Number(e.target.value) })
                                }
                                min={0}
                                step={10}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Notes</Label>
                              <Input
                                value={transaction.notes}
                                onChange={(e) =>
                                  setTransaction({ ...transaction, notes: e.target.value })
                                }
                                placeholder="Optional notes..."
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button 
                              variant="outline" 
                              onClick={() => setIsTransactionOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleAddTransaction}
                              disabled={addTransactionMutation.isPending || transaction.meters <= 0}
                            >
                              {addTransactionMutation.isPending ? 'Saving...' : 'Save Transaction'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
