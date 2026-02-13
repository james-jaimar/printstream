import { FileText, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useThumbnailUrl } from '@/hooks/labels/useThumbnailUrl';
import type { LabelItem, PrintPdfStatus } from '@/types/labels';

interface PrintReadyItemCardProps {
  item: LabelItem;
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

export function PrintReadyItemCard({ item }: PrintReadyItemCardProps) {
  // Proof thumbnail: prefer proof_thumbnail_url, fall back to artwork_thumbnail_url
  const proofThumbPath = item.proof_thumbnail_url || item.artwork_thumbnail_url || null;
  const { url: proofThumbUrl, isLoading: proofLoading } = useThumbnailUrl(proofThumbPath);

  // Print-ready thumbnail: prefer artwork_thumbnail_url when print is ready, else null
  const printThumbPath = item.print_pdf_url
    ? (item.artwork_thumbnail_url || item.proof_thumbnail_url || null)
    : null;
  const { url: printThumbUrl, isLoading: printLoading } = useThumbnailUrl(printThumbPath);

  const printStatus = printStatusConfig[item.print_pdf_status || 'pending'];
  const PrintStatusIcon = printStatus.icon;

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
            <div className="p-2">
              {item.source_page_number && (
                <p className="text-[10px] text-muted-foreground">
                  Page {item.source_page_number}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
