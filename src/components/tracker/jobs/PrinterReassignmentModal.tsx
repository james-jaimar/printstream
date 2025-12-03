import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ArrowRight, Search, Printer, Loader2 } from 'lucide-react';
import { usePrinterReassignment, PendingPrintJob } from '@/hooks/tracker/usePrinterReassignment';
import { format } from 'date-fns';

interface PrinterReassignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const PrinterReassignmentModal: React.FC<PrinterReassignmentModalProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const {
    isLoading,
    printerStages,
    pendingJobs,
    targetSpecs,
    fetchPrinterStages,
    fetchPendingJobsForStage,
    fetchSpecsForStage,
    reassignJobs
  } = usePrinterReassignment();

  const [sourceStageId, setSourceStageId] = useState<string>('');
  const [targetStageId, setTargetStageId] = useState<string>('');
  const [targetSpecId, setTargetSpecId] = useState<string>('');
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Load printer stages on mount
  useEffect(() => {
    if (isOpen) {
      fetchPrinterStages();
    }
  }, [isOpen, fetchPrinterStages]);

  // Load jobs when source stage changes
  useEffect(() => {
    if (sourceStageId) {
      fetchPendingJobsForStage(sourceStageId);
      setSelectedJobIds(new Set());
    }
  }, [sourceStageId, fetchPendingJobsForStage]);

  // Load specs when target stage changes
  useEffect(() => {
    if (targetStageId) {
      fetchSpecsForStage(targetStageId);
      setTargetSpecId('');
    }
  }, [targetStageId, fetchSpecsForStage]);

  // Filter jobs by search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery) return pendingJobs;
    const query = searchQuery.toLowerCase();
    return pendingJobs.filter(job =>
      job.wo_no.toLowerCase().includes(query) ||
      job.customer?.toLowerCase().includes(query) ||
      job.reference?.toLowerCase().includes(query)
    );
  }, [pendingJobs, searchQuery]);

  // Get available target stages (exclude source)
  const availableTargetStages = useMemo(() => {
    return printerStages.filter(stage => stage.id !== sourceStageId);
  }, [printerStages, sourceStageId]);

  // Toggle job selection
  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  // Select/deselect all filtered jobs
  const toggleSelectAll = () => {
    if (selectedJobIds.size === filteredJobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(filteredJobs.map(j => j.stage_instance_id)));
    }
  };

  // Handle reassignment
  const handleReassign = async () => {
    if (!sourceStageId || !targetStageId || !targetSpecId || selectedJobIds.size === 0) {
      return;
    }

    const success = await reassignJobs({
      sourceStageId,
      targetStageId,
      targetStageSpecId: targetSpecId,
      stageInstanceIds: Array.from(selectedJobIds)
    });

    if (success) {
      onComplete();
      handleClose();
    }
  };

  const handleClose = () => {
    setSourceStageId('');
    setTargetStageId('');
    setTargetSpecId('');
    setSelectedJobIds(new Set());
    setSearchQuery('');
    onClose();
  };

  const sourceStageName = printerStages.find(s => s.id === sourceStageId)?.name || '';
  const targetStageName = printerStages.find(s => s.id === targetStageId)?.name || '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Move Jobs Between Printers
          </DialogTitle>
          <DialogDescription>
            Select jobs from one printer and move them to another with the appropriate specifications.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-4 py-4">
          {/* Step 1: Source Printer */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Step 1: Select Source Printer</Label>
            <Select value={sourceStageId} onValueChange={setSourceStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Select source printer..." />
              </SelectTrigger>
              <SelectContent>
                {printerStages.map(stage => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Job Selection */}
          {sourceStageId && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Step 2: Select Jobs to Move ({pendingJobs.length} available)
              </Label>
              
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by WO#, customer, or reference..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  disabled={filteredJobs.length === 0}
                >
                  {selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0
                    ? 'Deselect All'
                    : `Select All (${filteredJobs.length})`}
                </Button>
              </div>

              <ScrollArea className="h-48 border rounded-md">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No pending jobs found
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredJobs.map(job => (
                      <JobRow
                        key={job.stage_instance_id}
                        job={job}
                        isSelected={selectedJobIds.has(job.stage_instance_id)}
                        onToggle={() => toggleJobSelection(job.stage_instance_id)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>

              {selectedJobIds.size > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedJobIds.size} job(s) selected
                </p>
              )}
            </div>
          )}

          {/* Step 3: Target Printer */}
          {selectedJobIds.size > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Step 3: Select Target Printer</Label>
              <Select value={targetStageId} onValueChange={setTargetStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target printer..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTargetStages.map(stage => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Step 4: Target Specification */}
          {targetStageId && targetSpecs.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Step 4: Select Print Mode</Label>
              <RadioGroup value={targetSpecId} onValueChange={setTargetSpecId}>
                {targetSpecs.map(spec => (
                  <div key={spec.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50">
                    <RadioGroupItem value={spec.id} id={spec.id} />
                    <Label htmlFor={spec.id} className="flex-1 cursor-pointer">
                      <span className="font-medium">{spec.display_name || spec.name}</span>
                      {spec.description && (
                        <span className="text-sm text-muted-foreground ml-2">
                          - {spec.description}
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Preview */}
          {sourceStageId && targetStageId && targetSpecId && selectedJobIds.size > 0 && (
            <div className="p-3 bg-muted/50 rounded-md space-y-1">
              <p className="text-sm font-medium">Summary</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{sourceStageName}</span>
                <ArrowRight className="h-4 w-4" />
                <span className="font-medium">{targetStageName}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Moving {selectedJobIds.size} job(s) with{' '}
                <span className="font-medium">
                  {targetSpecs.find(s => s.id === targetSpecId)?.display_name || 'selected'} 
                </span>{' '}
                print mode
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleReassign}
            disabled={
              isLoading ||
              !sourceStageId ||
              !targetStageId ||
              !targetSpecId ||
              selectedJobIds.size === 0
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Moving...
              </>
            ) : (
              <>
                Move {selectedJobIds.size} Job(s) to {targetStageName || 'Target'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Job row component
interface JobRowProps {
  job: PendingPrintJob;
  isSelected: boolean;
  onToggle: () => void;
}

const JobRow: React.FC<JobRowProps> = ({ job, isSelected, onToggle }) => {
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
        isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
      }`}
      onClick={onToggle}
    >
      <Checkbox checked={isSelected} onCheckedChange={onToggle} />
      <div className="flex-1 min-w-0 grid grid-cols-5 gap-2 text-sm">
        <span className="font-mono font-medium truncate">{job.wo_no}</span>
        <span className="truncate text-muted-foreground">{job.customer || '-'}</span>
        <span className="truncate text-muted-foreground">{job.stage_spec_name || '-'}</span>
        <span className="text-right">{job.quantity ?? '-'}</span>
        <span className="text-right text-muted-foreground">
          {job.due_date ? format(new Date(job.due_date), 'MMM d') : '-'}
        </span>
      </div>
    </div>
  );
};
