/**
 * Dual Artwork Upload Zone
 * Separate upload areas for Proof Artwork (client-facing) and Print-Ready Artwork (production)
 */

import { useState, useCallback } from 'react';
import { Upload, FileText, Loader2, Eye, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  generatePdfThumbnail, 
  dataUrlToBlob, 
  getPdfDimensionsMm,
  validatePdfDimensions,
  type ValidationResult 
} from '@/utils/pdf/thumbnailUtils';
import type { LabelDieline, PreflightReport } from '@/types/labels';

interface UploadingFile {
  file: File;
  progress: 'uploading' | 'generating_thumbnail' | 'validating' | 'complete' | 'error';
  error?: string;
}

export interface UploadedFileResult {
  url: string; 
  name: string; 
  thumbnailUrl?: string; 
  preflightStatus: 'pending' | 'passed' | 'failed' | 'warnings';
  preflightReport?: PreflightReport;
  width_mm?: number;
  height_mm?: number;
  isProof: boolean; // True = proof artwork, False = print-ready
}

interface DualArtworkUploadZoneProps {
  orderId: string;
  dieline: LabelDieline | null;
  onFilesUploaded: (files: UploadedFileResult[]) => void;
  disabled?: boolean;
  // External tab control (optional - for parent synchronization)
  activeTab?: 'proof' | 'print';
  onTabChange?: (tab: 'proof' | 'print') => void;
}

