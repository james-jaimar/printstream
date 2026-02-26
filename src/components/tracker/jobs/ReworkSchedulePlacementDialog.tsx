
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Zap, 
  Sunrise, 
  CalendarClock, 
  Clock,
  CheckCircle
} from "lucide-react";
import { usePartialRework } from "@/hooks/tracker/usePartialRework";
import { cn } from "@/lib/utils";

interface ReworkSchedulePlacementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  stageIds: string[];
  jobId: string;
  woNo: string;
  reworkQty: number;
  onScheduled: () => void;
}

type ScheduleOption = 'expedite' | 'tomorrow' | 'custom' | 'unscheduled';

export const ReworkSchedulePlacementDialog: React.FC<ReworkSchedulePlacementDialogProps> = ({
  isOpen,
  onClose,
  stageIds,
  jobId,
  woNo,
  reworkQty,
  onScheduled,
}) => {
  const [selectedOption, setSelectedOption] = useState<ScheduleOption | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('07:00');

  const { isProcessing, scheduleReworkStages } = usePartialRework();

  const options: Array<{
    id: ScheduleOption;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    {
      id: 'expedite',
      label: 'Expedite',
      description: 'Push to front of queue in all stages — factory-wide priority',
      icon: <Zap className="h-5 w-5" />,
      color: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
    },
    {
      id: 'tomorrow',
      label: 'First thing tomorrow',
      description: 'Schedule for 07:00 tomorrow morning',
      icon: <Sunrise className="h-5 w-5" />,
      color: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
    },
    {
      id: 'custom',
      label: 'Choose date & time',
      description: 'Pick a specific date and time to slot the rework in',
      icon: <CalendarClock className="h-5 w-5" />,
      color: 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100',
    },
    {
      id: 'unscheduled',
      label: 'Leave unscheduled',
      description: 'Add to queue without specific scheduling',
      icon: <Clock className="h-5 w-5" />,
      color: 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100',
    },
  ];

  const handleConfirm = async () => {
    if (!selectedOption) return;

    let customDateTime: Date | undefined;
    if (selectedOption === 'custom' && customDate) {
      customDateTime = new Date(`${customDate}T${customTime}`);
    }

    const success = await scheduleReworkStages(
      stageIds,
      selectedOption,
      customDateTime,
      jobId,
      `Partial rework for ${woNo} (${reworkQty} units)`
    );

    if (success) {
      onScheduled();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-orange-600" />
            Schedule Rework — {woNo}
          </DialogTitle>
          <DialogDescription>
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              {reworkQty} units × {stageIds.length} stages
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {options.map(option => (
            <button
              key={option.id}
              onClick={() => setSelectedOption(option.id)}
              className={cn(
                'w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all',
                option.color,
                selectedOption === option.id
                  ? 'ring-2 ring-primary ring-offset-2'
                  : 'opacity-80'
              )}
            >
              <div className="mt-0.5">{option.icon}</div>
              <div>
                <div className="font-semibold">{option.label}</div>
                <div className="text-xs mt-0.5 opacity-80">{option.description}</div>
              </div>
              {selectedOption === option.id && (
                <CheckCircle className="h-5 w-5 ml-auto mt-0.5 text-primary" />
              )}
            </button>
          ))}

          {/* Custom date/time picker */}
          {selectedOption === 'custom' && (
            <div className="grid grid-cols-2 gap-3 p-4 bg-muted rounded-lg">
              <div>
                <Label htmlFor="rework-date">Date</Label>
                <Input
                  id="rework-date"
                  type="date"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="rework-time">Time</Label>
                <Input
                  id="rework-time"
                  type="time"
                  value={customTime}
                  onChange={e => setCustomTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isProcessing ||
              !selectedOption ||
              (selectedOption === 'custom' && !customDate)
            }
          >
            {isProcessing ? 'Scheduling...' : 'Confirm Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
