
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/tracker/useUserRole";
import { useUserStagePermissions } from "@/hooks/tracker/useUserStagePermissions";
import { useAuth } from "@/hooks/useAuth";

export const useStageActions = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();
  const { isAdmin, isManager } = useUserRole();
  const { canUserWorkOnStage } = useUserStagePermissions(user?.id);

  const startStage = useCallback(async (stageId: string, qrData?: any) => {
    setIsProcessing(true);
    try {
      // Get stage info to check permissions and payment status
      const { data: stageData, error: fetchError } = await supabase
        .from('job_stage_instances')
        .select('production_stage_id, job_id, job_table_name')
        .eq('id', stageId)
        .single();

      if (fetchError) throw fetchError;

      // Check payment status on the parent job
      const { data: jobData } = await supabase
        .from('production_jobs')
        .select('payment_status')
        .eq('id', stageData.job_id)
        .single();

      if (jobData?.payment_status === 'awaiting_payment') {
        toast.error("Cannot start — awaiting payment", {
          description: "This order must be released for production before work can begin."
        });
        setIsProcessing(false);
        return false;
      }

      // Check permissions - admins and managers can bypass
      if (!isAdmin && !isManager) {
        const hasPermission = canUserWorkOnStage(stageData.production_stage_id);
        if (!hasPermission) {
          toast.error("Access Denied", {
            description: "You don't have permission to work on this stage"
          });
          setIsProcessing(false);
          return false;
        }
      }
      
      const { error } = await supabase
        .from('job_stage_instances')
        .update({ 
          status: 'active',
          started_at: new Date().toISOString(),
          started_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', stageId)
        .eq('status', 'pending');

      if (error) throw error;

      toast.success("Stage started successfully");
      return true;
    } catch (err) {
      toast.error("Failed to start stage");
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user?.id, isAdmin, isManager, canUserWorkOnStage]);

  const completeStage = useCallback(async (stageId: string, notes?: string) => {
    setIsProcessing(true);
    try {
      // Completing stage
      
      // Get stage info before completing to check permissions AND if it's a proof stage
      const { data: stageInfo, error: stageInfoError } = await supabase
        .from('job_stage_instances')
        .select(`
          id,
          job_id,
          job_table_name,
          production_stage_id,
          production_stage:production_stages(name)
        `)
        .eq('id', stageId)
        .single();

      if (stageInfoError) throw stageInfoError;

      // Check permissions - admins and managers can bypass
      if (!isAdmin && !isManager) {
        const hasPermission = canUserWorkOnStage(stageInfo.production_stage_id);
        if (!hasPermission) {
          toast.error("Access Denied", {
            description: "You don't have permission to work on this stage"
          });
          setIsProcessing(false);
          return false;
        }
      }

      const isProofStage = stageInfo?.production_stage?.name?.toLowerCase().includes('proof');
      
      // Build update object - include proof_approved_manually_at if this is a proof stage
      const updateData = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: user?.id,
        notes: notes || null,
        updated_at: new Date().toISOString(),
        ...(isProofStage && { proof_approved_manually_at: new Date().toISOString() })
      };

      const { error } = await supabase
        .from('job_stage_instances')
        .update(updateData)
        .eq('id', stageId)
        .eq('status', 'active');

      if (error) throw error;

      // If this was a proof stage completion, trigger queue-based due date calculation
      if (isProofStage && stageInfo?.job_id) {
        try {
          const { error: calcError } = await supabase.functions.invoke('calculate-due-dates', {
            body: {
              jobIds: [stageInfo.job_id],
              tableName: stageInfo.job_table_name || 'production_jobs',
              priority: 'high',
              triggerReason: 'proof_approval'
            }
          });

          if (calcError) {
            toast.error('Failed to update due date after proof approval');
          } else {
            toast.success('Due date updated based on current production queue');
          }
        } catch (calcErr) {
          toast.error('Failed to update due date');
        }
      }

      toast.success("Stage completed successfully");
      return true;
    } catch (err) {
      toast.error("Failed to complete stage");
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user?.id, isAdmin, isManager, canUserWorkOnStage]);

  const completeStageAndSkipConditional = useCallback(async (
    jobId: string, 
    currentStageInstanceId: string, 
    notes?: string
  ) => {
    setIsProcessing(true);
    try {
      // Completing stage and skipping conditional stages

      // First, get the current stage instance details including production stage name
      const { data: currentStageInstance, error: currentStageError } = await supabase
        .from('job_stage_instances')
        .select(`
          stage_order, 
          job_table_name, 
          status, 
          production_stage_id, 
          category_id,
          job_id,
          production_stage:production_stages(name)
        `)
        .eq('id', currentStageInstanceId)
        .single();

      if (currentStageError || !currentStageInstance) {
        throw new Error(`Could not find stage instance with ID ${currentStageInstanceId}: ${currentStageError?.message}`);
      }

      // Current stage instance retrieved

      const isProofStage = currentStageInstance?.production_stage?.name?.toLowerCase().includes('proof');

      // Complete the current stage - include proof_approved_manually_at if this is a proof stage
      const updateData = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: user?.id,
        notes: notes || null,
        updated_at: new Date().toISOString(),
        ...(isProofStage && { proof_approved_manually_at: new Date().toISOString() })
      };

      const { error: completeError } = await supabase
        .from('job_stage_instances')
        .update(updateData)
        .eq('id', currentStageInstanceId);

      if (completeError) {
        throw new Error(`Failed to complete current stage: ${completeError.message}`);
      }

      // If this was a proof stage completion, trigger queue-based due date calculation
      if (isProofStage && currentStageInstance?.job_id) {
        try {
          const { error: calcError } = await supabase.functions.invoke('calculate-due-dates', {
            body: {
              jobIds: [currentStageInstance.job_id],
              tableName: currentStageInstance.job_table_name || 'production_jobs',
              priority: 'high',
              triggerReason: 'proof_approval'
            }
          });

          if (calcError) {
            toast.error('Failed to update due date after proof approval');
          } else {
            toast.success('Due date updated based on current production queue');
          }
        } catch (calcErr) {
          toast.error('Failed to update due date');
        }
      }

      // Get all pending stages after the current one, ordered by stage_order
      const { data: pendingStages, error: pendingStagesError } = await supabase
        .from('job_stage_instances')
        .select(`
          id,
          production_stage_id,
          stage_order,
          production_stages!inner(name)
        `)
        .eq('job_id', jobId)
        .eq('job_table_name', currentStageInstance.job_table_name)
        .eq('status', 'pending')
        .gt('stage_order', currentStageInstance.stage_order)
        .order('stage_order', { ascending: true });

      if (pendingStagesError) throw pendingStagesError;

      if (!pendingStages || pendingStages.length === 0) {
        toast.success("Stage completed - no more stages to activate");
        return true;
      }

      // Find the first non-conditional stage using simple pattern matching
      let nextStageToActivate = null;
      
      for (const stage of pendingStages) {
        const stageName = stage.production_stages?.name || '';
        // Skip stages that appear to be conditional based on naming patterns
        const isConditionalByPattern = stageName.toLowerCase().includes('batch') || 
                                     stageName.toLowerCase().includes('allocation');
        
        if (!isConditionalByPattern) {
          nextStageToActivate = stage;
          break;
        }
      }

      // If no non-conditional stage found, use the first pending stage as fallback
      if (!nextStageToActivate && pendingStages.length > 0) {
        nextStageToActivate = pendingStages[0];
      }

      // CRITICAL: Do not auto-activate next stage if current stage was a proof stage
      if (nextStageToActivate && !isProofStage) {
        const { error: activateError } = await supabase
          .from('job_stage_instances')
          .update({
            status: 'active',
            started_at: new Date().toISOString(),
            started_by: user?.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', nextStageToActivate.id);

        if (activateError) throw activateError;

        toast.success(`Stage completed and advanced to: ${nextStageToActivate.production_stages?.name}`);
      } else if (nextStageToActivate && isProofStage) {
        toast.success(`Proof stage completed - ${nextStageToActivate.production_stages?.name} awaits manual activation`);
      } else {
        toast.success("Stage completed - workflow finished");
      }

      return true;
    } catch (err) {
      toast.error(`Failed to complete stage and advance workflow: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user?.id]);

  const holdStage = useCallback(async (
    stageId: string, 
    completionPercentage: number, 
    holdReason: string
  ) => {
    setIsProcessing(true);
    try {
      // Holding stage
      
      // Get stage info to check permissions
      const { data: stageData, error: fetchError } = await supabase
        .from('job_stage_instances')
        .select('production_stage_id, scheduled_minutes')
        .eq('id', stageId)
        .single();

      if (fetchError) throw fetchError;

      // Check permissions - admins and managers can bypass
      if (!isAdmin && !isManager) {
        const hasPermission = canUserWorkOnStage(stageData.production_stage_id);
        if (!hasPermission) {
          toast.error("Access Denied", {
            description: "You don't have permission to work on this stage"
          });
          setIsProcessing(false);
          return false;
        }
      }
      
      const scheduledMinutes = stageData?.scheduled_minutes || 0;
      const remainingMinutes = Math.round(scheduledMinutes * (1 - completionPercentage / 100));

      const { error } = await supabase
        .from('job_stage_instances')
        .update({
          status: 'on_hold',
          completion_percentage: completionPercentage,
          remaining_minutes: remainingMinutes,
          hold_reason: holdReason,
          held_at: new Date().toISOString(),
          held_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', stageId)
        .eq('status', 'active');

      if (error) throw error;

      toast.success(`Stage held at ${completionPercentage}% completion`);
      return true;
    } catch (err) {
      toast.error("Failed to hold stage");
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user?.id, isAdmin, isManager, canUserWorkOnStage]);

  const resumeStage = useCallback(async (stageId: string) => {
    setIsProcessing(true);
    try {
      // Resuming stage
      
      const { error } = await supabase
        .from('job_stage_instances')
        .update({
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', stageId)
        .eq('status', 'on_hold');

      if (error) throw error;

      toast.success("Stage resumed");
      return true;
    } catch (err) {
      toast.error("Failed to resume stage");
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    startStage,
    completeStage,
    completeStageAndSkipConditional,
    holdStage,
    resumeStage,
    isProcessing
  };
};
