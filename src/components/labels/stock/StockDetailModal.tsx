import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Clock, Package, Barcode, AlertTriangle } from 'lucide-react';
import { useLabelStockItem, useLabelStockTransactions } from '@/hooks/labels/useLabelStock';
import type { LabelStockTransaction } from '@/types/labels';

interface StockDetailModalProps {
  stockId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrintBarcode: () => void;
  onAddTransaction: () => void;
}

export function StockDetailModal({ 
  stockId, 
  open, 
  onOpenChange, 
  onPrintBarcode,
  onAddTransaction 
}: StockDetailModalProps) {
  const { data: stock, isLoading: stockLoading } = useLabelStockItem(stockId ?? undefined);
  const { data: transactions, isLoading: txLoading } = useLabelStockTransactions(stockId ?? undefined);

  const getTransactionIcon = (type: LabelStockTransaction['transaction_type']) => {
    switch (type) {
      case 'receipt': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'usage': return <TrendingDown className="h-4 w-4 text-blue-500" />;
      case 'waste': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default: return <Package className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTransactionBadge = (type: LabelStockTransaction['transaction_type']) => {
    switch (type) {
      case 'receipt': return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Receipt</Badge>;
      case 'usage': return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Usage</Badge>;
      case 'waste': return <Badge variant="destructive">Waste</Badge>;
      default: return <Badge variant="outline">Adjustment</Badge>;
    }
  };

  if (!stockId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {stock?.name ?? 'Loading...'}
          </DialogTitle>
          <DialogDescription>
            {stock ? `${stock.substrate_type} • ${stock.finish} • ${stock.width_mm}mm` : ''}
          </DialogDescription>
        </DialogHeader>

        {stockLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : stock ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Stock Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Current Stock</p>
                  <p className="text-2xl font-bold">{stock.current_stock_meters.toLocaleString()}m</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Reorder Level</p>
                  <p className="text-2xl font-bold">{stock.reorder_level_meters.toLocaleString()}m</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Roll Length</p>
                  <p className="text-lg">{stock.roll_length_meters}m</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Weight</p>
                  <p className="text-lg">{stock.gsm ? `${stock.gsm}gsm` : 'N/A'}</p>
                </div>
                {stock.cost_per_meter && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Cost per Meter</p>
                    <p className="text-lg">R{stock.cost_per_meter.toFixed(2)}</p>
                  </div>
                )}
                {stock.supplier && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Supplier</p>
                    <p className="text-lg">{stock.supplier}</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Barcode Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Barcode</p>
                    <p className="text-sm text-muted-foreground">
                      {stock.barcode ?? 'No barcode assigned'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={onPrintBarcode}>
                    <Barcode className="h-4 w-4 mr-2" />
                    Print Label
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={onAddTransaction} className="flex-1">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Add Transaction
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="transactions" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                {txLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Loading transactions...</div>
                ) : transactions?.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">No transactions recorded</div>
                ) : (
                  <div className="space-y-3">
                    {transactions?.map((tx) => (
                      <div 
                        key={tx.id} 
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-3">
                          {getTransactionIcon(tx.transaction_type)}
                          <div>
                            <div className="flex items-center gap-2">
                              {getTransactionBadge(tx.transaction_type)}
                              <span className="font-medium">
                                {tx.transaction_type === 'usage' || tx.transaction_type === 'waste' ? '-' : '+'}
                                {tx.meters}m
                              </span>
                            </div>
                            {tx.notes && (
                              <p className="text-sm text-muted-foreground mt-1">{tx.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(tx.created_at), 'dd MMM HH:mm')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
