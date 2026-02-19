import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download } from 'lucide-react';
import { useUpdateLabelStock } from '@/hooks/labels/useLabelStock';
import { mmToPoints } from '@/utils/pdf/pdfUnitHelpers';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { LabelStock } from '@/types/labels';

interface StockBarcodeModalProps {
  stock: LabelStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Generate a unique barcode value for a specific roll */
const generateRollBarcodeValue = (stock: LabelStock, rollNumber: number): string => {
  const abbr = stock.substrate_type.substring(0, 3).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `LS-${stock.width_mm}-${abbr}-R${rollNumber}-${random}`;
};

/** Calculate number of rolls from total stock and roll length */
const calculateRolls = (stock: LabelStock): number => {
  if (!stock.roll_length_meters || stock.roll_length_meters <= 0) return 1;
  return Math.ceil(stock.current_stock_meters / stock.roll_length_meters);
};

export function StockBarcodeModal({ stock, open, onOpenChange }: StockBarcodeModalProps) {
  const [rollData, setRollData] = useState<Array<{ barcode: string; qrDataURL: string; rollNumber: number; meters: number }>>([]);
  const [labelTimestamp, setLabelTimestamp] = useState('');
  const [saving, setSaving] = useState(false);
  const updateStockMutation = useUpdateLabelStock();

  // Generate barcodes + QR codes for each roll when modal opens
  useEffect(() => {
    if (!stock || !open) return;

    const totalRolls = calculateRolls(stock);
    const rollLength = stock.roll_length_meters || stock.current_stock_meters;
    const timestamp = new Date().toLocaleString();
    setLabelTimestamp(timestamp);

    const generateAll = async () => {
      const rolls: typeof rollData = [];
      let metersLeft = stock.current_stock_meters;

      for (let i = 1; i <= totalRolls; i++) {
        const metersOnRoll = Math.min(rollLength, metersLeft);
        metersLeft -= metersOnRoll;
        const barcode = generateRollBarcodeValue(stock, i);

        const qrPayload = JSON.stringify({
          barcode,
          stock_id: stock.id,
          name: stock.name,
          substrate_type: stock.substrate_type,
          width_mm: stock.width_mm,
          gsm: stock.gsm,
          roll_number: i,
          total_rolls: totalRolls,
          meters_remaining: metersOnRoll,
          generated_at: new Date().toISOString(),
        });

        const qrDataURL = await QRCode.toDataURL(qrPayload, {
          width: 200,
          margin: 1,
          color: { dark: '#000000', light: '#FFFFFF' },
        });

        rolls.push({ barcode, qrDataURL, rollNumber: i, meters: metersOnRoll });
      }
      setRollData(rolls);
    };

    generateAll().catch(console.error);
  }, [stock, open]);

  if (!stock) return null;

  const totalRolls = calculateRolls(stock);
  const gsmText = stock.gsm ? `${stock.gsm}gsm` : '';
  const subtitleParts = [stock.substrate_type, stock.finish, gsmText, `${stock.width_mm}mm`].filter(Boolean);

  const handleSaveAndPrint = async (mode: 'print' | 'download') => {
    setSaving(true);
    try {
      // Save first roll's barcode to DB for backward compat
      if (rollData.length > 0) {
        await updateStockMutation.mutateAsync({
          id: stock.id,
          updates: { barcode: rollData[0].barcode },
        });
      }

      const pdfBytes = await generateLabelPDF();

      if (mode === 'print') {
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.onload = () => printWindow.print();
        }
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `stock-labels-${stock.name.replace(/\s+/g, '-')}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error saving/printing label:', err);
    } finally {
      setSaving(false);
    }
  };

  const generateLabelPDF = async (): Promise<Uint8Array> => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const w = mmToPoints(100);
    const h = mmToPoints(50);
    const subtitle = subtitleParts.join(' • ');

    for (const roll of rollData) {
      const page = pdfDoc.addPage([w, h]);

      // Border
      page.drawRectangle({ x: 0, y: 0, width: w, height: h, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });

      // --- Left side: Text info ---
      const leftX = mmToPoints(5);
      let textY = h - mmToPoints(6);

      page.drawText(stock.name, { x: leftX, y: textY, size: 10, font: boldFont, color: rgb(0, 0, 0) });
      textY -= 12;

      page.drawText(subtitle, { x: leftX, y: textY, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
      textY -= 14;

      const rollInfo = `Roll ${roll.rollNumber} of ${totalRolls} | ${roll.meters.toFixed(0)}m`;
      page.drawText(rollInfo, { x: leftX, y: textY, size: 9, font: boldFont, color: rgb(0, 0, 0) });
      textY -= 12;

      page.drawText(roll.barcode, { x: leftX, y: textY, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
      textY -= 12;

      page.drawText(labelTimestamp, { x: leftX, y: textY, size: 6, font, color: rgb(0.5, 0.5, 0.5) });

      // --- Right side: QR code ---
      if (roll.qrDataURL) {
        const qrImageBytes = await fetch(roll.qrDataURL).then(r => r.arrayBuffer());
        const qrImage = await pdfDoc.embedPng(qrImageBytes);
        const qrSize = mmToPoints(28);
        const qrX = w - qrSize - mmToPoints(5);
        const qrY = (h - qrSize) / 2;
        page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
      }
    }

    return await pdfDoc.save();
  };

  const previewRoll = rollData[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Stock Roll Labels ({totalRolls} rolls)</DialogTitle>
          <DialogDescription>{subtitleParts.join(' • ')}</DialogDescription>
        </DialogHeader>

        {/* Label Preview - shows first roll as example */}
        {previewRoll && (
          <div
            className="mx-auto bg-white border border-border rounded-sm overflow-hidden"
            style={{ width: '400px', height: '200px', position: 'relative' }}
          >
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center px-5 py-4" style={{ width: '60%' }}>
              <p className="font-bold text-sm text-black leading-tight truncate">{stock.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{subtitleParts.join(' • ')}</p>
              <p className="font-bold text-base text-black mt-3">Roll {previewRoll.rollNumber} of {totalRolls} | {previewRoll.meters.toFixed(0)}m</p>
              <p className="text-[9px] text-muted-foreground mt-2 font-mono">{previewRoll.barcode}</p>
              <p className="text-[9px] text-muted-foreground mt-1">{labelTimestamp}</p>
            </div>
            <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center px-4" style={{ width: '40%' }}>
              <img src={previewRoll.qrDataURL} alt="QR Code" className="w-[120px] h-[120px]" />
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {totalRolls} label{totalRolls !== 1 ? 's' : ''} will be generated — one per roll ({stock.roll_length_meters}m each).
        </p>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => handleSaveAndPrint('download')} disabled={saving || rollData.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save & Download'}
          </Button>
          <Button onClick={() => handleSaveAndPrint('print')} disabled={saving || rollData.length === 0}>
            <Printer className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save & Print'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}