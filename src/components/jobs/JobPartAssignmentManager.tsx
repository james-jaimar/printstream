import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Clock, Play, Package, Wrench, Truck, ChevronDown, ChevronRight, List, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { autoAssignParts } from '@/utils/tracker/partAutoAssignment';
import { scheduleJobs } from '@/utils/scheduler';

interface SubTask {
  id: string;
  stage_specification_id: string;
  specification_name: string;
  sub_task_order: number;
  status: string;
  estimated_duration_minutes: number | null;
  quantity: number | null;
}

interface JobStageInstance {
  id: string;
  production_stage_id: string;
  stage_order: number;
  status: string;
  part_assignment: string;
  part_name: string | null;
  quantity: number | null;
  sub_tasks?: SubTask[];
}

interface ProductionStage {
  id: string;
  name: string;
  color: string;
  stage_group_id: string | null;
}

interface StageGroup {
  id: string;
  name: string;
  parallel_processing_enabled: boolean;
}

interface EnrichedJobStageInstance extends JobStageInstance {
  production_stages: {
    name: string;
    color: string;
    stage_group_id: string | null;
  };
  stage_groups?: {
    name: string;
    parallel_processing_enabled: boolean;
  };
}

interface Job {
  id: string;
  wo_no: string;
  customer: string;
  reference: string;
  status: string;
  has_custom_workflow: boolean;
}

interface JobPartAssignmentManagerProps {
  jobId: string;
  jobTableName: string;
  open: boolean;
  onClose: () => void;
}

const PART_ASSIGNMENT_OPTIONS = [
  { value: 'both', label: 'Both Parts', icon: Package, color: 'bg-blue-100 text-blue-800' },
  { value: 'cover', label: 'Cover Only', icon: CheckCircle2, color: 'bg-green-100 text-green-800' },
  { value: 'text', label: 'Text Only', icon: Wrench, color: 'bg-orange-100 text-orange-800' },
  { value: 'none', label: 'No Assignment', icon: Clock, color: 'bg-gray-100 text-gray-800' }
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'active': return <Play className="h-4 w-4 text-blue-600" />;
    case 'pending': return <Clock className="h-4 w-4 text-orange-600" />;
    default: return <Clock className="h-4 w-4 text-gray-600" />;
  }
};