export function DualArtworkUploadZone({
  orderId,
  dieline,
  onFilesUploaded,
  disabled = false,
  activeTab: externalActiveTab,
  onTabChange: externalOnTabChange,
}: DualArtworkUploadZoneProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<'proof' | 'print'>('proof');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  
  // Use external tab control if provided, otherwise use internal state
  const activeTab = externalActiveTab ?? internalActiveTab;
  const setActiveTab = externalOnTabChange ?? setInternalActiveTab;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, isProof: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === 'application/pdf'
    );

    if (files.length === 0) {
      toast.error('Please drop PDF files only');
      return;
    }

    await processFiles(files, isProof);
  }, [disabled, orderId, dieline]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, isProof: boolean) => {
    const files = Array.from(e.target.files || []).filter(
      (file) => file.type === 'application/pdf'
    );

    if (files.length === 0) {
      toast.error('Please select PDF files only');
      return;
    }

    await processFiles(files, isProof);
    e.target.value = '';
  }, [orderId, dieline]);

  const processFiles = async (files: File[], isProof: boolean) => {
    setUploadingFiles(files.map(file => ({ file, progress: 'uploading' })));

    const uploadedFiles: UploadedFileResult[] = [];
    const folder = isProof ? 'proofs' : 'print-ready';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = `label-artwork/orders/${orderId}/${folder}/${fileName}`;

      try {
        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('label-files')
          .upload(filePath, file);

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('label-files')
          .getPublicUrl(filePath);

        // Update progress
        setUploadingFiles(prev => 
          prev.map((uf, idx) => 
            idx === i ? { ...uf, progress: 'validating' } : uf
          )
        );

        // Validate dimensions
        let preflightStatus: 'pending' | 'passed' | 'failed' | 'warnings' = 'pending';
        let validation: ValidationResult | undefined;
        let pdfDimensions: { width_mm: number; height_mm: number } | undefined;
        
        try {
          pdfDimensions = await getPdfDimensionsMm(file);
          
          if (dieline) {
            validation = validatePdfDimensions(
              pdfDimensions.width_mm,
              pdfDimensions.height_mm,
              dieline.label_width_mm,
              dieline.label_height_mm,
              dieline.bleed_left_mm ?? 1.5,
              dieline.bleed_right_mm ?? 1.5,
              dieline.bleed_top_mm ?? 1.5,
              dieline.bleed_bottom_mm ?? 1.5,
              1.0
            );
            preflightStatus = validation.preflightStatus;
            
            if (validation.status !== 'passed') {
              toast.info(`${file.name}: ${validation.issues[0]}`, { duration: 4000 });
            }
          }
        } catch (validationError) {
          console.warn('PDF validation failed:', validationError);
        }

        // Generate thumbnail
        setUploadingFiles(prev => 
          prev.map((uf, idx) => 
            idx === i ? { ...uf, progress: 'generating_thumbnail' } : uf
          )
        );

        let thumbnailPath: string | undefined;
        
        try {
          const thumbnailDataUrl = await generatePdfThumbnail(file, 300);
          const thumbnailBlob = dataUrlToBlob(thumbnailDataUrl);
          const thumbPath = `label-artwork/orders/${orderId}/${folder}/thumbnails/${fileName.replace('.pdf', '.png')}`;
          
          const { error: thumbError } = await supabase.storage
            .from('label-files')
            .upload(thumbPath, thumbnailBlob, { contentType: 'image/png' });
          
          if (thumbError) {
            console.warn('Thumbnail upload failed:', thumbError.message);
            thumbnailPath = thumbnailDataUrl;
          } else {
            thumbnailPath = thumbPath;
          }
        } catch (thumbError) {
          console.warn('Thumbnail generation failed:', thumbError);
        }

        // Build preflight report
        const preflightReport: PreflightReport | undefined = validation ? {
          has_bleed: validation.status === 'passed' || validation.status === 'needs_crop',
          warnings: validation.issues.length > 0 && preflightStatus !== 'failed' 
            ? validation.issues : undefined,
          errors: preflightStatus === 'failed' ? validation.issues : undefined,
        } : undefined;

        uploadedFiles.push({ 
          url: publicUrl, 
          name: file.name, 
          thumbnailUrl: thumbnailPath,
          preflightStatus,
          preflightReport,
          width_mm: pdfDimensions?.width_mm,
          height_mm: pdfDimensions?.height_mm,
          isProof,
        });

        setUploadingFiles(prev => 
          prev.map((uf, idx) => 
            idx === i ? { ...uf, progress: 'complete' } : uf
          )
        );

      } catch (error) {
        console.error('Upload error:', error);
        setUploadingFiles(prev => 
          prev.map((uf, idx) => 
            idx === i ? { ...uf, progress: 'error', error: (error as Error).message } : uf
          )
        );
      }
    }

    setTimeout(() => {
      setUploadingFiles([]);
    }, 2000);

    if (uploadedFiles.length > 0) {
      onFilesUploaded(uploadedFiles);
    }
  };

  const isProcessing = uploadingFiles.some(f => 
    f.progress === 'uploading' || f.progress === 'generating_thumbnail' || f.progress === 'validating'
  );

  const renderDropZone = (isProof: boolean) => {
    const Icon = isProof ? Eye : Printer;
    const title = isProof ? 'Proof Artwork' : 'Print-Ready Artwork';
    const description = isProof 
      ? 'Client-facing proofs (may include dielines)'
      : 'Clean artwork for production';

    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, isProof)}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-all",
          "flex flex-col items-center justify-center gap-3",
          isDragging && activeTab === (isProof ? 'proof' : 'print') && !disabled && "border-primary bg-primary/5",
          disabled && "opacity-50 cursor-not-allowed",
          !isDragging && !disabled && "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
      >
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => handleFileSelect(e, isProof)}
          disabled={disabled || isProcessing}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        {isProcessing ? (
          <>
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-medium text-sm">Processing {uploadingFiles.length} file(s)...</p>
              <p className="text-xs text-muted-foreground">
                {uploadingFiles.filter(f => f.progress === 'uploading').length > 0 && 'Uploading... '}
                {uploadingFiles.filter(f => f.progress === 'validating').length > 0 && 'Validating... '}
                {uploadingFiles.filter(f => f.progress === 'generating_thumbnail').length > 0 && 'Generating previews...'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-full bg-muted p-3">
              <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Upload className="h-3 w-3" />
              <span>Drop PDF files or click to browse</span>
            </div>
            {dieline && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                <FileText className="h-3 w-3" />
                <span>
                  Expected: {dieline.label_width_mm + (dieline.bleed_left_mm ?? 1.5) + (dieline.bleed_right_mm ?? 1.5)}×
                  {dieline.label_height_mm + (dieline.bleed_top_mm ?? 1.5) + (dieline.bleed_bottom_mm ?? 1.5)}mm
                </span>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'proof' | 'print')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="proof" className="gap-2">
            <Eye className="h-4 w-4" />
            Proof Artwork
          </TabsTrigger>
          <TabsTrigger value="print" className="gap-2">
            <Printer className="h-4 w-4" />
            Print-Ready
          </TabsTrigger>
        </TabsList>
        <TabsContent value="proof" className="mt-4">
          {renderDropZone(true)}
        </TabsContent>
        <TabsContent value="print" className="mt-4">
          {renderDropZone(false)}
        </TabsContent>
      </Tabs>

      {/* Upload Progress */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((uf, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border text-sm",
                uf.progress === 'error' && "border-destructive bg-destructive/10",
                uf.progress === 'complete' && "border-primary bg-primary/10",
                (uf.progress === 'uploading' || uf.progress === 'validating') && "border-accent bg-accent/10"
              )}
            >
              {uf.progress === 'uploading' || uf.progress === 'generating_thumbnail' || uf.progress === 'validating' ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : uf.progress === 'complete' ? (
                <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground text-xs">✓</span>
                </div>
              ) : (
                <div className="h-4 w-4 rounded-full bg-destructive flex items-center justify-center">
                  <span className="text-destructive-foreground text-xs">×</span>
                </div>
              )}
              <span className="flex-1 truncate">{uf.file.name}</span>
              <span className="text-muted-foreground capitalize">
                {uf.progress === 'generating_thumbnail' ? 'Generating preview...' : 
                 uf.progress === 'validating' ? 'Validating...' : uf.progress}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
