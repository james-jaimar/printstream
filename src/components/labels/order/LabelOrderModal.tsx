import { useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  Calendar,
  User, 
  Mail, 
  FileText, 
  Ruler,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Settings,
  Sparkles,
  X,
  Send,
  ImageOff,
  Lock,
  RefreshCw,
  AlertOctagon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { useLabelOrder, useUpdateLabelOrder } from '@/hooks/labels/useLabelOrders';
import { useCreateLabelItem, useUpdateLabelItem } from '@/hooks/labels/useLabelItems';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DualArtworkUploadZone } from '../items/DualArtworkUploadZone';
import { LabelItemsGrid } from '../items/LabelItemsGrid';
import { LabelRunsCard } from '../LabelRunsCard';
import { LayoutOptimizer } from '../LayoutOptimizer';
import { AddLabelItemDialog } from '../AddLabelItemDialog';
import { SendProofingDialog } from '../proofing/SendProofingDialog';
import { RequestArtworkDialog } from '../proofing/RequestArtworkDialog';
import { runPreflight, getPageBoxes, splitPdf } from '@/services/labels/vpsApiService';
import { OrientationPicker, getOrientationLabel, getOrientationSvg } from '@/components/labels/OrientationPicker';
import { supabase } from '@/integrations/supabase/client';
import { validatePdfDimensions } from '@/utils/pdf/thumbnailUtils';
import type { LabelOrderStatus, PreflightReport, PdfBoxes, LabelInkConfig } from '@/types/labels';
import { INK_CONFIG_LABELS, INK_CONFIG_SPEEDS } from '@/types/labels';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const statusConfig: Record<LabelOrderStatus, { 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: typeof Clock;
}> = {
  quote: { label: 'Quote', variant: 'secondary', icon: FileText },
  pending_approval: { label: 'Pending Approval', variant: 'outline', icon: Clock },
  approved: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  in_production: { label: 'In Production', variant: 'default', icon: Settings },
  completed: { label: 'Completed', variant: 'default', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: AlertCircle },
};

interface LabelOrderModalProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LabelOrderModal({ orderId, open, onOpenChange }: LabelOrderModalProps) {
  const { data: order, isLoading, error, refetch } = useLabelOrder(orderId);
  const createItem = useCreateLabelItem();
  const updateItem = useUpdateLabelItem();
  const updateOrder = useUpdateLabelOrder();
  const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
  const [sendProofDialogOpen, setSendProofDialogOpen] = useState(false);
  const [requestArtworkDialogOpen, setRequestArtworkDialogOpen] = useState(false);
  const [itemAnalyses, setItemAnalyses] = useState<Record<string, unknown>>({});
  const [artworkTab, setArtworkTab] = useState<'proof' | 'print'>('proof');
  const [bypassProof, setBypassProof] = useState(false);

  // Lock-down state
  const isLocked = order?.status === 'pending_approval';
  const proofVersion = order?.proof_version ?? 0;
  
  // Items needing revision (client requested changes)
  const changesRequestedItems = useMemo(() => 
    (order?.items || []).filter(item => 
      item.proofing_status === 'client_needs_upload' || item.artwork_issue
    ),
    [order?.items]
  );
  const hasChangesRequested = changesRequestedItems.length > 0;

  // Filter items based on active artwork tab, hiding split parents
  const filteredItems = useMemo(() => {
    if (!order?.items) return [];
    
    // Hide parent items that have been split into children
    const visibleItems = order.items.filter(item => 
      !(item.page_count > 1 && !item.parent_item_id)
    );
    
    if (artworkTab === 'proof') {
      // Proof view: items with proof artwork, legacy artwork, OR placeholders (no artwork at all)
      return visibleItems.filter(item => 
        item.proof_pdf_url || (item.artwork_pdf_url && !item.print_pdf_url) ||
        (!item.proof_pdf_url && !item.artwork_pdf_url && !item.print_pdf_url) // placeholders
      );
    } else {
      // Print-ready view: show ALL visible items so admin can see which still need print artwork
      return visibleItems;
    }
  }, [order?.items, artworkTab]);

