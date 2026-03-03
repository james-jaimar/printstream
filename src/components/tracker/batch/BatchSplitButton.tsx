import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Split, Package } from "lucide-react";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs/types";
import { BatchSplitDetector } from "./BatchSplitDetector";
import { BatchSplitDialog } from "./BatchSplitDialog";

interface BatchSplitButtonProps {
  job: AccessibleJob;
  onSplitComplete?: () => void;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
  compact?: boolean;
  className?: string;
}

/**
 * Button component that detects if a job can be split and shows the split dialog
 * Only appears for batch master jobs at split-eligible stages (packaging/finishing)
 */
export const BatchSplitButton: React.FC<BatchSplitButtonProps> = ({
  job,
  onSplitComplete,
  size = "sm",
  variant = "default",
  compact = false,
  className = ""
}) => {
  const [showSplitDialog, setShowSplitDialog] = useState(false);

  const handleSplitComplete = () => {
    setShowSplitDialog(false);
    onSplitComplete?.();
  };

  // Short-circuit: skip rendering BatchSplitDetector entirely for non-batch jobs
  const isBatchJob = job.is_batch_master || job.wo_no?.startsWith('BATCH-') || false;
  
  if (!isBatchJob) {
    return null;
  }

  return (
    <>
      <BatchSplitDetector job={job}>
        {({ isReadyForSplit, splitReadiness }) => {
          if (!isReadyForSplit) {
            return null;
          }

          const buttonClass = compact ? "h-7 text-xs" : size === "lg" ? "h-12 text-lg" : "h-8 text-sm";

          return (
            <Button
              size={size}
              variant={variant}
              onClick={() => setShowSplitDialog(true)}
              className={`flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white ${buttonClass} ${className}`}
              title={`Split batch back to individual jobs (${splitReadiness.currentStage || 'ready'})`}
            >
              <Split className={compact ? "h-3 w-3" : "h-4 w-4"} />
              {compact ? "Split" : "Split Batch"}
            </Button>
          );
        }}
      </BatchSplitDetector>

      <BatchSplitDialog
        isOpen={showSplitDialog}
        onClose={() => setShowSplitDialog(false)}
        batchJob={job}
        onSplitComplete={handleSplitComplete}
      />
    </>
  );
};