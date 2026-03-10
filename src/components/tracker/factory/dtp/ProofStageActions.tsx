import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Mail, ThumbsUp, Package, Printer, ArrowRight, Scan, Copy, Link as LinkIcon, FileText, Clock, AlertCircle } from "lucide-react";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";
import { BatchCategorySelector } from "../../batch-allocation/BatchCategorySelector";
import { BatchJobFormRHF } from "../../batch-allocation/BatchJobFormRHF";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStageActions } from "@/hooks/tracker/stage-management/useStageActions";
import { useProofApprovalFlow } from "@/hooks/tracker/useProofApprovalFlow";
import { useProofLinks } from "@/hooks/useProofLinks";
import { useFileUpload } from "@/hooks/useFileUpload";
import { HP12000PaperSizeSelector } from "./HP12000PaperSizeSelector";
import { ManageProofDialog } from "./ManageProofDialog";
import { ClientChangeRequestCard } from "../ClientChangeRequestCard";
import { useState } from "react";

interface StageInstance {
  id: string;
  status: string;
  proof_emailed_at?: string;
  proof_approved_manually_at?: string;
  client_email?: string;
  client_name?: string;
  notes?: string;
  rework_count?: number;
  started_by?: string;
  completed_by?: string;
}

type ProofApprovalFlow = 'pending' | 'choosing_allocation' | 'batch_allocation' | 'direct_printing';

interface ProofStageActionsProps {
  job: AccessibleJob;
  stageStatus: string;
  stageInstance: StageInstance | null;
  proofApprovalFlow: ProofApprovalFlow;
  selectedBatchCategory: string;
  scanCompleted: boolean;
  isLoading: boolean;
  onRefresh?: () => void;
  onClose: () => void;
  onProofApprovalFlowChange: (flow: ProofApprovalFlow) => void;
  onBatchCategoryChange: (category: string) => void;
  setStageInstance: (instance: StageInstance | null) => void;
  onOpenProofDialog?: () => void;
  onReloadModal?: () => Promise<void>;
}

