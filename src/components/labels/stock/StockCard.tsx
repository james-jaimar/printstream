import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingUp, Barcode, Eye } from 'lucide-react';
import type { LabelStock } from '@/types/labels';

interface StockCardProps {
  stock: LabelStock;
  onAddStock: (stockId: string) => void;
  onViewDetails: (stockId: string) => void;
  onPrintBarcode: (stock: LabelStock) => void;
}

export function StockCard({ stock, onAddStock, onViewDetails, onPrintBarcode }: StockCardProps) {
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

  const stockLevel = getStockLevel(stock.current_stock_meters, stock.reorder_level_meters);
  const percentage = Math.min((stock.current_stock_meters / stock.reorder_level_meters) * 100, 200);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{stock.name}</CardTitle>
            <CardDescription>
              {stock.substrate_type} • {stock.finish} • {stock.width_mm}mm
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {stockLevel === 'critical' && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Low
              </Badge>
            )}
            {stockLevel === 'low' && (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                Reorder
              </Badge>
            )}
            {stock.barcode && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Barcode className="h-3 w-3" />
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Stock Level */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Current Stock</span>
              <span className="font-medium">
                {stock.current_stock_meters.toLocaleString()}m
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
              Reorder at {stock.reorder_level_meters.toLocaleString()}m
            </p>
          </div>

          {/* Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {stock.gsm && <span>{stock.gsm}gsm</span>}
            {stock.roll_length_meters && <span>{stock.roll_length_meters}m rolls</span>}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => onAddStock(stock.id)}
            >
              <TrendingUp className="h-4 w-4 mr-1" />
              Add Stock
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onPrintBarcode(stock)}
            >
              <Barcode className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onViewDetails(stock.id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
