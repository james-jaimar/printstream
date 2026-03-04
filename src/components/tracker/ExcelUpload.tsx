
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, Check, X, QrCode, Download, AlertTriangle, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { generateQRCodeData, generateQRCodeImage } from "@/utils/qrCodeGenerator";
import { 
  parseExcelFile, 
  ExcelImportDebugger, 
  ParsedJob, 
  ImportStats,
  validateAllJobs 
} from "@/utils/excel";

import { 
  parseExcelFileForPreview, 
  getAutoDetectedMapping, 
  parseExcelFileWithMapping,
  parseMatrixExcelFileForPreview,
  parseMatrixExcelFileWithMapping,
  parseAndPrepareProductionReadyJobs,
  parseMatrixAndPrepareProductionReadyJobs,
  finalizeProductionReadyJobs
} from "@/utils/excel/enhancedParser";
import { finalizeJobsDirectly } from "@/utils/excel/directParser";
import type { MatrixExcelData } from "@/utils/excel/types";
import type { EnhancedJobCreationResult } from "@/utils/excel/enhancedJobCreator";
import { ColumnMappingDialog, type ExcelPreviewData, type ColumnMapping } from "./ColumnMappingDialog";
import { MatrixMappingDialog, type MatrixColumnMapping } from "./MatrixMappingDialog";
import { PaginatedJobCreationDialog } from "@/components/admin/upload/PaginatedJobCreationDialog";
import JobPartAssignmentManager from "@/components/jobs/JobPartAssignmentManager";

interface JobDataWithQR extends ParsedJob {
  user_id: string;
  qr_code_data?: string;
  qr_code_url?: string;
}

