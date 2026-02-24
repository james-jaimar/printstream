import { LabelItemCard } from './LabelItemCard';
import { PrintReadyItemCard } from './PrintReadyItemCard';
import { useUpdateLabelItem, useDeleteLabelItem } from '@/hooks/labels/useLabelItems';
import type { LabelItem, PreflightReport } from '@/types/labels';

type ValidationStatus = 'passed' | 'no_bleed' | 'too_large' | 'too_small' | 'needs_crop' | 'pending';

interface ItemAnalysis {
  validation?: {
    status?: string;
    issues?: string[];
    warnings?: string[];
    errors?: string[];
  };
  thumbnail_url?: string;
}

interface LabelItemsGridProps {
  items: LabelItem[];
  orderId: string;
  viewMode?: 'proof' | 'print';
  itemAnalyses?: Record<string, ItemAnalysis>;
  onLinkPrintToProof?: (printItemId: string, proofItemId: string) => void;
  onReplaceArtwork?: (itemId: string, file: File) => void;
}

// Map preflight status to validation status
function getValidationStatus(
  item: LabelItem, 
  analysis?: ItemAnalysis
): ValidationStatus {
  // First check in-memory analysis (for immediate feedback)
  if (analysis?.validation?.status) {
    return analysis.validation.status as ValidationStatus;
  }
  
  // Then check preflight_report from database
  const report = item.preflight_report as PreflightReport | null;
  if (report) {
    if (report.errors && report.errors.length > 0) {
      // Check for specific error types
      const errorsJoined = report.errors.join(' ').toLowerCase();
      if (errorsJoined.includes('too large')) return 'too_large';
      if (errorsJoined.includes('too small')) return 'too_small';
      return 'too_large'; // Default for errors
    }
    // Check has_bleed BEFORE warnings — non-critical warnings (e.g. rotation)
    // should not override a confirmed bleed result
    if (report.has_bleed === true) return 'passed';
    if (report.warnings && report.warnings.length > 0) {
      const warningsJoined = report.warnings.join(' ').toLowerCase();
      if (warningsJoined.includes('no bleed') || warningsJoined.includes('trim size')) return 'no_bleed';
      if (warningsJoined.includes('crop')) return 'needs_crop';
      return 'no_bleed'; // Default for warnings
    }
  }
  
  // Fall back to preflight_status field
  if (item.preflight_status === 'passed') return 'passed';
  if (item.preflight_status === 'failed') return 'too_small';
  if (item.preflight_status === 'warnings') return 'no_bleed';
  
  return 'pending';
}

function getValidationIssues(item: LabelItem, analysis?: ItemAnalysis): string[] {
  // First check in-memory analysis
  if (analysis?.validation?.issues) {
    return analysis.validation.issues;
  }
  
  // Then check preflight_report from database
  const report = item.preflight_report as PreflightReport | null;
  if (report) {
    const issues: string[] = [];
    if (report.warnings) issues.push(...report.warnings);
    if (report.errors) issues.push(...report.errors);
    return issues;
  }
  
  return [];
}

export function LabelItemsGrid({ items, orderId, viewMode = 'proof', itemAnalyses = {}, onLinkPrintToProof, onReplaceArtwork }: LabelItemsGridProps) {
  const updateItem = useUpdateLabelItem();
  const deleteItem = useDeleteLabelItem();

  const handleDeletePrintFile = (itemId: string) => {
    updateItem.mutate({
      id: itemId,
      updates: {
        print_pdf_url: null,
        print_thumbnail_url: null,
        print_pdf_status: 'pending',
      } as any,
    });
  };

  if (items.length === 0) {
    return null;
  }

  const handleQuantityChange = (itemId: string, quantity: number) => {
    updateItem.mutate({
      id: itemId,
      updates: { quantity },
    });
  };

  const handleNameChange = (itemId: string, name: string) => {
    updateItem.mutate({
      id: itemId,
      updates: { name },
    });
  };

  const handleDelete = (itemId: string) => {
    deleteItem.mutate({ id: itemId, orderId });
  };

  // Sort items: children by source_page_number, others by item_number
  const sortedItems = [...items].sort((a, b) => {
    // Group children of the same parent together
    if (a.parent_item_id && b.parent_item_id && a.parent_item_id === b.parent_item_id) {
      return (a.source_page_number ?? 0) - (b.source_page_number ?? 0);
    }
    return (a.item_number ?? 0) - (b.item_number ?? 0);
  });

  const gridClassName = viewMode === 'print'
    ? "grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4"
    : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4";

  return (
    <div className={gridClassName}>
      {sortedItems.map((item) => {
        if (viewMode === 'print') {
          // Items with proof artwork are potential link targets
          const proofItems = items.filter(i => 
            i.id !== item.id && (i.proof_pdf_url || i.artwork_pdf_url) && !i.print_pdf_url
          );
          // This item is unmatched if it has print artwork but no proof artwork
          const isUnmatched = !!item.print_pdf_url && !item.proof_pdf_url && !item.artwork_pdf_url;
          return (
            <PrintReadyItemCard
              key={item.id}
              item={item}
              onDeletePrintFile={handleDeletePrintFile}
              isUnmatched={isUnmatched}
              availableProofItems={isUnmatched ? proofItems : undefined}
              onLinkToProof={onLinkPrintToProof}
            />
          );
        }

        const analysis = itemAnalyses[item.id];
        const validationStatus = getValidationStatus(item, analysis);
        const validationIssues = getValidationIssues(item, analysis);
        
        const thumbnailUrl = analysis?.thumbnail_url || item.proof_thumbnail_url || item.artwork_thumbnail_url || undefined;
        
        const isFlagged = item.proofing_status === 'client_needs_upload' || !!item.artwork_issue;
        
        return (
          <LabelItemCard
            key={item.id}
            item={item}
            onQuantityChange={(qty) => handleQuantityChange(item.id, qty)}
            onDelete={() => handleDelete(item.id)}
            onNameChange={(name) => handleNameChange(item.id, name)}
            validationStatus={validationStatus}
            validationIssues={validationIssues}
            thumbnailUrl={thumbnailUrl}
            isFlagged={isFlagged}
            artworkIssue={item.artwork_issue || undefined}
            onReplaceArtwork={onReplaceArtwork ? (file) => onReplaceArtwork(item.id, file) : undefined}
          />
        );
      })}
    </div>
  );
}