  // Items eligible for AI Layout Optimizer (includes placeholders with no artwork)
  const layoutEligibleItems = useMemo(() => {
    return (order?.items || []).filter(item => 
      !(item.page_count > 1 && !item.parent_item_id)
    );
  }, [order?.items]);

  // Handler for dual upload zone (supports both proof and print-ready artwork)
  const handleDualFilesUploaded = useCallback(async (files: { 
    url: string; 
    name: string; 
    thumbnailUrl?: string; 
    preflightStatus: 'pending' | 'passed' | 'failed' | 'warnings';
    preflightReport?: Record<string, unknown>;
    width_mm?: number;
    height_mm?: number;
    isProof: boolean;
    needs_rotation?: boolean;
    page_count?: number;
  }[]) => {
    if (!order) return;

    // Normalize item name for matching (strips suffixes like "proof", "print", "final")
    const normalizeItemName = (name: string): string => {
      return name
        .toLowerCase()
        .replace(/\.(pdf|png|jpg|jpeg)$/i, '')
        .replace(/[\s_-]*(proof|print|final|ready|v\d+)[\s_-]*/gi, '')
        .trim();
    };

    for (const file of files) {
      try {
        const normalizedFileName = normalizeItemName(file.name);
        const isProof = file.isProof;
        
        if (!isProof) {
          // PRINT-READY UPLOAD: Try to match existing proof items first
          
          // Check for existing child items (from proof split) that match by parent name
          let existingChildren = order.items?.filter(item => 
            item.parent_item_id && normalizeItemName(item.name.replace(/ - Page \d+$/i, '')) === normalizedFileName
          ) || [];
          
          // Fallback: if no exact name match for a multi-page PDF, try matching by page count
          if (existingChildren.length === 0 && (file.page_count ?? 1) > 1) {
            const parentIds = [...new Set(
              (order.items || [])
                .filter(i => i.parent_item_id)
                .map(i => i.parent_item_id!)
            )];
            const parentsWithMatchingPageCount = parentIds.filter(pid => {
              const childCount = (order.items || []).filter(i => i.parent_item_id === pid).length;
              return childCount === (file.page_count ?? 1);
            });
            if (parentsWithMatchingPageCount.length === 1) {
              const matchedParentId = parentsWithMatchingPageCount[0];
              existingChildren = (order.items || []).filter(
                i => i.parent_item_id === matchedParentId
              );
              console.log('Fallback match: matched print-ready PDF by page count to parent', matchedParentId);
            }
          }
          
          if (existingChildren.length > 0 && (file.page_count ?? 1) > 1) {
            // Multi-page print-ready PDF with existing proof children
            // Find the existing proof parent instead of creating a new one
            const existingParentId = existingChildren[0].parent_item_id!;
            
            // Update the existing parent with print-ready PDF info
            updateItem.mutate({
              id: existingParentId,
              updates: {
                print_pdf_url: file.url,
                print_thumbnail_url: file.thumbnailUrl,
                print_pdf_status: 'ready',
              }
            });
            
            // Split in 'print' mode to update existing children's print_pdf_url
            const pdfUrl = file.url;
            splitPdf(existingParentId, pdfUrl, order.id, 'print')
              .then(async (splitResult) => {
                console.log('Print-ready split complete (matched to proof children):', splitResult);
                toast.success(`Matched ${splitResult.page_count} print-ready pages to proof items`);
                const { data: refetchedOrder } = await refetch();
                if (!refetchedOrder?.items) return;
                // Generate print-ready thumbnails for children that need them
                const childrenNeedingThumbs = refetchedOrder.items.filter(
                  i => i.parent_item_id === existingParentId
                    && i.print_pdf_url
                    && !i.print_thumbnail_url
                );
                for (const child of childrenNeedingThumbs) {
                  try {
                    const { generatePdfThumbnailFromUrl, dataUrlToBlob } = await import('@/utils/pdf/thumbnailUtils');
                    const thumbDataUrl = await generatePdfThumbnailFromUrl(child.print_pdf_url!, 300);
                    const blob = dataUrlToBlob(thumbDataUrl);
                    const thumbPath = `label-artwork/orders/${order.id}/thumbnails/${child.id}-print.png`;
                    const { error } = await supabase.storage
                      .from('label-files')
                      .upload(thumbPath, blob, { contentType: 'image/png', upsert: true });
                    if (!error) {
                      updateItem.mutate({ id: child.id, updates: { print_thumbnail_url: thumbPath } });
                    }
                  } catch (err) {
                    console.warn('Print thumbnail gen failed for child:', child.id, err);
                  }
                }
              })
              .catch(err => {
                console.error('Print-ready split failed:', err);
                toast.error('Failed to split print-ready PDF');
              });
            continue;
          }
          
          // Check for single existing item match
          const existingItem = order.items?.find(item => 
            normalizeItemName(item.name) === normalizedFileName
          );
          
          if (existingItem) {
            // Update existing item with print-ready artwork
            updateItem.mutate({
              id: existingItem.id,
              updates: {
                print_pdf_url: file.url,
                print_pdf_status: 'ready',
              }
            });
            continue;
          }
        }

        // PROOF UPLOAD or unmatched PRINT: Check for placeholder match by name
        const placeholderMatch = order.items?.find(item => {
          const isPlaceholder = !item.proof_pdf_url && !item.artwork_pdf_url && !item.print_pdf_url;
          return isPlaceholder && normalizeItemName(item.name) === normalizedFileName;
        });

        if (placeholderMatch) {
          // Fill placeholder with artwork
          updateItem.mutate({
            id: placeholderMatch.id,
            updates: {
              ...(isProof
                ? { proof_pdf_url: file.url, artwork_pdf_url: file.url, artwork_thumbnail_url: file.thumbnailUrl }
                : { print_pdf_url: file.url, print_pdf_status: 'ready' as const, print_thumbnail_url: file.thumbnailUrl }),
              width_mm: file.width_mm ?? order.dieline?.label_width_mm,
              height_mm: file.height_mm ?? order.dieline?.label_height_mm,
              preflight_status: file.preflightStatus,
              preflight_report: file.preflightReport as any,
              needs_rotation: file.needs_rotation ?? false,
              page_count: file.page_count ?? 1,
            }
          });
          toast.success(`Matched "${file.name}" to placeholder "${placeholderMatch.name}"`);
          
          // Still run VPS analysis on matched placeholder
          const pdfUrl = file.url;
          if (pdfUrl) {
            getPageBoxes(pdfUrl, placeholderMatch.id).catch(() => {});
            runPreflight({ pdf_url: pdfUrl, item_id: placeholderMatch.id }).catch(() => {});
          }
          continue;
        }

        // Create new item - route fields based on isProof
        const result = await createItem.mutateAsync({
          order_id: order.id,
          name: file.name.replace('.pdf', ''),
          quantity: 1,
          // Route to correct URL fields based on upload type
          ...(isProof 
            ? { proof_pdf_url: file.url, artwork_pdf_url: file.url, artwork_thumbnail_url: file.thumbnailUrl }
            : { print_pdf_url: file.url, print_pdf_status: 'ready' as const, print_thumbnail_url: file.thumbnailUrl }),
          width_mm: file.width_mm ?? order.dieline?.label_width_mm,
          height_mm: file.height_mm ?? order.dieline?.label_height_mm,
          preflight_status: file.preflightStatus,
          preflight_report: file.preflightReport,
          needs_rotation: file.needs_rotation ?? false,
          page_count: file.page_count ?? 1,
        });

        // Store analysis for the new item (for immediate UI feedback)
        if (file.preflightReport) {
          setItemAnalyses(prev => ({
            ...prev,
            [result.id]: {
              validation: file.preflightReport,
              thumbnail_url: file.thumbnailUrl,
            },
          }));
        }

        // Fire async VPS calls for accurate analysis
        const pdfUrl = file.url;
        if (pdfUrl) {
          // Capture isProof in closure for async callbacks
          const uploadIsProof = isProof;
          
          // 1. Get page boxes (TrimBox, BleedBox) for accurate dimension validation
          getPageBoxes(pdfUrl, result.id)
            .then(boxResult => {
              console.log('VPS page boxes complete for item:', result.id, boxResult);
              
              if (boxResult.success && order?.dieline) {
                const isTrimBox = boxResult.primary_box === 'trimbox';
                const dims = boxResult.dimensions_mm;
                
                const validation = validatePdfDimensions(
                  dims.width_mm,
                  dims.height_mm,
                  order.dieline.label_width_mm,
                  order.dieline.label_height_mm,
                  order.dieline.bleed_left_mm ?? 1.5,
                  order.dieline.bleed_right_mm ?? 1.5,
                  order.dieline.bleed_top_mm ?? 1.5,
                  order.dieline.bleed_bottom_mm ?? 1.5,
                  1.0,
                  isTrimBox
                );
                
                const updatedReport = {
                  boxes: boxResult.boxes,
                  primary_box: boxResult.primary_box,
                  has_bleed: validation.status === 'passed' || validation.status === 'needs_crop',
                  warnings: validation.issues.length > 0 && validation.preflightStatus !== 'failed' 
                    ? validation.issues : undefined,
                  errors: validation.preflightStatus === 'failed' ? validation.issues : undefined,
                } as Record<string, unknown>;
                
                updateItem.mutate({
                  id: result.id,
                  updates: {
                    width_mm: dims.width_mm,
                    height_mm: dims.height_mm,
                    preflight_status: validation.preflightStatus,
                    preflight_report: updatedReport,
                    needs_rotation: validation.needs_rotation ?? false,
                    page_count: boxResult.page_count ?? 1,
                  }
                });
              }

              // Trigger multi-page split if page_count > 1
              const pageCount = boxResult.page_count ?? 1;
              if (pageCount > 1) {
                console.log(`Multi-page PDF detected (${pageCount} pages), triggering split for item:`, result.id);
                // Use captured isProof flag instead of artworkTab state
                splitPdf(result.id, pdfUrl, order.id, uploadIsProof ? 'proof' : 'print')
                  .then(splitResult => {
                console.log('PDF split complete:', splitResult);
                    toast.success(`Split into ${splitResult.page_count} items`);
                    // Refetch and generate thumbnails for child items
                    refetch().then(async ({ data: refetchedOrder }) => {
                      if (!refetchedOrder?.items) return;
                      const childItems = refetchedOrder.items.filter(
                        (i: { parent_item_id: string | null; artwork_thumbnail_url: string | null; print_thumbnail_url: string | null }) => 
                          i.parent_item_id === result.id && (uploadIsProof ? !i.artwork_thumbnail_url : !i.print_thumbnail_url)
                      );
                      for (const child of childItems) {
                        const childPdfUrl = uploadIsProof ? (child.artwork_pdf_url || child.proof_pdf_url) : child.print_pdf_url;
                        if (!childPdfUrl) continue;
                        try {
                          const { generatePdfThumbnailFromUrl, dataUrlToBlob } = await import('@/utils/pdf/thumbnailUtils');
                          const dataUrl = await generatePdfThumbnailFromUrl(childPdfUrl, 300);
                          const blob = dataUrlToBlob(dataUrl);
                          const thumbPath = `label-artwork/orders/${order.id}/thumbnails/${child.id}${uploadIsProof ? '' : '-print'}.png`;
                          const { error: upErr } = await supabase.storage
                            .from('label-files')
                            .upload(thumbPath, blob, { contentType: 'image/png', upsert: true });
                          if (!upErr) {
                            const thumbField = uploadIsProof ? 'artwork_thumbnail_url' : 'print_thumbnail_url';
                            updateItem.mutate({ id: child.id, updates: { [thumbField]: thumbPath } });
                          }
                        } catch (thumbErr) {
                          console.warn('Thumbnail generation failed for child:', child.id, thumbErr);
                        }
                      }
                    });
                  })
                  .catch(err => {
                    console.error('PDF split failed:', err);
                    toast.error('Failed to split multi-page PDF');
                  });
              }
            })
            .catch(err => {
              console.warn('VPS page boxes failed, keeping client validation:', err);
            });

          // 2. Deep preflight analysis (fonts, DPI, color spaces)
          runPreflight({ 
            pdf_url: pdfUrl, 
            item_id: result.id 
          })
            .then(preflightResult => {
              console.log('VPS preflight complete for item:', result.id, preflightResult);
              if (preflightResult.report && Object.keys(preflightResult.report).length > 0) {
                updateItem.mutate({
                  id: result.id,
                  updates: {
                    is_cmyk: preflightResult.report.has_cmyk,
                    min_dpi: preflightResult.report.min_dpi,
                    has_bleed: preflightResult.report.has_bleed,
                  }
                });
              }
            })
            .catch(err => {
              console.warn('VPS preflight failed, keeping client validation:', err);
            });
        }
      } catch (error) {
        console.error('Error creating label item:', error);
      }
    }
  }, [order, createItem, updateItem, refetch]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto p-0">
        <VisuallyHidden>
          <DialogTitle>Label Order Details</DialogTitle>
          <DialogDescription>View and manage label order details, items, and production runs</DialogDescription>
        </VisuallyHidden>
        {isLoading ? (
          <div className="p-6 space-y-6">
            <Skeleton className="h-8 w-64" />
            <div className="grid grid-cols-3 gap-6">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : error || !order ? (
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Order Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The order you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="sticky top-0 bg-background border-b p-4 z-10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold">{order.order_number}</h1>
                    <Badge variant={statusConfig[order.status].variant} className="gap-1">
                      {React.createElement(statusConfig[order.status].icon, { className: "h-3 w-3" })}
                      {statusConfig[order.status].label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {order.customer_name}
                    {order.quickeasy_wo_no && (
                      <span className="ml-2">• WO# {order.quickeasy_wo_no}</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Bypass Proof Toggle */}
                  <div className="flex items-center gap-2 border rounded-md px-3 py-1.5">
                    <Switch 
                      id="bypass-proof" 
                      checked={bypassProof}
                      onCheckedChange={async (checked) => {
                        setBypassProof(checked);
                        if (checked && order.items?.length) {
                          // Batch update all items to approved
                          const childItems = order.items.filter(i => !(i.page_count > 1 && !i.parent_item_id));
                          for (const item of childItems) {
                            updateItem.mutate({ id: item.id, updates: { proofing_status: 'approved' } });
                          }
                          toast.success('All items marked as proof approved');
                        }
                      }}
                    />
                    <Label htmlFor="bypass-proof" className="text-xs cursor-pointer whitespace-nowrap">
                      Bypass Proof
                    </Label>
                  </div>

                  {/* Request Artwork Button */}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setRequestArtworkDialogOpen(true)}
                    disabled={(order.items?.length || 0) === 0}
                  >
                    <ImageOff className="h-4 w-4 mr-2" />
                    Request Artwork
                  </Button>
                  
                  {/* Send Proof Button */}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSendProofDialogOpen(true)}
                    disabled={(order.items?.length || 0) === 0 || isLocked}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {proofVersion === 0 ? 'Send Proof' : `Send Proof v${proofVersion + 1}`}
                  </Button>

                  {/* AI Layout Dialog */}
                  <Dialog open={layoutDialogOpen} onOpenChange={setLayoutDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" disabled={layoutEligibleItems.length === 0 || !order.dieline}>
                        <Sparkles className="h-4 w-4 mr-2" />
                        AI Layout ({layoutEligibleItems.length})
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>AI Layout Optimizer</DialogTitle>
                      </DialogHeader>
                      <LayoutOptimizer
                        orderId={order.id}
                        items={layoutEligibleItems}
                        dieline={order.dieline || null}
                        onLayoutApplied={() => {
                          setLayoutDialogOpen(false);
                          refetch();
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Lock-down Banner */}
            {isLocked && !hasChangesRequested && (
              <div className="mx-4 mt-2">
                <Alert className="border-amber-500/50 bg-amber-500/10">
                  <Lock className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-700 dark:text-amber-400">
                    Order Locked — Awaiting Client Approval (v{proofVersion})
                  </AlertTitle>
                  <AlertDescription className="text-amber-600 dark:text-amber-300 text-xs">
                    Proof artwork uploads are disabled while the client is reviewing. Print-ready uploads remain enabled.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Changes Requested Banner */}
            {hasChangesRequested && (
              <div className="mx-4 mt-2">
                <Alert className="border-destructive/50 bg-destructive/10">
                  <AlertOctagon className="h-4 w-4 text-destructive" />
                  <AlertTitle className="text-destructive">Changes Requested by Client</AlertTitle>
                  <AlertDescription>
                    <div className="space-y-2 mt-1">
                      <ul className="text-sm space-y-1">
                        {changesRequestedItems.map(item => (
                          <li key={item.id} className="flex items-start gap-2">
                            <span className="font-medium">{item.name}:</span>
                            <span className="text-muted-foreground italic">
                              {item.artwork_issue || 'Changes requested'}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={async () => {
                          await updateOrder.mutateAsync({
                            id: order.id,
                            updates: { status: 'quote' as const },
                          });
                          toast.success('Order unlocked for revision');
                        }}
                        disabled={updateOrder.isPending}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {updateOrder.isPending ? 'Unlocking...' : 'Revise & Resend'}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Customer Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Customer
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p className="font-medium">{order.customer_name}</p>
                    {order.contact_name && <p className="text-muted-foreground">{order.contact_name}</p>}
                    {order.contact_email && (
                      <a href={`mailto:${order.contact_email}`} className="text-primary hover:underline text-xs flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {order.contact_email}
                      </a>
                    )}
                  </CardContent>
                </Card>

                {/* Print Specs */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Ruler className="h-4 w-4" />
                      Print Specifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {order.dieline ? (
                      <>
                        <p className="font-medium">{order.dieline.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {order.dieline.label_width_mm}×{order.dieline.label_height_mm}mm 
                          on {order.dieline.roll_width_mm}mm roll
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No dieline selected</p>
                    )}
                    {order.substrate && <p className="text-xs">{order.substrate.name}</p>}

                    {/* Ink Configuration */}
                    <Separator className="my-2" />
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Ink Configuration</p>
                      <Select
                        value={order.ink_config || 'CMYK'}
                        onValueChange={(val) => {
                          updateOrder.mutate({
                            id: order.id,
                            updates: { ink_config: val } as any,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(INK_CONFIG_LABELS) as LabelInkConfig[]).map((key) => (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-2">
                                {INK_CONFIG_LABELS[key]}
                                <span className="text-muted-foreground">— {INK_CONFIG_SPEEDS[key]} m/min</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Orientation Display */}
                    <Separator className="my-2" />
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <img src={getOrientationSvg(order.orientation ?? 1)} alt="" className="h-8 w-8 object-contain" />
                        <div>
                          <p className="text-xs font-medium">{getOrientationLabel(order.orientation ?? 1)}</p>
                          {!(order as any).orientation_confirmed && order.status !== 'quote' && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 mt-0.5">
                              Not confirmed by client
                            </Badge>
                          )}
                          {(order as any).orientation_confirmed && (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 mt-0.5">
                              Client confirmed
                            </Badge>
                          )}
                        </div>
                      </div>
                      {order.status === 'quote' && (
                        <OrientationPicker
                          value={order.orientation ?? 1}
                          onChange={(v) => updateOrder.mutate({ id: order.id, updates: { orientation: v } as any })}
                          size="sm"
                          className="mt-2"
                        />
                      )}
                      {(order as any).orientation_confirmed && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 text-xs h-7"
                          onClick={() => {
                            updateOrder.mutate({
                              id: order.id,
                              updates: { orientation_confirmed: false } as any,
                            });
                            toast.info('Orientation reset — client must re-confirm');
                          }}
                          disabled={updateOrder.isPending}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Reset Confirmation
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Order Stats */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Labels:</span>{' '}
                      <span className="font-mono font-medium">{order.total_label_count.toLocaleString()}</span>
                    </p>
                    {order.due_date && (
                      <p className="flex items-center gap-1 text-xs">
                        <Calendar className="h-3 w-3" />
                        Due: {format(new Date(order.due_date), 'PP')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Separator />

              {/* Label Items Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Label Items</h2>
                    <p className="text-sm text-muted-foreground">
                      {(() => { const count = order.items?.filter(i => !(i.page_count > 1 && !i.parent_item_id)).length || 0; return `${count} artwork${count !== 1 ? 's' : ''} in this order`; })()}
                    </p>
                  </div>
                  <AddLabelItemDialog orderId={order.id} onSuccess={() => refetch()} />
                </div>

                {/* Dual Upload Zone */}
                <DualArtworkUploadZone
                  orderId={order.id}
                  dieline={order.dieline || null}
                  onFilesUploaded={handleDualFilesUploaded}
                  disabled={!order.dieline || (isLocked && artworkTab === 'proof')}
                  activeTab={artworkTab}
                  onTabChange={setArtworkTab}
                />

                {!order.dieline && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Select a dieline template above to enable PDF uploads with validation
                  </p>
                )}

                {/* Items Grid - filtered by active tab */}
                {filteredItems.length > 0 ? (
                  <LabelItemsGrid
                    items={filteredItems}
                    orderId={order.id}
                    viewMode={artworkTab}
                    itemAnalyses={itemAnalyses as Record<string, { validation?: { status: string; issues: string[] }; thumbnail_url?: string }>}
                  />
                ) : (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      {artworkTab === 'proof' 
                        ? 'No proof artwork uploaded yet. Drop PDFs above to add items.'
                        : 'No print-ready artwork uploaded yet. Upload clean production files here.'}
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Production Runs */}
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Production</h2>
                  <p className="text-sm text-muted-foreground">
                    AI-optimized print runs and production schedule
                  </p>
                </div>
                <LabelRunsCard runs={order.runs || []} items={order.items || []} dieline={order.dieline} orderId={order.id} orderNumber={order.order_number} onImpositionComplete={() => refetch()} />
              </div>

              {/* Timestamps */}
              <div className="text-xs text-muted-foreground flex items-center gap-4 pt-4">
                <span>Created: {format(new Date(order.created_at), 'PPp')}</span>
                <span>Updated: {format(new Date(order.updated_at), 'PPp')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Proofing Dialogs */}
        {order && (
          <>
            <SendProofingDialog
              open={sendProofDialogOpen}
              onOpenChange={setSendProofDialogOpen}
              order={order}
              items={order.items || []}
            />
            <RequestArtworkDialog
              open={requestArtworkDialogOpen}
              onOpenChange={setRequestArtworkDialogOpen}
              order={order}
              items={order.items || []}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Need React import for createElement
import React from 'react';
