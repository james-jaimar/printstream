import { useRef, useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';
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
import { Printer, Download, RefreshCw } from 'lucide-react';
import { useUpdateLabelStock } from '@/hooks/labels/useLabelStock';
import type { LabelStock } from '@/types/labels';

interface StockBarcodeModalProps {
  stock: LabelStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockBarcodeModal({ stock, open, onOpenChange }: StockBarcodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [customBarcode, setCustomBarcode] = useState('');
  const updateStockMutation = useUpdateLabelStock();

  // Generate barcode value if none exists
  const generateBarcodeValue = () => {
    if (!stock) return '';
    // Format: LS-{width}-{substrate_type_abbr}-{random}
    const abbr = stock.substrate_type.substring(0, 3).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `LS-${stock.width_mm}-${abbr}-${random}`;
  };

  const barcodeValue = stock?.barcode || customBarcode || generateBarcodeValue();

  useEffect(() => {
    if (canvasRef.current && barcodeValue && open) {
      try {
        JsBarcode(canvasRef.current, barcodeValue, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (error) {
        console.error('Barcode generation error:', error);
      }
    }
  }, [barcodeValue, open]);

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const stockInfo = stock ? `
      <p style="margin: 0; font-weight: bold; font-size: 14px;">${stock.name}</p>
      <p style="margin: 4px 0; color: #666; font-size: 12px;">${stock.substrate_type} • ${stock.finish} • ${stock.width_mm}mm</p>
    ` : '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Stock Barcode - ${stock?.name || 'Unknown'}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
              font-family: system-ui, sans-serif;
            }
            .label {
              text-align: center;
              padding: 16px;
              border: 1px dashed #ccc;
            }
            @media print {
              .label { border: none; }
            }
          </style>
        </head>
        <body>
          <div class="label">
            ${stockInfo}
            <img src="${canvas.toDataURL('image/png')}" alt="Barcode" style="margin-top: 8px;" />
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `barcode-${stock?.name || 'stock'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleSaveBarcode = async () => {
    if (!stock || !barcodeValue) return;
    
    await updateStockMutation.mutateAsync({
      id: stock.id,
      updates: { barcode: barcodeValue },
    });
  };

  const handleGenerateNew = () => {
    setCustomBarcode(generateBarcodeValue());
  };

  if (!stock) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Roll Barcode</DialogTitle>
          <DialogDescription>
            {stock.name} - {stock.substrate_type} {stock.width_mm}mm
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Barcode Preview */}
          <div className="flex justify-center p-4 bg-white rounded-lg border">
            <canvas ref={canvasRef} />
          </div>

          {/* Barcode Value Input */}
          <div className="space-y-2">
            <Label>Barcode Value</Label>
            <div className="flex gap-2">
              <Input
                value={barcodeValue}
                onChange={(e) => setCustomBarcode(e.target.value)}
                placeholder="Enter or generate barcode..."
              />
              <Button variant="outline" size="icon" onClick={handleGenerateNew}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {stock.barcode ? 'Current saved barcode' : 'Barcode not yet saved to stock'}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!stock.barcode && (
            <Button 
              variant="outline" 
              onClick={handleSaveBarcode}
              disabled={updateStockMutation.isPending}
            >
              {updateStockMutation.isPending ? 'Saving...' : 'Save to Stock'}
            </Button>
          )}
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