export const ProofStageActions: React.FC<ProofStageActionsProps> = ({
  job,
  stageStatus,
  stageInstance,
  proofApprovalFlow,
  selectedBatchCategory,
  scanCompleted,
  isLoading,
  onRefresh,
  onClose,
  onProofApprovalFlowChange,
  onBatchCategoryChange,
  setStageInstance,
  onOpenProofDialog,
  onReloadModal
}) => {
  const { user } = useAuth();
  const { startStage, completeStage, completeStageAndSkipConditional, isProcessing } = useStageActions();
  const { completeProofStage } = useProofApprovalFlow();
  const { generateProofLink, isGenerating } = useProofLinks();
  const [generatedProofLink, setGeneratedProofLink] = useState<string | null>(null);
  const [hp12000ValidationStatus, setHP12000ValidationStatus] = useState<{
    isValid: boolean;
    message?: string;
  }>({ isValid: true });
  const [isManageProofOpen, setIsManageProofOpen] = useState(false);
  
  // Client details state
  const [clientEmail, setClientEmail] = useState(stageInstance?.client_email || '');
  const [clientName, setClientName] = useState(stageInstance?.client_name || '');
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  
  // File upload for proof PDF
  const { 
    selectedFile: proofPdfFile, 
    handleFileChange: handleProofPdfChange,
    clearSelectedFile: clearProofPdf,
    fileInfo: proofPdfInfo
  } = useFileUpload({
    acceptedTypes: ['application/pdf'],
    maxSizeInMB: 10
  });

  // Get the current stage instance ID from the job stage instances
  const getCurrentStageInstanceId = async (): Promise<string | null> => {
    if (stageInstance?.id) {
      return stageInstance.id;
    }

    // Fallback: query for the current active proof stage instance
    const { data, error } = await supabase
      .from('job_stage_instances')
      .select('id')
      .eq('job_id', job.job_id)
      .eq('job_table_name', 'production_jobs')
      .eq('production_stage_id', job.current_stage_id)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      console.error('❌ Could not find current stage instance:', error);
      return null;
    }

    return data.id;
  };

  const handleStartProof = async () => {
    const stageInstanceId = await getCurrentStageInstanceId();
    if (!stageInstanceId) {
      toast.error("No current stage instance found");
      return;
    }

    try {
      const success = await startStage(stageInstanceId);
      
      if (success) {
        const { error: jobError } = await supabase
          .from('production_jobs')
          .update({
            status: 'Proof In Progress',
            updated_at: new Date().toISOString()
          })
          .eq('id', job.job_id);

        if (jobError) throw jobError;

        toast.success("Proof stage started");
        if (onReloadModal) await onReloadModal();
        onRefresh?.();
      }
    } catch (error) {
      console.error('Error starting proof:', error);
      toast.error("Failed to start proof stage");
    }
  };

  const handleGenerateProofLink = async () => {
    if (!stageInstance?.id) {
      toast.error("No stage instance found");
      return;
    }

    // Validate inputs
    if (!proofPdfFile) {
      toast.error("Please upload a proof PDF first");
      return;
    }

    if (!clientEmail || !clientEmail.includes('@')) {
      toast.error("Please enter a valid client email");
      return;
    }

    setIsUploadingPdf(true);

    try {
      // Upload PDF to storage
      const fileExt = proofPdfFile.name.split('.').pop();
      const fileName = `${job.job_id}_${stageInstance.id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('proof-pdfs')
        .upload(filePath, proofPdfFile);

      if (uploadError) {
        console.error('PDF upload error:', uploadError);
        toast.error('Failed to upload proof PDF');
        return;
      }

      // Get public URL for the PDF
      const { data: { publicUrl } } = supabase.storage
        .from('proof-pdfs')
        .getPublicUrl(filePath);

      console.log('✅ Proof PDF uploaded:', publicUrl);

      // Update stage instance with PDF URL and client details
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({
          proof_pdf_url: publicUrl,
          client_email: clientEmail,
          client_name: clientName || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', stageInstance.id);

      if (updateError) {
        console.error('Error updating stage instance:', updateError);
        toast.error('Failed to save proof details');
        return;
      }

      // Also update production job with client details for future reference
      const { error: jobUpdateError } = await supabase
        .from('production_jobs')
        .update({
          client_email: clientEmail,
          client_name: clientName || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.job_id);

      if (jobUpdateError) {
        console.error('Error updating job with client details:', jobUpdateError);
      }

      // Generate proof link (this will trigger email sending)
      const link = await generateProofLink(stageInstance.id);
      if (link) {
        setGeneratedProofLink(link);
        clearProofPdf();
      }
    } catch (error) {
      console.error('Error in proof generation:', error);
      toast.error('Failed to generate proof link');
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const handleCopyLink = async () => {
    if (generatedProofLink) {
      await navigator.clipboard.writeText(generatedProofLink);
      toast.success("Link copied to clipboard");
    }
  };

  const handleProofEmailed = async () => {
    const currentTime = new Date().toISOString();

    try {
      // CRITICAL: Only update proof_emailed_at timestamp
      // DO NOT change job status - job must remain visible in DTP queue
      const { error: proofError } = await supabase
        .from('job_stage_instances')
        .update({
          proof_emailed_at: currentTime,
          updated_at: currentTime
        })
        .eq('job_id', job.job_id)
        .eq('production_stage_id', job.current_stage_id);

      if (proofError) throw proofError;

      // Update local state to show emailed status immediately
      if (stageInstance) {
        setStageInstance({
          ...stageInstance,
          proof_emailed_at: currentTime
        });
      }

      toast.success("🟡 Proof sent! Job remains in queue awaiting online client approval");
      setGeneratedProofLink(null); // Reset link state
      if (onReloadModal) await onReloadModal();
      onRefresh?.();
    } catch (error) {
      console.error('Error marking proof as emailed:', error);
      toast.error("Failed to mark proof as emailed");
    }
  };

  const handleManualEmailSent = async () => {
    const currentTime = new Date().toISOString();

    try {
      console.log('📧 Marking proof as manually emailed for job:', job.job_id);
      
      // Update stage instance - proof sent manually outside system
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({
          proof_emailed_at: currentTime,
          updated_at: currentTime,
          notes: 'Proof sent manually via email (not through system)'
        })
        .eq('job_id', job.job_id)
        .eq('production_stage_id', job.current_stage_id);

      if (updateError) throw updateError;

      // Update local state
      if (stageInstance) {
        setStageInstance({
          ...stageInstance,
          proof_emailed_at: currentTime
        });
      }

      toast.success("✅ Proof marked as emailed manually - awaiting client response");
      if (onReloadModal) await onReloadModal();
      onRefresh?.();
    } catch (error) {
      console.error('Error marking proof as manually emailed:', error);
      toast.error("Failed to mark proof as emailed");
    }
  };

  const handlePrintjobApproval = async () => {
    // This function marks proof as handled via Printjob
    // The actual approval happens when they click "Approve" button after selecting paper sizes
    
    try {
      console.log('🎯 Marking proof as approved on Printjob for job:', job.job_id);
      
      if (!stageInstance?.id) {
        toast.error('No stage instance found');
        return;
      }

      const currentTime = new Date().toISOString();

      // Update stage instance - proof handled on Printjob (like manual email)
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({
          proof_emailed_at: currentTime,
          updated_at: currentTime,
          notes: 'Proof approved on Printjob (not emailed to client)'
        })
        .eq('id', stageInstance.id);

      if (updateError) throw updateError;

      // Update local state to trigger paper size selector UI
      setStageInstance({
        ...stageInstance,
        proof_emailed_at: currentTime
      });

      toast.success('✅ Proof approved on Printjob - please assign paper sizes and approve');
      if (onReloadModal) await onReloadModal();
      onRefresh?.();
      
    } catch (error) {
      console.error('Error marking proof as approved on Printjob:', error);
      toast.error('Failed to mark proof as approved on Printjob');
    }
  };

  const handleMarkAsNeedingChanges = async () => {
    try {
      console.log('🔄 Marking proof as needing changes for job:', job.job_id);
      
      // Clear proof_emailed_at and revert to active status
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({
          status: 'active',
          proof_emailed_at: null,
          notes: 'Proof requires changes - sent back for revision',
          updated_at: new Date().toISOString()
        })
        .eq('job_id', job.job_id)
        .eq('production_stage_id', job.current_stage_id);

      if (updateError) throw updateError;

      // Invalidate any active proof links
      await supabase
        .from('proof_links')
        .update({
          is_used: true,
          invalidated_at: new Date().toISOString(),
          client_response: 'changes_needed',
          client_notes: 'Manually marked as needing changes'
        })
        .eq('job_id', job.job_id)
        .eq('stage_instance_id', stageInstance?.id)
        .eq('is_used', false);

      // Update local state
      if (stageInstance) {
        setStageInstance({
          ...stageInstance,
          status: 'active',
          proof_emailed_at: undefined
        });
      }

      toast.success("✅ Proof reverted - ready for changes");
      if (onReloadModal) await onReloadModal();
      onRefresh?.();
    } catch (error) {
      console.error('Error marking proof as needing changes:', error);
      toast.error("Failed to revert proof");
    }
  };

  const handleProofApproved = async () => {
    // Check HP12000 paper size validation before proceeding
    if (!hp12000ValidationStatus.isValid) {
      toast.error(hp12000ValidationStatus.message || 'Please assign paper sizes to all HP12000 stages before approving proof');
      return;
    }

    try {
      console.log(`🎯 Proof approved for job ${job.job_id} - showing allocation options`);
      
      if (!stageInstance?.id) {
        toast.error('No stage instance found');
        return;
      }

      const currentTime = new Date().toISOString();

      // Mark proof as approved in the stage instance, but DON'T complete it yet
      // Stage completion happens when user chooses batch or printing route
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({
          proof_approved_manually_at: currentTime,
          updated_at: currentTime,
          started_by: stageInstance.started_by || user?.id || null,
          completed_by: user?.id || null
        })
        .eq('id', stageInstance.id);

      if (updateError) throw updateError;

      // Update local state to show the approval
      if (stageInstance) {
        setStageInstance({
          ...stageInstance,
          proof_approved_manually_at: currentTime,
          started_by: stageInstance.started_by || user?.id || undefined,
          completed_by: user?.id || undefined
        });
      }
      
      // Show allocation choice UI - stage is still 'proof' so modal stays open
      onProofApprovalFlowChange('choosing_allocation');
      toast.success('Proof approved! Choose next step.');
      
      // NO refresh here - we don't want to reload until user makes their choice
      
    } catch (error) {
      console.error('Error marking proof as approved:', error);
      toast.error('Failed to mark proof as approved');
    }
  };

  const handleSendToBatchAllocation = async () => {
    const currentStageInstanceId = await getCurrentStageInstanceId();
    if (!currentStageInstanceId) {
      toast.error("No current stage instance found");
      return;
    }

    try {
      console.log('🔄 Completing proof stage and sending to batch allocation');
      
      // NOW complete the proof stage (triggers scheduling)
      const success = await completeProofStage(job.job_id, currentStageInstanceId);

      if (!success) {
        throw new Error('Failed to complete proof stage');
      }

      // Update job status to indicate batch processing
      const { error: jobError } = await supabase
        .from('production_jobs')
        .update({
          status: 'Batch Allocation',
          batch_category: selectedBatchCategory,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.job_id);

      if (jobError) throw jobError;

      toast.success("Job sent to batch allocation - scheduling triggered");
      onRefresh?.();
      onClose();
    } catch (error) {
      console.error('❌ Error sending to batch allocation:', error);
      toast.error("Failed to send job to batch allocation");
    }
  };

  const handleAdvanceToPrintingStage = async () => {
    const currentStageInstanceId = await getCurrentStageInstanceId();
    if (!currentStageInstanceId) {
      toast.error("No current stage instance found");
      return;
    }

    try {
      console.log('🔄 Completing proof stage and advancing to printing');
      
      // Complete the proof stage first (triggers scheduling)
      const completeSuccess = await completeProofStage(job.job_id, currentStageInstanceId);

      if (!completeSuccess) {
        throw new Error('Failed to complete proof stage');
      }

      // Then skip conditional stages and advance to printing
      const advanceSuccess = await completeStageAndSkipConditional(
        job.job_id,
        currentStageInstanceId,
        'Proof approved - advancing directly to printing'
      );

      if (!advanceSuccess) {
        throw new Error('Failed to advance to printing stage');
      }

      // Update job status to Ready to Print
      const { error: jobError } = await supabase
        .from('production_jobs')
        .update({
          status: 'Ready to Print',
          updated_at: new Date().toISOString()
        })
        .eq('id', job.job_id);

      if (jobError) throw jobError;

      toast.success("Job advanced to printing stage - scheduling triggered");
      onRefresh?.();
      onClose();
    } catch (error) {
      console.error('❌ Error advancing to printing stage:', error);
      toast.error("Failed to advance to printing stage");
    }
  };

  const handleBatchJobCreated = async () => {
    // When batch job is created, we need to advance the main production job
    await handleSendToBatchAllocation();
  };

  const hasProofBeenEmailed = stageInstance?.proof_emailed_at;
  const hasProofBeenApproved = stageInstance?.proof_approved_manually_at;

  if (stageStatus === 'pending') {
    return (
      <div className="space-y-3">
        <Button 
          onClick={handleStartProof}
          disabled={!scanCompleted || isLoading || isProcessing}
          className={`w-full ${scanCompleted ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}`}
        >
          <Play className="h-4 w-4 mr-2" />
          {scanCompleted ? "Start Proof Process" : "Scan Required First"}
        </Button>
      </div>
    );
  }

  if (stageStatus === 'active') {
    if (!hasProofBeenEmailed) {
      return (
        <div className="space-y-4">
          {/* Manual Entry Options */}
          <div className="space-y-3 border-b pb-4 mb-4">
            <p className="text-sm font-medium text-gray-700">How was this proof handled?</p>
            
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline"
                onClick={handleManualEmailSent}
                disabled={isLoading || isProcessing}
                className="w-full"
              >
                <Mail className="h-4 w-4 mr-2" />
                Emailed Manually
              </Button>
              
              <Button 
                variant="outline"
                onClick={handlePrintjobApproval}
                disabled={isLoading || isProcessing}
                className="w-full"
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Approved on Printjob
              </Button>
            </div>
            
            <div className="text-xs text-gray-500 text-center">
              Or use the online approval system below
            </div>
          </div>

          {!generatedProofLink ? (
            <>
              {/* PDF Upload Section */}
              <div className="space-y-2">
                <Label htmlFor="proof-pdf" className="text-sm font-medium">
                  Upload Proof PDF *
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="proof-pdf"
                    type="file"
                    accept="application/pdf"
                    onChange={handleProofPdfChange}
                    className="flex-1"
                  />
                </div>
                {proofPdfInfo && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>{proofPdfInfo.name} ({(proofPdfInfo.sizeInKB / 1024).toFixed(2)} MB)</span>
                  </div>
                )}
              </div>

              {/* Client Email Input */}
              <div className="space-y-2">
                <Label htmlFor="client-email" className="text-sm font-medium">
                  Client Email *
                </Label>
                <Input
                  id="client-email"
                  type="email"
                  placeholder="client@example.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  required
                />
              </div>

              {/* Client Name Input */}
              <div className="space-y-2">
                <Label htmlFor="client-name" className="text-sm font-medium">
                  Client Name (Optional)
                </Label>
                <Input
                  id="client-name"
                  type="text"
                  placeholder="John Doe"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              {/* Generate Link Button */}
              <Button 
                onClick={handleGenerateProofLink}
                disabled={
                  isLoading || 
                  isProcessing || 
                  isGenerating || 
                  isUploadingPdf || 
                  !proofPdfFile || 
                  !clientEmail
                }
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <Mail className="h-4 w-4 mr-2" />
                {isUploadingPdf ? 'Uploading PDF...' : isGenerating ? 'Sending to Client...' : 'Send to Client for Approval'}
              </Button>
            </>
          ) : (
            <>
              {/* Generated Link Display */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-green-700">
                  ✅ Email Sent to Client
                </Label>
                <div className="flex gap-2">
                  <Input 
                    value={generatedProofLink || 'Generating link...'}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    onClick={handleCopyLink}
                    variant="outline"
                    size="icon"
                    disabled={!generatedProofLink}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {!generatedProofLink && (
                  <p className="text-xs text-muted-foreground">
                    Link is being generated and will appear here shortly...
                  </p>
                )}
              </div>
              
              {/* Confirm Proof Sent Button */}
              <Button 
                onClick={handleProofEmailed}
                disabled={isLoading || isProcessing}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Mail className="h-4 w-4 mr-2" />
                Confirm Proof Sent
              </Button>
            </>
          )}
        </div>
      );
    }

    if (hasProofBeenEmailed && !hasProofBeenApproved) {
      return (
        <div className="space-y-3">
          {/* HP12000 Paper Size Selector */}
          <HP12000PaperSizeSelector 
            jobId={job.job_id}
            onValidationChange={(isValid, message) => setHP12000ValidationStatus({ isValid, message })}
          />
          
          <div className="flex items-center justify-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-md border-l-4 border-amber-500">
            <Clock className="h-4 w-4 animate-pulse" />
            <span className="text-sm font-medium">🟡 Awaiting Online Client Approval</span>
          </div>
          
          <div className="text-xs text-gray-500 text-center">
            Emailed: {new Date(hasProofBeenEmailed).toLocaleDateString()} at {new Date(hasProofBeenEmailed).toLocaleTimeString()}
          </div>

          {/* Manage Proof Button */}
          {stageInstance?.id && (
            <Button 
              onClick={() => setIsManageProofOpen(true)}
              variant="outline"
              className="w-full"
              disabled={isLoading || isProcessing}
            >
              <FileText className="h-4 w-4 mr-2" />
              Manage Proof (Edit/Resend/Regenerate)
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button 
              onClick={handleProofApproved}
              disabled={isLoading || isProcessing || !hp12000ValidationStatus.isValid}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              {hp12000ValidationStatus.isValid ? 'Approve' : 'Sizes Required'}
            </Button>

            <Button 
              onClick={handleMarkAsNeedingChanges}
              disabled={isLoading || isProcessing}
              variant="destructive"
              className="w-full"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Needs Changes
            </Button>
          </div>
        </div>
      );
    }

    if (hasProofBeenApproved) {
      if (proofApprovalFlow === 'choosing_allocation') {
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 p-3 rounded-md">
              <ThumbsUp className="h-4 w-4" />
              <span className="text-sm font-medium">Proof Approved - Choose Next Step</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Button 
                onClick={() => onProofApprovalFlowChange('batch_allocation')}
                disabled={isLoading || isProcessing}
                className="w-full bg-orange-600 hover:bg-orange-700"
              >
                <Package className="h-4 w-4 mr-2" />
                Send to Batch Processing
              </Button>
              
              <Button 
                onClick={handleAdvanceToPrintingStage}
                disabled={isLoading || isProcessing}
                className="w-full bg-blue-600 hover:bg-blue-700"
                variant="outline"
              >
                <Printer className="h-4 w-4 mr-2" />
                {isLoading || isProcessing ? 'Processing...' : 'Send Directly to Printing'}
              </Button>
            </div>
          </div>
        );
      }

      if (proofApprovalFlow === 'batch_allocation') {
        if (!selectedBatchCategory) {
          return (
            <div className="space-y-4">
              <BatchCategorySelector
                onSelectCategory={onBatchCategoryChange}
                selectedCategory={selectedBatchCategory}
                disabled={isLoading || isProcessing}
              />
              <Button 
                onClick={() => onProofApprovalFlowChange('choosing_allocation')}
                variant="outline"
                className="w-full"
                disabled={isProcessing}
              >
                Back to Options
              </Button>
            </div>
          );
        } else {
          return (
            <div className="space-y-4">
              <BatchJobFormRHF
                wo_no={job.wo_no}
                customer={job.customer || ''}
                qty={job.qty || 1}
                due_date={job.due_date ? new Date(job.due_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                batchCategory={selectedBatchCategory}
                onJobCreated={handleBatchJobCreated}
                onCancel={() => onProofApprovalFlowChange('choosing_allocation')}
              />
            </div>
          );
        }
      }
    }
  }

  // Handle changes_requested status (client requested changes)
  if (stageStatus === 'changes_requested') {
    return (
      <div className="space-y-3">
        {/* Display Client Change Request */}
        <ClientChangeRequestCard
          clientName={stageInstance?.client_name || null}
          clientEmail={stageInstance?.client_email || null}
          requestedAt={stageInstance?.proof_emailed_at || null}
          feedback={stageInstance?.notes || 'No specific feedback provided'}
          reworkCount={stageInstance?.rework_count || 0}
        />

        {/* Upload Revised Proof Button */}
        {onOpenProofDialog && (
          <Button 
            onClick={onOpenProofDialog}
            className="w-full bg-orange-600 hover:bg-orange-700"
            disabled={isLoading || isProcessing}
          >
            <FileText className="h-4 w-4 mr-2" />
            Upload Revised Proof
          </Button>
        )}
      </div>
    );
  }

  // Handle awaiting_approval status (proof sent, waiting for client)
  if (stageStatus === 'awaiting_approval') {
    return (
      <>
        <div className="space-y-3">
          {/* HP12000 Paper Size Selector */}
          <HP12000PaperSizeSelector 
            jobId={job.job_id}
            onValidationChange={(isValid, message) => setHP12000ValidationStatus({ isValid, message })}
          />
          
          <div className="flex items-center justify-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-md border-l-4 border-amber-500">
            <Clock className="h-4 w-4 animate-pulse" />
            <span className="text-sm font-medium">🟡 Awaiting Online Client Approval</span>
          </div>
          
          <div className="text-xs text-gray-500 text-center">
            Emailed: {hasProofBeenEmailed ? new Date(hasProofBeenEmailed).toLocaleDateString() + ' at ' + new Date(hasProofBeenEmailed).toLocaleTimeString() : 'Unknown'}
          </div>

          {/* Manage Proof Button */}
          {stageInstance?.id && (
            <Button 
              onClick={() => setIsManageProofOpen(true)}
              variant="outline"
              className="w-full"
              disabled={isLoading || isProcessing}
            >
              <FileText className="h-4 w-4 mr-2" />
              Manage Proof (Edit/Resend/Regenerate)
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button 
              onClick={handleProofApproved}
              disabled={isLoading || isProcessing || !hp12000ValidationStatus.isValid}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              {hp12000ValidationStatus.isValid ? 'Approve' : 'Sizes Required'}
            </Button>

            <Button 
              onClick={handleMarkAsNeedingChanges}
              disabled={isLoading || isProcessing}
              variant="destructive"
              className="w-full"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Needs Changes
            </Button>
          </div>
        </div>

        {stageInstance?.id && (
          <ManageProofDialog
            isOpen={isManageProofOpen}
            onClose={() => setIsManageProofOpen(false)}
            stageInstanceId={stageInstance.id}
            jobId={job.job_id}
            currentEmail={stageInstance.client_email}
            currentName={stageInstance.client_name}
            onRefresh={onRefresh}
          />
        )}
      </>
    );
  }

  return (
    <>
      {stageInstance?.id && (
        <ManageProofDialog
          isOpen={isManageProofOpen}
          onClose={() => setIsManageProofOpen(false)}
          stageInstanceId={stageInstance.id}
          jobId={job.job_id}
          currentEmail={stageInstance.client_email}
          currentName={stageInstance.client_name}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
};
