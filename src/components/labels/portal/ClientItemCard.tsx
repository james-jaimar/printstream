import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  FileText,
  Clock,
  AlertTriangle,
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
  awaiting_client: { label: 'Awaiting Your Review', variant: 'secondary', icon: <AlertTriangle className="h-3 w-3" /> },
  client_needs_upload: { label: 'Upload Required', variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
  approved: { label: 'Approved', variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
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
  const status = item.proofing_status || 'draft';
  const badge = proofingBadges[status] || proofingBadges.draft;
  const canReview = status === 'awaiting_client';
  const needsUpload = status === 'client_needs_upload';
  const isApproved = status === 'approved';

  // Pick best thumbnail
  const thumbnailUrl =
    item.signed_proof_thumbnail_url ||
    item.signed_artwork_thumbnail_url ||
    item.proof_thumbnail_url ||
    item.artwork_thumbnail_url;

  const pdfUrl =
    item.signed_proof_pdf_url ||
    item.signed_artwork_pdf_url ||
    item.proof_pdf_url ||
    item.artwork_pdf_url;

  return (
    <Card className={`transition-all ${selected ? 'ring-2 ring-primary' : ''} ${isApproved ? 'opacity-80' : ''}`}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Checkbox area */}
          {canReview && (
            <div className="flex items-start pt-1">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(item.id)}
                className="h-4 w-4 rounded border-input"
              />
            </div>
          )}

          {/* Thumbnail */}
          <div className="w-24 h-24 bg-muted rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={item.name}
                className="w-full h-full object-contain rounded"
              />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-medium text-sm truncate">{item.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={badge.variant} className="gap-1 text-[10px]">
                    {badge.icon}
                    {badge.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Qty: {item.quantity.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {item.width_mm && item.height_mm && (
              <p className="text-xs text-muted-foreground">
                {item.width_mm}mm × {item.height_mm}mm
              </p>
            )}

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
  );
}
