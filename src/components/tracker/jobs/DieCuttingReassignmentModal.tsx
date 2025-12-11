import React, { useState, useMemo } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ArrowRight, Search, Scissors, Loader2, Inbox } from 'lucide-react';
import { DieCuttingMachine, DieCuttingJob, useDieCuttingMachines } from '@/hooks/tracker/useDieCuttingMachines';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface DieCuttingReassignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  machines: DieCuttingMachine[];
  jobs: DieCuttingJob[];
}

export const DieCuttingReassignmentModal: React.FC<DieCuttingReassignmentModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  machines,
  jobs
}) => {
  const { bulkAssignJobs } = useDieCuttingMachines();
  
  const [isLoading, setIsLoading] = useState(false);
  const [sourceMachineId, setSourceMachineId] = useState<string>('');
  const [targetMachineId, setTargetMachineId] = useState<string>('');
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Get jobs for selected source
  const sourceJobs = useMemo(() => {
    if (sourceMachineId === 'unassigned') {
      return jobs.filter(j => j.allocated_machine_id === null);
    }
    if (sourceMachineId) {
      return jobs.filter(j => j.allocated_machine_id === sourceMachineId);
    }
    return [];
  }, [jobs, sourceMachineId]);

  // Filter jobs by search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery) return sourceJobs;
    const query = searchQuery.toLowerCase();
    return sourceJobs.filter(job =>
      job.wo_no.toLowerCase().includes(query) ||
      job.customer?.toLowerCase().includes(query) ||
      job.reference?.toLowerCase().includes(query)
    );
  }, [sourceJobs, searchQuery]);

  // Get available target options (exclude source)
  const availableTargets = useMemo(() => {
    const targets: { id: string; name: string }[] = [];
    
    if (sourceMachineId !== 'unassigned') {
      targets.push({ id: 'unassigned', name: 'Unassigned' });
    }
    
    machines.forEach(machine => {
      if (machine.id !== sourceMachineId) {
        targets.push({ id: machine.id, name: machine.name });
      }
    });
    
    return targets;
  }, [machines, sourceMachineId]);

  // Toggle job selection
  const toggleJobSelection = (stageInstanceId: string) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(stageInstanceId)) {
        next.delete(stageInstanceId);
      } else {
        next.add(stageInstanceId);
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
    if (!targetMachineId || selectedJobIds.size === 0) {
      return;
    }

    setIsLoading(true);
    try {
      const actualTargetId = targetMachineId === 'unassigned' ? null : targetMachineId;
      const success = await bulkAssignJobs(Array.from(selectedJobIds), actualTargetId);
      
      if (success) {
        onComplete();
        handleClose();
      }
    } catch (err) {
      console.error('Error reassigning jobs:', err);
      toast.error('Failed to move jobs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSourceMachineId('');
    setTargetMachineId('');
    setSelectedJobIds(new Set());
    setSearchQuery('');
    onClose();
  };

  const sourceName = sourceMachineId === 'unassigned' 
    ? 'Unassigned' 
    : machines.find(m => m.id === sourceMachineId)?.name || '';
  
  const targetName = targetMachineId === 'unassigned'
    ? 'Unassigned'
    : machines.find(m => m.id === targetMachineId)?.name || '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Move Jobs Between Machines
          </DialogTitle>
          <DialogDescription>
            Select jobs from one machine and move them to another.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-4 py-4">
          {/* Step 1: Source Machine */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Step 1: Select Source</Label>
            <Select value={sourceMachineId} onValueChange={(value) => {
              setSourceMachineId(value);
              setSelectedJobIds(new Set());
              setTargetMachineId('');
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select source machine..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-4 w-4" />
                    Unassigned
                  </div>
                </SelectItem>
                {machines.map(machine => (
                  <SelectItem key={machine.id} value={machine.id}>
                    <div className="flex items-center gap-2">
                      <Scissors className="h-4 w-4" />
                      {machine.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Job Selection */}
          {sourceMachineId && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Step 2: Select Jobs to Move ({sourceJobs.length} available)
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
                {sourceJobs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No jobs found in this location
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No jobs match your search
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

          {/* Step 3: Target Machine */}
          {selectedJobIds.size > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Step 3: Select Target Machine</Label>
              <Select value={targetMachineId} onValueChange={setTargetMachineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target machine..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map(target => (
                    <SelectItem key={target.id} value={target.id}>
                      <div className="flex items-center gap-2">
                        {target.id === 'unassigned' ? (
                          <Inbox className="h-4 w-4" />
                        ) : (
                          <Scissors className="h-4 w-4" />
                        )}
                        {target.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Preview */}
          {sourceMachineId && targetMachineId && selectedJobIds.size > 0 && (
            <div className="p-3 bg-muted/50 rounded-md space-y-1">
              <p className="text-sm font-medium">Summary</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{sourceName}</span>
                <ArrowRight className="h-4 w-4" />
                <span className="font-medium">{targetName}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Moving {selectedJobIds.size} job(s)
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
              !sourceMachineId ||
              !targetMachineId ||
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
                Move {selectedJobIds.size} Job(s) to {targetName || 'Target'}
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
  job: DieCuttingJob;
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
      <div className="flex-1 min-w-0 grid grid-cols-4 gap-2 text-sm">
        <span className="font-mono font-medium truncate">{job.wo_no}</span>
        <span className="truncate text-muted-foreground">{job.customer || '-'}</span>
        <span className="text-right">{job.qty?.toLocaleString() ?? '-'}</span>
        <span className="text-right text-muted-foreground">
          {job.due_date ? format(new Date(job.due_date), 'MMM d') : '-'}
        </span>
      </div>
    </div>
  );
};
