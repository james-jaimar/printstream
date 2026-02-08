import { useEffect, useCallback, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Barcode, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { LabelStock } from '@/types/labels';

interface StockBarcodeScannerProps {
  onStockFound: (stock: LabelStock) => void;
  isActive: boolean;
}

export function StockBarcodeScanner({ onStockFound, isActive }: StockBarcodeScannerProps) {
  const [lastScan, setLastScan] = useState<{
    barcode: string;
    found: boolean;
    timestamp: Date;
  } | null>(null);

  const handleBarcodeDetected = useCallback(async (barcodeData: string) => {
    // Check if it's a label stock barcode (starts with LS-)
    if (!barcodeData.startsWith('LS-')) {
      console.log('Not a label stock barcode:', barcodeData);
      return;
    }

    console.log('Label stock barcode scanned:', barcodeData);

    // Look up stock by barcode
    const { data, error } = await supabase
      .from('label_stock')
      .select('*')
      .eq('barcode', barcodeData)
      .maybeSingle();

    if (error) {
      console.error('Error looking up stock:', error);
      setLastScan({ barcode: barcodeData, found: false, timestamp: new Date() });
      return;
    }

    if (data) {
      setLastScan({ barcode: barcodeData, found: true, timestamp: new Date() });
      onStockFound(data as unknown as LabelStock);
    } else {
      setLastScan({ barcode: barcodeData, found: false, timestamp: new Date() });
    }
  }, [onStockFound]);

  useEffect(() => {
    if (!isActive) return;

    let barcodeBuffer = '';
    let timeoutId: NodeJS.Timeout | null = null;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (event.key === 'Enter') {
        if (barcodeBuffer.length >= 5) {
          handleBarcodeDetected(barcodeBuffer.trim());
        }
        barcodeBuffer = '';
        return;
      }

      if (event.key.length === 1 && /[a-zA-Z0-9\-_]/.test(event.key)) {
        barcodeBuffer += event.key;

        timeoutId = setTimeout(() => {
          if (barcodeBuffer.length >= 5) {
            handleBarcodeDetected(barcodeBuffer.trim());
          }
          barcodeBuffer = '';
        }, 500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isActive, handleBarcodeDetected]);

  if (!isActive) return null;

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Barcode className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Barcode Scanner Active</p>
              <p className="text-xs text-muted-foreground">
                Scan a roll barcode to quickly find stock
              </p>
            </div>
          </div>
          <Badge variant="outline" className="animate-pulse">
            Listening
          </Badge>
        </div>

        {lastScan && (
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
            {lastScan.found ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Found: {lastScan.barcode}</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span>Not found: {lastScan.barcode}</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
