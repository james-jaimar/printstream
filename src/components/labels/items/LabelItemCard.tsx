import { useState, useEffect } from 'react';
import { FileText, Trash2, AlertTriangle, CheckCircle, XCircle, Info, ChevronDown, ChevronUp, Loader2, Crop, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useThumbnailUrl } from '@/hooks/labels/useThumbnailUrl';
import type { LabelItem, PrintPdfStatus } from '@/types/labels';

type ValidationStatus = 'passed' | 'no_bleed' | 'too_large' | 'too_small' | 'needs_crop' | 'pending';

interface LabelItemCardProps {
  item: LabelItem;
  onQuantityChange: (quantity: number) => void;
  onDelete: () => void;
  onNameChange?: (name: string) => void;
  validationStatus?: ValidationStatus;
  validationIssues?: string[];
  thumbnailUrl?: string;
  onPrepareArtwork?: (action: 'crop' | 'use_proof_as_print') => void;
  isProcessing?: boolean;
}

const statusConfig: Record<ValidationStatus, {
  icon: typeof CheckCircle;
  color: string;
  bgColor: string;
  label: string;
}> = {
  passed: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100', label: 'Ready' },
  no_bleed: { icon: AlertTriangle, color: 'text-yellow-600', bgColor: 'bg-yellow-100', label: 'No Bleed' },
  too_large: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100', label: 'Too Large' },
  too_small: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100', label: 'Too Small' },
  needs_crop: { icon: Info, color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Will Crop' },
  pending: { icon: FileText, color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Pending' },
};

const printStatusConfig: Record<PrintPdfStatus, {
  color: string;
  label: string;
}> = {
  pending: { color: 'text-muted-foreground', label: 'Not Ready' },
  ready: { color: 'text-green-600', label: 'Print Ready' },
  processing: { color: 'text-blue-600', label: 'Processing...' },
  needs_crop: { color: 'text-amber-600', label: 'Needs Crop' },
};

export function LabelItemCard({
  item,
  onQuantityChange,
  onDelete,
  onNameChange,
  validationStatus = 'pending',
  validationIssues = [],
  thumbnailUrl: thumbnailPath,
  onPrepareArtwork,
  isProcessing = false,
}: LabelItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [localQuantity, setLocalQuantity] = useState(item.quantity);

  // Generate signed URL for thumbnail (handles paths, full URLs, and data URLs)
  const { url: thumbnailUrl, isLoading: thumbnailLoading } = useThumbnailUrl(thumbnailPath);

  // Sync local quantity when item.quantity changes from external source
  useEffect(() => {
    setLocalQuantity(item.quantity);
  }, [item.quantity]);

  const status = statusConfig[validationStatus];
  const StatusIcon = status.icon;
  
  const printStatus = printStatusConfig[item.print_pdf_status || 'pending'];
  const hasProof = !!(item.proof_pdf_url || item.artwork_pdf_url);
  const isPrintReady = item.print_pdf_status === 'ready';
  const needsCrop = item.requires_crop || item.print_pdf_status === 'needs_crop';

  const handleNameSave = () => {
    if (editName.trim() && onNameChange) {
      onNameChange(editName.trim());
    }
    setIsEditing(false);
  };

  const handleQuantitySave = () => {
    const qty = Math.max(1, localQuantity);
    if (qty !== item.quantity) {
      onQuantityChange(qty);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Thumbnail / Preview */}
        <div className="relative aspect-[4/3] bg-muted flex items-center justify-center border-b">
          {thumbnailLoading ? (
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          ) : thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={item.name}
              className="w-full h-full object-contain"
            />
          ) : (
            <FileText className="h-12 w-12 text-muted-foreground" />
          )}
          
          {/* Status Badge */}
          <Badge
            className={cn(
              "absolute top-2 right-2 gap-1",
              status.bgColor,
              status.color,
              "border-0"
            )}
          >
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </Badge>

          {/* Delete Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 left-2 h-7 w-7 bg-background/80 hover:bg-destructive hover:text-destructive-foreground"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Name */}
          {isEditing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
              className="h-8 text-sm"
              autoFocus
            />
          ) : (
            <p
              className="text-sm font-medium truncate cursor-pointer hover:text-primary"
              onClick={() => onNameChange && setIsEditing(true)}
              title={item.name}
            >
              {item.name}
            </p>
          )}

          {/* Quantity Input */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Qty:</label>
            <Input
              type="number"
              min={1}
              value={localQuantity}
              onChange={(e) => setLocalQuantity(parseInt(e.target.value) || 1)}
              onBlur={handleQuantitySave}
              onKeyDown={(e) => e.key === 'Enter' && handleQuantitySave()}
              className="h-8 text-sm w-24"
            />
          </div>

          {/* Dimensions - show box type if available */}
          {(item.width_mm || item.height_mm) && (
            <p className="text-xs text-muted-foreground">
              {item.preflight_report?.primary_box === 'trimbox' ? (
                <span className="text-primary font-medium">TrimBox: </span>
              ) : null}
              {Number(item.width_mm).toFixed(1)}×{Number(item.height_mm).toFixed(1)}mm
            </p>
          )}

          {/* Artwork Status Row */}
          <div className="flex items-center justify-between text-xs border-t pt-2">
            <TooltipProvider>
              <div className="flex items-center gap-2">
                {/* Proof Status */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-1",
                      hasProof ? "text-green-600" : "text-muted-foreground"
                    )}>
                      {hasProof ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      <span>Proof</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {hasProof ? 'Proof artwork uploaded' : 'No proof artwork'}
                  </TooltipContent>
                </Tooltip>

                {/* Print Status */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn("flex items-center gap-1", printStatus.color)}>
                      {isPrintReady ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : item.print_pdf_status === 'processing' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span>Print</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{printStatus.label}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>

          {/* Prep Actions */}
          {onPrepareArtwork && hasProof && !isPrintReady && (
            <div className="flex gap-2">
              {needsCrop && item.crop_amount_mm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs gap-1"
                  onClick={() => onPrepareArtwork('crop')}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Crop className="h-3 w-3" />
                  )}
                  Auto-Crop
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs gap-1"
                onClick={() => onPrepareArtwork('use_proof_as_print')}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FileCheck className="h-3 w-3" />
                )}
                Use as Print
              </Button>
            </div>
          )}

          {/* Validation Details */}
          {validationIssues.length > 0 && (
            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full h-7 text-xs gap-1">
                  {detailsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {validationIssues.length} issue{validationIssues.length !== 1 ? 's' : ''}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {validationIssues.map((issue, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <span className="mt-1">•</span>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
