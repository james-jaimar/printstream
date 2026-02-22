import { FileText, CheckCircle, XCircle, Loader2, AlertTriangle, Trash2, Upload, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useThumbnailUrl } from '@/hooks/labels/useThumbnailUrl';
import type { LabelItem, PrintPdfStatus } from '@/types/labels';

interface PrintReadyItemCardProps {
  item: LabelItem;
  onDeletePrintFile?: (itemId: string) => void;
  onReplacePrintFile?: (itemId: string) => void;
  isUnmatched?: boolean;
  availableProofItems?: LabelItem[];
  onLinkToProof?: (printItemId: string, proofItemId: string) => void;
}

const printStatusConfig: Record<PrintPdfStatus, {
  icon: typeof CheckCircle;
  color: string;
  bgColor: string;
  label: string;
}> = {
  ready: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100', label: 'Ready' },
  pending: { icon: XCircle, color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Not Ready' },
  processing: { icon: Loader2, color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Processing' },
  needs_crop: { icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-100', label: 'Needs Crop' },
};

export function PrintReadyItemCard({ item, onDeletePrintFile, onReplacePrintFile, isUnmatched, availableProofItems, onLinkToProof }: PrintReadyItemCardProps) {
  // Proof thumbnail: prefer proof_thumbnail_url, fall back to artwork_thumbnail_url
  const proofThumbPath = item.proof_thumbnail_url || item.artwork_thumbnail_url || null;
  const { url: proofThumbUrl, isLoading: proofLoading } = useThumbnailUrl(proofThumbPath);

  // Print-ready thumbnail: ONLY use print_thumbnail_url (no proof fallback)
  const printThumbPath = item.print_pdf_url
    ? (item.print_thumbnail_url || null)
    : null;
  const { url: printThumbUrl, isLoading: printLoading } = useThumbnailUrl(printThumbPath);

  const printStatus = printStatusConfig[item.print_pdf_status || 'pending'];
  const PrintStatusIcon = printStatus.icon;
  const hasPrintFile = !!item.print_pdf_url;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex">
          {/* Left: Proof */}
          <div className="w-2/5 border-r">
            <div className="relative aspect-[4/3] bg-muted flex items-center justify-center">
              {proofLoading ? (
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              ) : proofThumbUrl ? (
                <img src={proofThumbUrl} alt={`${item.name} proof`} className="w-full h-full object-contain" />
              ) : (
                <FileText className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="absolute top-1 left-1 text-[10px] font-medium text-muted-foreground bg-background/80 px-1 rounded">
                PROOF
              </span>
            </div>
            <div className="p-2 space-y-1">
              <p className="text-xs font-medium truncate" title={item.name}>{item.name}</p>
              <p className="text-sm font-semibold text-foreground">
                Qty: {item.quantity.toLocaleString()}
              </p>
              {(item.width_mm || item.height_mm) && (
                <p className="text-[10px] text-muted-foreground">
                  {Number(item.width_mm).toFixed(1)}×{Number(item.height_mm).toFixed(1)}mm
                </p>
              )}
            </div>
          </div>

          {/* Right: Print-Ready */}
          <div className="w-3/5">
            <div className="relative aspect-[4/3] bg-muted flex items-center justify-center">
              {printLoading ? (
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              ) : printThumbUrl ? (
                <img src={printThumbUrl} alt={`${item.name} print-ready`} className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <FileText className="h-8 w-8" />
                  <span className="text-[10px]">No print file</span>
                </div>
              )}
              <span className="absolute top-1 left-1 text-[10px] font-medium text-muted-foreground bg-background/80 px-1 rounded">
                PRINT
              </span>
              <Badge
                className={cn(
                  "absolute top-1 right-1 gap-1 text-[10px]",
                  printStatus.bgColor,
                  printStatus.color,
                  "border-0"
                )}
              >
                <PrintStatusIcon className={cn("h-3 w-3", item.print_pdf_status === 'processing' && "animate-spin")} />
                {printStatus.label}
              </Badge>
            </div>
            <div className="p-2 flex items-center justify-between">
              <div>
                {item.source_page_number && (
                  <p className="text-[10px] text-muted-foreground">
                    Page {item.source_page_number}
                  </p>
                )}
              </div>
              {/* CRUD Controls */}
              <div className="flex items-center gap-1">
                {onReplacePrintFile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Replace print file"
                    onClick={() => onReplacePrintFile(item.id)}
                  >
                    <Upload className="h-3 w-3" />
                  </Button>
                )}
                {hasPrintFile && onDeletePrintFile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    title="Remove print file"
                    onClick={() => onDeletePrintFile(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
        {isUnmatched && availableProofItems && availableProofItems.length > 0 && onLinkToProof && (
          <div className="border-t px-2 py-1.5 bg-amber-50 dark:bg-amber-950/30">
            <div className="flex items-center gap-1.5">
              <Link2 className="h-3 w-3 text-amber-600 shrink-0" />
              <Select onValueChange={(proofId) => onLinkToProof(item.id, proofId)}>
                <SelectTrigger className="h-6 text-[10px] flex-1">
                  <SelectValue placeholder="Link to proof item…" />
                </SelectTrigger>
                <SelectContent>
                  {availableProofItems.map((proofItem) => (
                    <SelectItem key={proofItem.id} value={proofItem.id} className="text-xs">
                      {proofItem.name} (Qty: {proofItem.quantity.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
