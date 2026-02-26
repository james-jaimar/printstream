
import React, { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, AlertTriangle, Calculator } from "lucide-react";
import { usePartialRework } from "@/hooks/tracker/usePartialRework";

interface PartialReworkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobTableName: string;
  woNo: string;
  originalQty: number;
  onReworkCreated: (stageIds: string[]) => void;
}

interface StageQtyRow {
  stageInstanceId: string;
  stageName: string;
  stageOrder: number;
  productionStageId: string;
  originalQuantity: number;
  reworkQuantity: number;
}

export const PartialReworkDialog: React.FC<PartialReworkDialogProps> = ({
  isOpen,
  onClose,
  jobId,
  jobTableName,
  woNo,
  originalQty,
  onReworkCreated,
}) => {
  const [shortfallQty, setShortfallQty] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [stageQuantities, setStageQuantities] = useState<StageQtyRow[]>([]);
  const [isLoadingStages, setIsLoadingStages] = useState(false);

  const { isProcessing, calculateReworkStages, executePartialRework } = usePartialRework();

  const percentage = originalQty > 0 ? ((shortfallQty / originalQty) * 100) : 0;

  // Load stages when shortfall changes
  useEffect(() => {
    if (!isOpen || shortfallQty <= 0 || originalQty <= 0) {
      setStageQuantities([]);
      return;
    }

    const loadStages = async () => {
      setIsLoadingStages(true);
      const stages = await calculateReworkStages(jobId, jobTableName, originalQty, shortfallQty);
      setStageQuantities(stages);
      setIsLoadingStages(false);
    };

    const timeout = setTimeout(loadStages, 300);
    return () => clearTimeout(timeout);
  }, [isOpen, shortfallQty, originalQty, jobId, jobTableName, calculateReworkStages]);

  const handleStageQtyChange = (index: number, qty: number) => {
    setStageQuantities(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], reworkQuantity: qty };
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (shortfallQty <= 0 || !reason.trim() || stageQuantities.length === 0) return;

    const result = await executePartialRework({
      jobId,
      jobTableName,
      shortfallQty,
      originalQty,
      reason,
      targetStageOrder: stageQuantities[0]?.stageOrder || 1,
      stageQuantities,
    });

    if (result.success) {
      onReworkCreated(result.createdStageIds);
      onClose();
    }
  };

  const handleClose = () => {
    setShortfallQty(0);
    setReason("");
    setStageQuantities([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-700">
            <RotateCcw className="h-5 w-5" />
            Partial Rework — {woNo}
          </DialogTitle>
          <DialogDescription>
            Reprint a portion of the order due to damages or shortfall.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Shortfall Input */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Original Quantity</Label>
              <div className="text-2xl font-bold font-mono mt-1">
                {originalQty.toLocaleString()}
              </div>
            </div>
            <div>
              <Label htmlFor="shortfall">Shortfall Quantity</Label>
              <Input
                id="shortfall"
                type="number"
                min={1}
                max={originalQty}
                value={shortfallQty || ''}
                onChange={e => setShortfallQty(parseInt(e.target.value) || 0)}
                placeholder="e.g. 10"
                className="mt-1"
              />
            </div>
          </div>

          {/* Percentage Display */}
          {shortfallQty > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
              <Calculator className="h-5 w-5 text-orange-600" />
              <div>
                <span className="text-sm text-orange-700">
                  {shortfallQty} / {originalQty} = <strong>{percentage.toFixed(2)}%</strong> extra needed
                </span>
              </div>
              <Badge variant="outline" className="ml-auto text-orange-700 border-orange-300">
                {percentage.toFixed(2)}%
              </Badge>
            </div>
          )}

          {/* Per-Stage Quantities */}
          {stageQuantities.length > 0 && (
            <div>
              <Label className="mb-2 block">Rework Quantity Per Stage</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Auto-calculated from percentage. Adjust individual stages if needed (e.g., extra for printing make-ready).
              </p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Stage</th>
                      <th className="text-right px-3 py-2 font-medium">Original Qty</th>
                      <th className="text-right px-3 py-2 font-medium">Rework Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageQuantities.map((stage, index) => (
                      <tr key={stage.stageInstanceId} className="border-t">
                        <td className="px-3 py-2">
                          <span className="text-muted-foreground mr-2">{stage.stageOrder}.</span>
                          {stage.stageName}
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-muted-foreground">
                          {stage.originalQuantity.toLocaleString()}
                        </td>
                        <td className="text-right px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            value={stage.reworkQuantity}
                            onChange={e => handleStageQtyChange(index, parseInt(e.target.value) || 0)}
                            className="w-24 ml-auto text-right h-8"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {isLoadingStages && shortfallQty > 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              Loading stages...
            </div>
          )}

          {/* Reason */}
          <div>
            <Label htmlFor="reason">Reason for Rework</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. 10 books damaged during binding..."
              rows={2}
              className="mt-1"
            />
          </div>

          {/* Warning */}
          {shortfallQty > originalQty * 0.5 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">
                Rework quantity exceeds 50% of original order. Are you sure?
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isProcessing || shortfallQty <= 0 || !reason.trim() || stageQuantities.length === 0}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {isProcessing ? 'Creating...' : 'Create Rework'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
