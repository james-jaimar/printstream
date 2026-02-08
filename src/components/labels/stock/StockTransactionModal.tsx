import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAddStockTransaction, useLabelStockItem } from '@/hooks/labels/useLabelStock';
import type { StockTransactionType } from '@/types/labels';

const transactionTypes: { value: StockTransactionType; label: string; description: string }[] = [
  { value: 'receipt', label: 'Stock Receipt', description: 'New stock received from supplier' },
  { value: 'adjustment', label: 'Adjustment', description: 'Stock count correction' },
  { value: 'waste', label: 'Waste', description: 'Damaged or unusable stock' },
];

interface StockTransactionModalProps {
  stockId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockTransactionModal({ stockId, open, onOpenChange }: StockTransactionModalProps) {
  const [transaction, setTransaction] = useState({
    type: 'receipt' as StockTransactionType,
    meters: 0,
    notes: '',
  });

  const { data: stock } = useLabelStockItem(stockId ?? undefined);
  const addTransactionMutation = useAddStockTransaction();

  const handleSubmit = async () => {
    if (!stockId || transaction.meters <= 0) return;

    await addTransactionMutation.mutateAsync({
      stock_id: stockId,
      transaction_type: transaction.type,
      meters: transaction.meters,
      notes: transaction.notes,
    });

    setTransaction({ type: 'receipt', meters: 0, notes: '' });
    onOpenChange(false);
  };

  const handleClose = () => {
    setTransaction({ type: 'receipt', meters: 0, notes: '' });
    onOpenChange(false);
  };

  const selectedType = transactionTypes.find((t) => t.value === transaction.type);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stock Transaction</DialogTitle>
          <DialogDescription>
            {stock ? `Record a stock movement for ${stock.name}` : 'Loading...'}
          </DialogDescription>
        </DialogHeader>

        {stock && (
          <div className="grid gap-4 py-4">
            {/* Current Stock Info */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Stock</span>
                <span className="font-medium">{stock.current_stock_meters.toLocaleString()}m</span>
              </div>
            </div>

            {/* Transaction Type */}
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <Select
                value={transaction.type}
                onValueChange={(v) => setTransaction({ ...transaction, type: v as StockTransactionType })}
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
              {selectedType && (
                <p className="text-xs text-muted-foreground">{selectedType.description}</p>
              )}
            </div>

            {/* Meters */}
            <div className="space-y-2">
              <Label>Meters</Label>
              <Input
                type="number"
                value={transaction.meters || ''}
                onChange={(e) => setTransaction({ ...transaction, meters: Number(e.target.value) })}
                min={0}
                step={10}
                placeholder="Enter meters..."
              />
              {transaction.type === 'receipt' && stock.roll_length_meters && (
                <p className="text-xs text-muted-foreground">
                  Standard roll: {stock.roll_length_meters}m
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={transaction.notes}
                onChange={(e) => setTransaction({ ...transaction, notes: e.target.value })}
                placeholder="Add notes about this transaction..."
                rows={2}
              />
            </div>

            {/* Preview */}
            {transaction.meters > 0 && (
              <div className="p-3 rounded-lg border bg-card">
                <div className="flex items-center justify-between">
                  <span className="text-sm">New Stock Level</span>
                  <span className="font-medium">
                    {transaction.type === 'receipt' || transaction.type === 'adjustment'
                      ? (stock.current_stock_meters + transaction.meters).toLocaleString()
                      : (stock.current_stock_meters - transaction.meters).toLocaleString()}
                    m
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={addTransactionMutation.isPending || transaction.meters <= 0}
          >
            {addTransactionMutation.isPending ? 'Saving...' : 'Save Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
