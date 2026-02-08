/**
 * Low Stock Alert Banner
 * Displays warning when substrate stock is below reorder level
 */

import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLowStockAlerts } from '@/hooks/labels/useLabelStock';

interface LowStockAlertProps {
  compact?: boolean;
}

export function LowStockAlert({ compact = false }: LowStockAlertProps) {
  const { data: lowStock, isLoading } = useLowStockAlerts();

  if (isLoading || !lowStock || lowStock.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <Link to="/labels/stock">
        <Alert variant="destructive" className="cursor-pointer hover:bg-destructive/10 transition-colors">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              <strong>{lowStock.length}</strong> substrate{lowStock.length !== 1 ? 's' : ''} below reorder level
            </span>
            <ExternalLink className="h-4 w-4" />
          </AlertDescription>
        </Alert>
      </Link>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Low Stock Warning</AlertTitle>
      <AlertDescription>
        <p className="mb-3">
          The following substrates are below their reorder levels:
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {lowStock.map((stock) => (
            <Badge
              key={stock.id}
              variant="outline"
              className="border-destructive text-destructive"
            >
              {stock.name} ({stock.current_stock_meters.toFixed(0)}m / {stock.reorder_level_meters}m)
            </Badge>
          ))}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/labels/stock">
            View Stock Management
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
