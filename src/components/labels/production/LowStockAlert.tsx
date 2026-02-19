/**
 * Low Stock Alert Banner
 * Collapsible warning when substrate stock is below reorder level
 */

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLowStockAlerts } from '@/hooks/labels/useLabelStock';

interface LowStockAlertProps {
  compact?: boolean;
}

export function LowStockAlert({ compact = false }: LowStockAlertProps) {
  const { data: lowStock, isLoading } = useLowStockAlerts();
  const [open, setOpen] = useState(false);

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
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="font-medium">
            Low Stock: <strong>{lowStock.length}</strong> item{lowStock.length !== 1 ? 's' : ''} below reorder level
          </span>
          <ChevronDown className={`h-4 w-4 ml-auto shrink-0 text-amber-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 px-3 py-2 rounded-b-lg border border-t-0 border-amber-200 bg-amber-50/50">
          <div className="flex flex-wrap gap-1.5">
            {lowStock.map((stock) => (
              <Badge
                key={stock.id}
                variant="outline"
                className="border-amber-300 text-amber-800 bg-white/60 text-xs"
              >
                {stock.name} ({stock.current_stock_meters.toFixed(0)}m / {stock.reorder_level_meters}m)
              </Badge>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