const JobPartAssignmentManager: React.FC<JobPartAssignmentManagerProps> = ({
  jobId,
  jobTableName,
  open,
  onClose
}) => {
  const queryClient = useQueryClient();
  const [expandedStageIds, setExpandedStageIds] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Reset hasChanges when dialog closes
  useEffect(() => {
    if (!open) {
      setHasChanges(false);
    }
  }, [open]);

  // Optimized job details query with proper caching
  const { data: job } = useQuery<Job>({
    queryKey: ['job-details', jobId],
    queryFn: async (): Promise<Job> => {
      if (jobTableName !== 'production_jobs') {
        throw new Error('Currently only production_jobs are supported');
      }
      
      const { data, error } = await supabase
        .from('production_jobs')
        .select('id, wo_no, customer, reference, status, has_custom_workflow')
        .eq('id', jobId)
        .single();
      
      if (error) throw error;
      return data as Job;
    },
    enabled: open,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000 // 10 minutes (replaced cacheTime)
  });

  // Optimized stages query - simplified and cached
  const { data: stages, isLoading } = useQuery<JobStageInstance[]>({
    queryKey: ['job-stages-simple', jobId],
    queryFn: async (): Promise<JobStageInstance[]> => {
      const { data, error } = await supabase
        .from('job_stage_instances')
        .select(`
          id,
          production_stage_id,
          stage_order,
          status,
          part_assignment,
          part_name,
          quantity
        `)
        .eq('job_id', jobId)
        .eq('job_table_name', jobTableName)
        .order('stage_order');
      
      if (error) throw error;
      return data as JobStageInstance[];
    },
    enabled: open,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000 // 5 minutes
  });

  // Separate query for production stages to avoid complex joins
  const { data: productionStages } = useQuery<ProductionStage[]>({
    queryKey: ['production-stages-info'],
    queryFn: async (): Promise<ProductionStage[]> => {
      const { data, error } = await supabase
        .from('production_stages')
        .select(`
          id,
          name,
          color,
          stage_group_id
        `);
      
      if (error) throw error;
      return data as ProductionStage[];
    },
    enabled: open,
    staleTime: 10 * 60 * 1000, // 10 minutes - stages rarely change
    gcTime: 30 * 60 * 1000 // 30 minutes
  });

  // Separate query for stage groups
  const { data: stageGroups } = useQuery<StageGroup[]>({
    queryKey: ['stage-groups-info'],
    queryFn: async (): Promise<StageGroup[]> => {
      const { data, error } = await supabase
        .from('stage_groups')
        .select(`
          id,
          name,
          parallel_processing_enabled
        `);
      
      if (error) throw error;
      return data as StageGroup[];
    },
    enabled: open,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000 // 30 minutes
  });

  // Query for sub-tasks across all stages
  const { data: allSubTasks } = useQuery({
    queryKey: ['stage-sub-tasks-all', jobId],
    queryFn: async () => {
      if (!stages) return [];
      
      const stageInstanceIds = stages.map(s => s.id);
      const { data, error } = await supabase
        .from('stage_sub_tasks' as any)
        .select(`
          id,
          stage_instance_id,
          stage_specification_id,
          sub_task_order,
          status,
          estimated_duration_minutes,
          quantity,
          stage_specifications!stage_sub_tasks_stage_specification_id_fkey(name)
        `)
        .in('stage_instance_id', stageInstanceIds)
        .order('sub_task_order');

      if (error) throw error;
      
      return (data || []).map((item: any) => ({
        id: item.id,
        stage_instance_id: item.stage_instance_id,
        stage_specification_id: item.stage_specification_id,
        specification_name: item.stage_specifications?.name || 'Unknown',
        sub_task_order: item.sub_task_order,
        status: item.status,
        estimated_duration_minutes: item.estimated_duration_minutes,
        quantity: item.quantity
      }));
    },
    enabled: open && !!stages && stages.length > 0,
    staleTime: 2 * 60 * 1000
  });

  // Create enriched stages by joining data
  const enrichedStages: EnrichedJobStageInstance[] = React.useMemo(() => {
    if (!stages || !productionStages || !stageGroups) return [];
    
    return stages.map(stage => {
      const productionStage = productionStages.find(ps => ps.id === stage.production_stage_id);
      const stageGroup = productionStage?.stage_group_id 
        ? stageGroups.find(sg => sg.id === productionStage.stage_group_id)
        : undefined;
      
      // Attach sub-tasks to this stage
      const stageTasks = allSubTasks?.filter(st => st.stage_instance_id === stage.id) || [];
      
      return {
        ...stage,
        sub_tasks: stageTasks,
        production_stages: {
          name: productionStage?.name || 'Unknown Stage',
          color: productionStage?.color || '#6B7280',
          stage_group_id: productionStage?.stage_group_id || null
        },
        stage_groups: stageGroup ? {
          name: stageGroup.name,
          parallel_processing_enabled: stageGroup.parallel_processing_enabled
        } : undefined
      };
    });
  }, [stages, productionStages, stageGroups, allSubTasks]);

  // Optimized mutation with specific query key invalidation
  const updatePartAssignmentMutation = useMutation({
    mutationFn: async ({ stageId, partAssignment }: { stageId: string; partAssignment: string }) => {
      // Convert part assignment to capitalized part name for display
      const partName = partAssignment === 'none' ? null : 
        partAssignment.charAt(0).toUpperCase() + partAssignment.slice(1);
      
      const { error } = await supabase
        .from('job_stage_instances')
        .update({ 
          part_assignment: partAssignment,
          part_name: partName
        })
        .eq('id', stageId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      // Only invalidate the specific stage query, not all job-related queries
      queryClient.invalidateQueries({ queryKey: ['job-stages-simple', jobId] });
      setHasChanges(true);
      toast.success('Part assignment updated - reschedule recommended');
    },
    onError: (error) => {
      toast.error('Failed to update part assignment: ' + error.message);
    }
  });

  // Bulk update mutation for auto-assignment (silent, no toasts)
  const bulkUpdatePartAssignmentsMutation = useMutation({
    mutationFn: async (updates: Array<{ stageId: string; partAssignment: string }>) => {
      const promises = updates.map(({ stageId, partAssignment }) => {
        const partName = partAssignment === 'none' ? null : 
          partAssignment.charAt(0).toUpperCase() + partAssignment.slice(1);
        
        return supabase
          .from('job_stage_instances')
          .update({ 
            part_assignment: partAssignment,
            part_name: partName
          })
          .eq('id', stageId);
      });
      
      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) throw new Error(`Failed to update ${errors.length} stages`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-stages-simple', jobId] });
    },
    onError: (error) => {
      console.error('Auto-assignment failed:', error);
    }
  });

  // Auto-assign parts when dialog opens
  useEffect(() => {
    if (!open || !enrichedStages || enrichedStages.length === 0) return;
    
    // Detect available parts from existing stage instances
    const detectedParts = new Set<string>();
    enrichedStages.forEach(stage => {
      if (stage.part_name) {
        detectedParts.add(stage.part_name.toLowerCase());
      }
    });
    
    const availableParts = Array.from(detectedParts);
    
    // Only auto-assign if we have both cover and text
    if (!availableParts.includes('cover') || !availableParts.includes('text')) {
      return;
    }
    
    // Build multiPartStages structure for the auto-assignment utility
    const multiPartStages = enrichedStages
      .filter(stage => stage.part_assignment === 'both' && stage.status === 'pending')
      .map(stage => ({
        stage_id: stage.id,
        stage_name: stage.production_stages.name,
        stage_color: stage.production_stages.color,
        part_types: availableParts
      }));
    
    if (multiPartStages.length === 0) return;
    
    // Get auto-assignment suggestions
    const suggestedAssignments = autoAssignParts(availableParts, multiPartStages);
    
    if (Object.keys(suggestedAssignments).length === 0) return;
    
    // Build update list
    const updates: Array<{ stageId: string; partAssignment: string }> = [];
    
    Object.entries(suggestedAssignments).forEach(([partName, stageId]) => {
      updates.push({
        stageId: stageId,
        partAssignment: partName.toLowerCase()
      });
    });
    
    if (updates.length > 0) {
      console.log(`🔄 Auto-assigning ${updates.length} stage(s) to parts...`);
      bulkUpdatePartAssignmentsMutation.mutate(updates);
    }
  }, [open, enrichedStages]);

  const handlePartAssignmentChange = (stageId: string, newAssignment: string) => {
    updatePartAssignmentMutation.mutate({ stageId, partAssignment: newAssignment });
  };

  const handleReschedule = async () => {
    setIsRescheduling(true);
    try {
      const result = await scheduleJobs([jobId], true);
      if (result) {
        toast.success(`Job rescheduled: ${result.wrote_slots} time slots updated`);
        setHasChanges(false);
        // Invalidate schedule-related queries
        queryClient.invalidateQueries({ queryKey: ['schedule'] });
        queryClient.invalidateQueries({ queryKey: ['job-stages-simple', jobId] });
      } else {
        toast.error('Reschedule returned no result');
      }
    } catch (error: any) {
      toast.error(`Reschedule failed: ${error?.message || error}`);
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      toast.info('Part assignments saved. Remember to reschedule if needed.');
    }
    onClose();
  };

  const groupStagesByGroup = () => {
    if (!enrichedStages) return [];
    
    const grouped: { [key: string]: EnrichedJobStageInstance[] } = {};
    
    enrichedStages.forEach(stage => {
      const groupName = stage.production_stages.stage_group_id 
        ? stage.stage_groups?.name || 'Unknown Group'
        : 'Ungrouped Stages';
      
      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName].push(stage);
    });
    
    return Object.entries(grouped).map(([groupName, groupStages]) => ({
      name: groupName,
      stages: groupStages,
      parallelEnabled: groupStages[0]?.stage_groups?.parallel_processing_enabled || false
    }));
  };

  const getPartAssignmentOption = (value: string) => {
    return PART_ASSIGNMENT_OPTIONS.find(opt => opt.value === value) || PART_ASSIGNMENT_OPTIONS[0];
  };

  const toggleStageExpansion = (stageId: string) => {
    setExpandedStageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stageId)) {
        newSet.delete(stageId);
      } else {
        newSet.add(stageId);
      }
      return newSet;
    });
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Job Part Assignment - {job?.wo_no}
          </DialogTitle>
        </DialogHeader>

        {job && (
          <div className="mb-4 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Customer:</span>
                <div className="font-medium">{job.customer}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Reference:</span>
                <div className="font-medium">{job.reference}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <div className="font-medium">{job.status}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Workflow:</span>
                <Badge variant={job.has_custom_workflow ? "default" : "secondary"}>
                  {job.has_custom_workflow ? 'Custom' : 'Standard'}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p>Loading stage information...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groupStagesByGroup().map((group, groupIndex) => (
              <Card key={group.name}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {group.name === 'Ungrouped Stages' ? (
                        <Clock className="h-5 w-5 text-gray-500" />
                      ) : (
                        <Package className="h-5 w-5" />
                      )}
                      {group.name}
                    </span>
                    {group.parallelEnabled && (
                      <Badge variant="default">Parallel Processing Enabled</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stage</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Current Assignment</TableHead>
                        <TableHead>Part Assignment</TableHead>
                        <TableHead>Quantity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.stages.map((stage) => {
                        const partOption = getPartAssignmentOption(stage.part_assignment);
                        const Icon = partOption.icon;
                        const hasSubTasks = stage.sub_tasks && stage.sub_tasks.length > 0;
                        const isExpanded = expandedStageIds.has(stage.id);
                        const completedSubTasks = stage.sub_tasks?.filter(st => st.status === 'completed').length || 0;
                        const totalSubTasks = stage.sub_tasks?.length || 0;
                        
                        return (
                          <React.Fragment key={stage.id}>
                            <TableRow className={hasSubTasks ? 'cursor-pointer hover:bg-muted/50' : ''}>
                              <TableCell onClick={() => hasSubTasks && toggleStageExpansion(stage.id)}>
                                <div className="flex items-center gap-2">
                                  {hasSubTasks && (
                                    isExpanded ? 
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" /> : 
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: stage.production_stages.color }}
                                  />
                                  <span className="font-medium">{stage.production_stages.name}</span>
                                  {hasSubTasks && (
                                    <Badge variant="secondary" className="ml-2">
                                      <List className="h-3 w-3 mr-1" />
                                      {totalSubTasks} ops
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(stage.status)}
                                  <span className="capitalize">{stage.status}</span>
                                </div>
                              </TableCell>
                              <TableCell>{stage.stage_order}</TableCell>
                              <TableCell>
                                <Badge className={partOption.color}>
                                  <Icon className="h-3 w-3 mr-1" />
                                  {partOption.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={stage.part_assignment}
                                  onValueChange={(value) => handlePartAssignmentChange(stage.id, value)}
                                  disabled={stage.status === 'completed'}
                                >
                                  <SelectTrigger className="w-40">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PART_ASSIGNMENT_OPTIONS.map((option) => {
                                      const OptionIcon = option.icon;
                                      return (
                                        <SelectItem key={option.value} value={option.value}>
                                          <div className="flex items-center gap-2">
                                            <OptionIcon className="h-4 w-4" />
                                            {option.label}
                                          </div>
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                {stage.quantity || '-'}
                              </TableCell>
                            </TableRow>
                            
                            {/* Sub-tasks expanded view */}
                            {isExpanded && hasSubTasks && (
                              <TableRow>
                                <TableCell colSpan={6} className="bg-muted/30 p-4">
                                  <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground mb-3">
                                      Operations ({completedSubTasks}/{totalSubTasks} completed)
                                    </div>
                                    <div className="grid gap-2">
                                      {stage.sub_tasks?.map((subTask, idx) => (
                                        <div 
                                          key={subTask.id}
                                          className="flex items-center gap-3 p-3 bg-background rounded-md border"
                                        >
                                          <div className="flex-shrink-0">
                                            {subTask.status === 'completed' ? (
                                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                                            ) : (
                                              <Clock className="h-4 w-4 text-orange-600" />
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm">
                                              {idx + 1}. {subTask.specification_name}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                              {subTask.estimated_duration_minutes && (
                                                <span>Est: {subTask.estimated_duration_minutes} mins</span>
                                              )}
                                              {subTask.quantity && (
                                                <span className="ml-3">Qty: {subTask.quantity}</span>
                                              )}
                                            </div>
                                          </div>
                                          <Badge 
                                            variant={subTask.status === 'completed' ? 'default' : 'secondary'}
                                            className="capitalize"
                                          >
                                            {subTask.status}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}

            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Part Assignment Guide</h4>
              <div className="grid grid-cols-2 gap-4 text-sm text-blue-800 dark:text-blue-200">
                <div>
                  <strong>Cover:</strong> For jobs that work on the cover/outer part (e.g., Cover Print, Cover Lamination)
                </div>
                <div>
                  <strong>Text:</strong> For jobs that work on the text/inner content (e.g., Text Print, Text Trimming)
                </div>
                <div>
                  <strong>Both:</strong> For operations that work on the complete job (e.g., Gathering, Perfect Binding)
                </div>
                <div>
                  <strong>None:</strong> For preparatory or administrative stages
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reschedule Warning Section */}
        {hasChanges && (
          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              <div className="flex items-center justify-between">
                <div>
                  <strong>Part assignments changed.</strong> Changes to parallel processing require a schedule recalculation to take effect.
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-4">
          {hasChanges && (
            <Button 
              onClick={handleReschedule} 
              disabled={isRescheduling}
              variant="default"
            >
              {isRescheduling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Rescheduling...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reschedule Now
                </>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            {hasChanges ? 'Close Without Rescheduling' : 'Close'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JobPartAssignmentManager;