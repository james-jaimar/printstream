import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  FileText,
  Clock,
  AlertTriangle,
  ZoomIn,
} from 'lucide-react';
import type { LabelItem } from '@/types/labels';
import ClientArtworkUpload from './ClientArtworkUpload';

type ProofingBadge = {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ReactNode;
};

const proofingBadges: Record<string, ProofingBadge> = {
  draft: { label: 'Draft', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  ready_for_proof: { label: 'Proof Ready', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  awaiting_client: {
    label: 'Awaiting Your Review',
    variant: 'destructive',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  client_needs_upload: {
    label: 'Upload Required',
    variant: 'destructive',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  approved: {
    label: 'Approved',
    variant: 'default',
    icon: <CheckCircle className="h-3 w-3" />,
  },
};

interface ClientItemCardProps {
  item: LabelItem & {
    signed_proof_pdf_url?: string;
    signed_proof_thumbnail_url?: string;
    signed_artwork_pdf_url?: string;
    signed_artwork_thumbnail_url?: string;
  };
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onUploadArtwork: (itemId: string, file: File) => Promise<void>;
  isUploading?: boolean;
}

export default function ClientItemCard({
  item,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  onUploadArtwork,
  isUploading,
}: ClientItemCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const status = item.proofing_status || 'draft';
  const badge = proofingBadges[status] || proofingBadges.draft;
  const canReview = status === 'awaiting_client';
  const needsUpload = status === 'client_needs_upload';
  const isApproved = status === 'approved';

  // SECURITY: Only use signed URLs — never expose raw Supabase storage paths
  const thumbnailUrl =
    item.signed_proof_thumbnail_url ||
    item.signed_artwork_thumbnail_url ||
    null;

  const pdfUrl =
    item.signed_proof_pdf_url ||
    item.signed_artwork_pdf_url ||
    null;

  return (
    <>
      <Card className={`transition-all overflow-hidden ${selected ? 'ring-2 ring-primary' : ''} ${
        isApproved
          ? 'border-primary/30 bg-primary/5'
          : canReview
            ? 'border-destructive/30 bg-destructive/5'
            : needsUpload
              ? 'border-destructive/30'
              : ''
      }`}>
        <CardContent className="p-0">
          <div className="flex">
            {/* Checkbox */}
            {canReview && (
              <div className="flex items-center px-3 border-r bg-muted/30">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(item.id)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
              </div>
            )}

            {/* Thumbnail — large preview */}
            <button
              type="button"
              onClick={() => thumbnailUrl && setLightboxOpen(true)}
              className="relative w-32 h-32 sm:w-40 sm:h-40 bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden group cursor-pointer"
              disabled={!thumbnailUrl}
            >
              {thumbnailUrl ? (
                <>
                  <img
                    src={thumbnailUrl}
                    alt={item.name}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors flex items-center justify-center">
                    <ZoomIn className="h-5 w-5 text-foreground opacity-0 group-hover:opacity-70 transition-opacity" />
                  </div>
                </>
              ) : (
                <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
              )}
            </button>

            {/* Details */}
            <div className="flex-1 min-w-0 p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <h4 className="font-semibold text-sm leading-tight truncate">{item.name}</h4>
                  <Badge variant={badge.variant} className="gap-1 text-[10px]">
                    {badge.icon}
                    {badge.label}
                  </Badge>
                </div>
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Qty: <strong className="text-foreground">{item.quantity.toLocaleString()}</strong></span>
                {item.width_mm && item.height_mm && (
                  <span>{item.width_mm}mm × {item.height_mm}mm</span>
                )}
              </div>

              {item.artwork_issue && (
                <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                  {item.artwork_issue}
                </p>
              )}

              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <FileText className="h-3 w-3" />
                  View Proof PDF
                </a>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canReview && (
                  <>
                    <Button size="sm" variant="default" onClick={() => onApprove(item.id)}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(item.id)}>
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Request Changes
                    </Button>
                  </>
                )}

                {needsUpload && (
                  <ClientArtworkUpload
                    onUpload={(file) => onUploadArtwork(item.id, file)}
                    isPending={isUploading}
                  />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-3xl p-2">
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt={item.name}
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