export const ExcelUpload = () => {
  const { user } = useAuth();
  const [parsedJobs, setParsedJobs] = useState<ParsedJob[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [generateQRCodes, setGenerateQRCodes] = useState(true);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [debugLogger] = useState(() => new ExcelImportDebugger());
  
  
  // Enhanced mapping state
  const [previewData, setPreviewData] = useState<ExcelPreviewData | null>(null);
  const [autoDetectedMapping, setAutoDetectedMapping] = useState<ColumnMapping>({});
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  // Matrix parsing state
  const [matrixData, setMatrixData] = useState<MatrixExcelData | null>(null);
  const [showMatrixDialog, setShowMatrixDialog] = useState(false);
  const [isMatrixMode, setIsMatrixMode] = useState(false);
  
  // Phase 4: Enhanced job creation state
  const [enhancedResult, setEnhancedResult] = useState<EnhancedJobCreationResult | null>(null);
  const [showEnhancedDialog, setShowEnhancedDialog] = useState(false);
  const [isCreatingJobs, setIsCreatingJobs] = useState(false);

  // Part Assignment Modal state (additive only)
  const [showPartAssignment, setShowPartAssignment] = useState(false);
  const [partAssignmentJob, setPartAssignmentJob] = useState<{ id: string; wo_no: string } | null>(null);


  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setUploadError(null);
    setCurrentFile(file);
    debugLogger.clear();
    
    try {
      // First try to detect if this is a matrix-structured Excel file
      debugLogger.addDebugInfo("Attempting to detect Excel structure type...");
      
      try {
        const matrixPreview = await parseMatrixExcelFileForPreview(file, debugLogger);
        
        // Check if matrix structure was detected
        if (matrixPreview.detectedGroups.length > 0 && matrixPreview.groupColumn !== -1) {
          debugLogger.addDebugInfo(`Matrix structure detected with ${matrixPreview.detectedGroups.length} groups`);
          setMatrixData(matrixPreview);
          setIsMatrixMode(true);
          setShowMatrixDialog(true);
          
          toast.success(`Matrix Excel detected! Found ${matrixPreview.detectedGroups.length} groups in ${matrixPreview.rows.length} rows.`);
          return;
        }
      } catch (matrixError) {
        debugLogger.addDebugInfo(`Matrix parsing failed, falling back to standard parsing: ${matrixError}`);
      }
      
      // Fall back to standard Excel parsing
      debugLogger.addDebugInfo("Using standard Excel parsing mode");
      const preview = await parseExcelFileForPreview(file);
      const autoMapping = getAutoDetectedMapping(preview.headers, debugLogger);
      
      setPreviewData(preview);
      setAutoDetectedMapping(autoMapping);
      setIsMatrixMode(false);
      setShowMappingDialog(true);
      
      toast.success(`File loaded successfully. ${preview.totalRows} rows detected.`);
    } catch (error) {
      console.error("Error parsing Excel file:", error);
      debugLogger.addDebugInfo(`Error: ${error}`);
      setUploadError(`Failed to parse Excel file: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error("Failed to parse Excel file. Please check the format.");
    }
  };

  const handleMappingConfirmed = async (mapping: ColumnMapping) => {
    if (!currentFile || !user?.id) return;
    
    try {
      setIsCreatingJobs(true);
      setShowMappingDialog(false);
      
      // STEP 1: Parse and create mappings WITHOUT saving to database
      const result = await parseAndPrepareProductionReadyJobs(
        currentFile, 
        mapping, 
        debugLogger,
        user.id,
        generateQRCodes
      );
      
      setEnhancedResult(result);
      
      // Show enhanced dialog directly
      setShowEnhancedDialog(true);
      
      toast.success(`Processing completed! ${result.stats.total} jobs mapped.`);
    } catch (error) {
      console.error("Error in enhanced job creation:", error);
      debugLogger.addDebugInfo(`Enhanced creation error: ${error}`);
      setUploadError(`Failed to prepare production-ready jobs: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error("Failed to prepare production-ready jobs.");
    } finally {
      setIsCreatingJobs(false);
    }
  };

  const handleMatrixMappingConfirmed = async (mapping: MatrixColumnMapping) => {
    if (!currentFile || !matrixData || !user?.id) return;
    
    try {
      setIsCreatingJobs(true);
      setShowMatrixDialog(false);
      
      // STEP 1: Parse and create mappings WITHOUT saving to database
      const result = await parseMatrixAndPrepareProductionReadyJobs(
        currentFile,
        matrixData,
        mapping, 
        debugLogger,
        user.id,
        generateQRCodes
      );
      
      setEnhancedResult(result);
      
      // Show enhanced dialog directly
      setShowEnhancedDialog(true);
      
      const duplicateMessage = result.duplicatesSkipped > 0 
        ? ` (${result.duplicatesSkipped} duplicates automatically skipped)`
        : '';
      toast.success(`Matrix processing completed! ${result.stats.total} jobs mapped.${duplicateMessage}`);
    } catch (error) {
      console.error("Error in enhanced matrix job creation:", error);
      debugLogger.addDebugInfo(`Enhanced matrix creation error: ${error}`);
      setUploadError(`Failed to prepare production-ready matrix jobs: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error("Failed to prepare production-ready matrix jobs.");
    } finally {
      setIsCreatingJobs(false);
    }
  };

  const downloadDebugInfo = () => {
    const debugText = debugLogger.getDebugInfo().join('\n');
    const blob = new Blob([debugText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `excel-import-debug-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmUpload = async () => {
    if (!user?.id || parsedJobs.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    
    try {
      console.log(`Creating ${parsedJobs.length} jobs in database (no processing)`);
    
      // Validate jobs before upload
      const validationErrors = validateAllJobs(parsedJobs);
    
      if (validationErrors.length > 0) {
        setUploadError(`Validation errors:\n${validationErrors.slice(0, 5).join('\n')}${validationErrors.length > 5 ? '\n...' : ''}`);
        return;
      }
      
      console.log("📦 Creating jobs in database (simplified upload)...");
      debugLogger.addSummary("Job Creation", parsedJobs.length);
      
      // SIMPLIFIED: Only create basic job records - no QR codes, no processing
      const jobsWithUserId = parsedJobs.map(job => ({
        ...job,
        user_id: user.id,
        date: job.date || undefined,
        due_date: job.due_date || undefined
      }));

      const { data, error } = await supabase
        .from('production_jobs')
        .upsert(jobsWithUserId, { 
          onConflict: 'wo_no,user_id',
          ignoreDuplicates: true 
        })
        .select();

      if (error) {
        setUploadError(`Database error: ${error.message}`);
        toast.error("Failed to upload jobs to database");
        return;
      }

      // SIMPLIFIED: Trigger background processing for everything
      if (data && data.length > 0) {
        console.log(`✅ ${data.length} jobs created. Starting background processing...`);
        debugLogger.flushBatchedMessages();
        
        try {
          const { data: calcResult, error: calcError } = await supabase.functions.invoke('calculate-due-dates', {
            body: {
              jobIds: data.map(job => job.id),
              tableName: 'production_jobs',
              priority: 'normal',
              includeWorkflowInitialization: true,
              includeTimingCalculation: true,
              includeQRCodeGeneration: generateQRCodes
            }
          });
          
          if (calcError) {
            console.error('❌ Background processing error:', calcError);
            toast.error("Jobs created but background processing failed. Processing will be retried later.");
          } else {
            console.log('🚀 Background processing initiated successfully');
          }
        } catch (error) {
          console.error('❌ Failed to trigger background processing:', error);
          toast.error("Jobs created but background processing failed. Processing will be retried later.");
        }
      }

      const duplicatesSkipped = jobsWithUserId.length - (data?.length || 0);
      const processingMessage = generateQRCodes ? " QR codes, workflows, and due dates" : " workflows and due dates";
      
      if (duplicatesSkipped > 0) {
        toast.success(`${data?.length || 0} jobs uploaded successfully!${processingMessage} are being processed in the background. ${duplicatesSkipped} duplicates skipped.`);
      } else {
        toast.success(`${data?.length || 0} jobs uploaded successfully!${processingMessage} are being processed in the background.`);
      }
      
      setParsedJobs([]);
      setFileName("");
      setImportStats(null);
      
      // Reset file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error("Failed to upload jobs");
    } finally {
      setIsUploading(false);
    }
  };

  // Single job processing for paginated dialog
  const handleSingleJobConfirm = async (woNo: string, userApprovedMappings?: Array<{groupName: string, mappedStageId: string, mappedStageName: string, category: string, mappedStageSpecId?: string, mappedStageSpecName?: string, paperSpecification?: string, partType?: string, quantity?: number}>) => {
    if (!enhancedResult || !user) return;
    
    try {
      // Create a single-job result for processing
      const singleJobResult = {
        ...enhancedResult,
        categoryAssignments: { [woNo]: enhancedResult.categoryAssignments[woNo] },
        rowMappings: { [woNo]: enhancedResult.rowMappings[woNo] || [] },
        stats: {
          total: 1,
          successful: 0,
          failed: 0,
          newCategories: 0,
          workflowsInitialized: 0
        }
      };
      
      // Process the single job
      const finalResult = await finalizeProductionReadyJobs(singleJobResult, debugLogger, user.id, userApprovedMappings);
      
      if (finalResult.stats.successful > 0) {
        // Auto-open part assignment for newly created job (additive functionality)
        if (finalResult.createdJobs && finalResult.createdJobs.length > 0) {
          const createdJob = finalResult.createdJobs[0];
          setPartAssignmentJob({ id: createdJob.id, wo_no: createdJob.wo_no });
          setShowPartAssignment(true);
        }
      } else {
        throw new Error(finalResult.failedJobs[0]?.error || 'Unknown error');
      }
    } catch (error) {
      console.error(`Error processing job ${woNo}:`, error);
      throw error; // Re-throw so the dialog can handle it
    }
  };

  // Complete handler for paginated dialog
  const handlePaginatedComplete = () => {
    setEnhancedResult(null);
    setShowEnhancedDialog(false);
    handleClearPreview();
    toast.success("Job import process completed!");
  };

  const handleEnhancedJobsConfirmed = async (userApprovedMappings?: Array<{groupName: string, mappedStageId: string, mappedStageName: string, category: string}>) => {
    if (!enhancedResult || !user) return;
    
    try {
      setIsCreatingJobs(true);
      
      // SIMPLIFIED: Create basic jobs first, then trigger background processing
      const basicJobs = enhancedResult.stats.total > 0 
        ? Object.values(enhancedResult.categoryAssignments).map((assignment: any) => assignment.originalJob).filter(Boolean)
        : [];
      
      if (basicJobs.length === 0) {
        throw new Error("No valid jobs found to create");
      }

      // Create basic job records only
      const jobsWithUserId = basicJobs.map(job => ({
        ...job,
        user_id: user.id,
        date: job.date || undefined,
        due_date: job.due_date || undefined
      }));

      const { data, error } = await supabase
        .from('production_jobs')
        .upsert(jobsWithUserId, { 
          onConflict: 'wo_no,user_id',
          ignoreDuplicates: true 
        })
        .select();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error("No jobs were created (possibly all duplicates)");
      }

      // Trigger background processing with user mappings
      try {
        const { data: calcResult, error: calcError } = await supabase.functions.invoke('calculate-due-dates', {
          body: {
            jobIds: data.map(job => job.id),
            tableName: 'production_jobs',
            priority: 'normal',
            includeWorkflowInitialization: true,
            includeTimingCalculation: true,
            includeQRCodeGeneration: enhancedResult.generateQRCodes,
            userApprovedMappings: userApprovedMappings
          }
        });
        
        if (calcError) {
          console.error('Background processing error:', calcError);
          toast.warning("Jobs created but background processing failed. Processing will be retried later.");
        }
      } catch (bgError) {
        console.error('Failed to trigger background processing:', bgError);
        toast.warning("Jobs created but background processing failed. Processing will be retried later.");
      }
      
      toast.success(`${data.length} jobs created successfully! Workflows and processing are running in the background.`);
      
      // Auto-open part assignment for first created job (additive functionality)
      if (data.length > 0) {
        const firstJob = data[0];
        setPartAssignmentJob({ id: firstJob.id, wo_no: firstJob.wo_no });
        setShowPartAssignment(true);
      }
      
      // Clean up
      setEnhancedResult(null);
      setShowEnhancedDialog(false);
      handleClearPreview();
    } catch (error) {
      console.error("Error creating jobs:", error);
      toast.error(`Failed to create jobs: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsCreatingJobs(false);
    }
  };

  const handleClearPreview = () => {
    setParsedJobs([]);
    setFileName("");
    setImportStats(null);
    setUploadError(null);
    setPreviewData(null);
    setAutoDetectedMapping({});
    setCurrentFile(null);
    // Clear matrix state
    setMatrixData(null);
    setIsMatrixMode(false);
    setShowMatrixDialog(false);
    setShowMappingDialog(false);
    // Clear enhanced state
    setEnhancedResult(null);
    setShowEnhancedDialog(false);
    debugLogger.clear();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };


  return (
    <div className="w-full space-y-6">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Excel File
          </CardTitle>
          <CardDescription>
            Upload an Excel file (.xlsx, .xls) to create production-ready work orders with automatic workflow initialization.
            <br />
            <span className="text-blue-600 font-medium flex items-center gap-1 mt-2">
              <Sparkles className="h-4 w-4" />
              Phase 4: Complete Production Integration - Auto-maps stages, assigns categories & initializes workflows
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="flex-1"
              />
              {fileName && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <FileSpreadsheet className="h-4 w-4" />
                  {fileName}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="generate-qr"
                checked={generateQRCodes}
                onCheckedChange={setGenerateQRCodes}
              />
              <Label htmlFor="generate-qr" className="flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                Generate QR codes for each job
              </Label>
            </div>

            {uploadError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-red-800">Upload Error</h4>
                    <pre className="text-sm text-red-700 mt-1 whitespace-pre-wrap">{uploadError}</pre>
                  </div>
                </div>
              </div>
            )}

            {importStats && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Import Statistics
                </h4>
                <div className="text-sm space-y-1">
                  <div>Total rows processed: {importStats.totalRows}</div>
                  <div>Successfully imported: {importStats.processedRows}</div>
                  <div>Skipped rows: {importStats.skippedRows}</div>
                  <div>Invalid WO Numbers: {importStats.invalidWONumbers}</div>
                  <div>Invalid dates: {importStats.invalidDates}</div>
                  <div>Invalid timing data: {importStats.invalidTimingData}</div>
                  {(importStats.invalidDates > 0 || importStats.invalidTimingData > 0) && (
                    <div className="text-blue-600 text-xs mt-2">
                      * Invalid dates and timing data were converted to blank/default values and jobs were still imported
                    </div>
                  )}
                </div>
              </div>
            )}

            {debugLogger.getDebugInfo().length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadDebugInfo}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download Debug Info
                </Button>
                <span className="text-sm text-gray-500">({debugLogger.getDebugInfo().length} debug messages)</span>
              </div>
            )}
            
            {parsedJobs.length > 0 && (
              <div className="flex gap-2">
                <Button 
                  onClick={handleConfirmUpload} 
                  disabled={isUploading}
                  className="flex items-center gap-2"
                >
                  <Check className="h-4 w-4" />
                  {isUploading ? "Uploading..." : `Upload ${parsedJobs.length} Jobs`}
                  {generateQRCodes && " with QR Codes"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleClearPreview}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Column Mapping Dialog */}
      <ColumnMappingDialog
        open={showMappingDialog}
        onOpenChange={setShowMappingDialog}
        previewData={previewData}
        autoDetectedMapping={autoDetectedMapping}
        onMappingConfirmed={handleMappingConfirmed}
      />

      {/* Matrix Mapping Dialog */}
      <MatrixMappingDialog
        open={showMatrixDialog}
        onOpenChange={setShowMatrixDialog}
        matrixData={matrixData}
        onMappingConfirmed={handleMatrixMappingConfirmed}
      />

      {/* Phase 4: Paginated Job Creation Dialog */}
      <PaginatedJobCreationDialog
        open={showEnhancedDialog}
        onOpenChange={setShowEnhancedDialog}
        result={enhancedResult}
        isProcessing={isCreatingJobs}
        onSingleJobConfirm={handleSingleJobConfirm}
        onComplete={handlePaginatedComplete}
      />

      {/* Part Assignment Modal (additive) */}
      {partAssignmentJob && (
        <JobPartAssignmentManager
          jobId={partAssignmentJob.id}
          jobTableName="production_jobs"
          open={showPartAssignment}
          onClose={() => {
            setShowPartAssignment(false);
            setPartAssignmentJob(null);
          }}
        />
      )}

      {parsedJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview ({parsedJobs.length} jobs)</CardTitle>
            <CardDescription>
              Review the parsed jobs before uploading to the database
              {generateQRCodes && " (QR codes will be generated automatically)"}
              <br />
              <span className="text-sm text-gray-600">Blank cells are shown as "-" and are acceptable. Duplicate work orders will be ignored during upload.</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WO No.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Rep</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Location</TableHead>
                    {isMatrixMode && <TableHead>Size</TableHead>}
                    {isMatrixMode && <TableHead>Contact</TableHead>}
                    {isMatrixMode && <TableHead>Groups</TableHead>}
                    <TableHead>Est. Hours</TableHead>
                    <TableHead>Setup Min.</TableHead>
                    <TableHead>Speed</TableHead>
                    <TableHead>Specs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedJobs.slice(0, 100).map((job, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{job.wo_no}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${
                          job.status === 'Pre-Press' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {job.status}
                        </span>
                      </TableCell>
                      <TableCell>{job.date || '-'}</TableCell>
                      <TableCell>{job.rep || '-'}</TableCell>
                      <TableCell>{job.category || '-'}</TableCell>
                      <TableCell className={!job.customer ? 'text-red-500 font-medium' : ''}>
                        {job.customer || 'MISSING'}
                      </TableCell>
                      <TableCell>{job.reference || '-'}</TableCell>
                      <TableCell>{job.qty}</TableCell>
                      <TableCell>{job.due_date || '-'}</TableCell>
                      <TableCell>{job.location || '-'}</TableCell>
                      {isMatrixMode && <TableCell>{job.size || '-'}</TableCell>}
                      {isMatrixMode && <TableCell>{job.contact || '-'}</TableCell>}
                      {isMatrixMode && (
                        <TableCell className="max-w-32 truncate">
                          {job.paper_specifications ? Object.keys(job.paper_specifications).join(', ') : '-'}
                        </TableCell>
                      )}
                      <TableCell>{job.estimated_hours ? `${job.estimated_hours}h` : '-'}</TableCell>
                      <TableCell>{job.setup_time_minutes ? `${job.setup_time_minutes}m` : '-'}</TableCell>
                      <TableCell>
                        {job.running_speed ? `${job.running_speed} ${job.speed_unit || 'units'}/hr` : '-'}
                      </TableCell>
                      <TableCell className="max-w-32 truncate" title={job.specifications || ''}>
                        {job.specifications || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedJobs.length > 100 && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Showing first 100 jobs. {parsedJobs.length - 100} more will be uploaded.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
