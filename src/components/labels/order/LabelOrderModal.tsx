import { useState, useCallback } from 'react';
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
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLabelOrder } from '@/hooks/labels/useLabelOrders';
import { useCreateLabelItem, useUpdateLabelItem } from '@/hooks/labels/useLabelItems';
import { LabelItemsDropZone } from '../items/LabelItemsDropZone';
import { LabelItemsGrid } from '../items/LabelItemsGrid';
import { LabelRunsCard } from '../LabelRunsCard';
import { LayoutOptimizer } from '../LayoutOptimizer';
import { runPreflight, getPageBoxes } from '@/services/labels/vpsApiService';
import { validatePdfDimensions } from '@/utils/pdf/thumbnailUtils';
import type { LabelOrderStatus, PreflightReport, PdfBoxes } from '@/types/labels';

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
  const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
  const [itemAnalyses, setItemAnalyses] = useState<Record<string, unknown>>({});

  const handleFilesUploaded = useCallback(async (files: { 
    url: string; 
    name: string; 
    thumbnailUrl?: string; 
    preflightStatus: 'pending' | 'passed' | 'failed' | 'warnings';
    preflightReport?: Record<string, unknown>;
    width_mm?: number;
    height_mm?: number;
  }[]) => {
    if (!order) return;

    for (const file of files) {
      try {
        const result = await createItem.mutateAsync({
          order_id: order.id,
          name: file.name.replace('.pdf', ''),
          quantity: 1,
          artwork_pdf_url: file.url,
          artwork_thumbnail_url: file.thumbnailUrl,
          width_mm: file.width_mm ?? order.dieline?.label_width_mm,
          height_mm: file.height_mm ?? order.dieline?.label_height_mm,
          preflight_status: file.preflightStatus,
          preflight_report: file.preflightReport,
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
        if (result.artwork_pdf_url) {
          // 1. Get page boxes (TrimBox, BleedBox) for accurate dimension validation
          getPageBoxes(result.artwork_pdf_url, result.id)
            .then(boxResult => {
              console.log('VPS page boxes complete for item:', result.id, boxResult);
              
              if (boxResult.success && order?.dieline) {
                // Re-validate with TrimBox if available
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
                
                // Update item with accurate dimensions and box data
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
                  }
                });
              }
            })
            .catch(err => {
              console.warn('VPS page boxes failed, keeping client validation:', err);
            });

          // 2. Deep preflight analysis (fonts, DPI, color spaces)
          runPreflight({ 
            pdf_url: result.artwork_pdf_url, 
            item_id: result.id 
          })
            .then(preflightResult => {
              console.log('VPS preflight complete for item:', result.id, preflightResult);
              // Only update if we got useful data (fonts, images, etc.)
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
  }, [order, createItem, updateItem]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto p-0">
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

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Proof
                  </Button>
                  <Dialog open={layoutDialogOpen} onOpenChange={setLayoutDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" disabled={(order.items?.length || 0) === 0 || !order.dieline}>
                        <Sparkles className="h-4 w-4 mr-2" />
                        AI Layout
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>AI Layout Optimizer</DialogTitle>
                      </DialogHeader>
                      <LayoutOptimizer
                        orderId={order.id}
                        items={order.items || []}
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
                <div>
                  <h2 className="text-lg font-semibold">Label Items</h2>
                  <p className="text-sm text-muted-foreground">
                    {(order.items?.length || 0)} artwork{(order.items?.length || 0) !== 1 ? 's' : ''} in this order
                  </p>
                </div>

                {/* Drop Zone */}
                <LabelItemsDropZone
                  orderId={order.id}
                  dieline={order.dieline || null}
                  onFilesUploaded={handleFilesUploaded}
                  disabled={!order.dieline}
                />

                {!order.dieline && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Select a dieline template above to enable PDF uploads with validation
                  </p>
                )}

                {/* Items Grid */}
                <LabelItemsGrid
                  items={order.items || []}
                  orderId={order.id}
                  itemAnalyses={itemAnalyses as Record<string, { validation?: { status: string; issues: string[] }; thumbnail_url?: string }>}
                />
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
                <LabelRunsCard runs={order.runs || []} items={order.items || []} />
              </div>

              {/* Timestamps */}
              <div className="text-xs text-muted-foreground flex items-center gap-4 pt-4">
                <span>Created: {format(new Date(order.created_at), 'PPp')}</span>
                <span>Updated: {format(new Date(order.updated_at), 'PPp')}</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Need React import for createElement
import React from 'react';
