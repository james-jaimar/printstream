/**
 * Run Quantity Adjuster
 * Allows bumping short runs up to the qty_per_roll target
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, Lock, Unlock, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RunQuantityAdjusterProps {
  runNumber: number;
  actualPerSlot: number;
  qtyPerRoll: number;
  quantityOverride?: number;
  onOverride: (runNumber: number, newQtyPerSlot: number) => void;
}

export function RunQuantityAdjuster({
  runNumber,
  actualPerSlot,
  qtyPerRoll,
  quantityOverride,
  onOverride,
}: RunQuantityAdjusterProps) {
  const [isLocked, setIsLocked] = useState(!!quantityOverride);
  const currentQty = quantityOverride ?? actualPerSlot;
  const deficit = qtyPerRoll - currentQty;

  const handleBumpToTarget = () => {
    onOverride(runNumber, qtyPerRoll);
    setIsLocked(true);
  };

  const handleStep = (delta: number) => {
    const newQty = Math.max(1, currentQty + delta);
    onOverride(runNumber, newQty);
  };

  const handleUnlock = () => {
    setIsLocked(false);
    // Reset to original
    onOverride(runNumber, 0); // 0 means clear override
  };

  if (isLocked && quantityOverride) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
        <Lock className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">
          Locked at {quantityOverride.toLocaleString()}/slot
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 ml-auto"
          onClick={handleUnlock}
        >
          <Unlock className="h-3 w-3 mr-1" />
          <span className="text-[10px]">Unlock</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2 rounded-md bg-destructive/5 border border-destructive/20">
      <div className="flex items-center justify-between">
        <div className="text-xs">
          <span className="text-destructive font-medium">
            {currentQty.toLocaleString()}/slot
          </span>
          <span className="text-muted-foreground">
            {' '}— need {qtyPerRoll.toLocaleString()} ({deficit > 0 ? `+${deficit.toLocaleString()} short` : 'met'})
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => handleStep(-50)}
        >
          <Minus className="h-3 w-3" />
        </Button>
        
        <Input
          type="number"
          value={currentQty}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val) && val > 0) onOverride(runNumber, val);
          }}
          className="h-7 w-20 text-xs text-center"
        />
        
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => handleStep(50)}
        >
          <Plus className="h-3 w-3" />
        </Button>

        {deficit > 0 && (
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={handleBumpToTarget}
          >
            <ArrowUp className="h-3 w-3 mr-1" />
            Bump to {qtyPerRoll.toLocaleString()}
          </Button>
        )}

        {deficit <= 0 && (
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={() => { setIsLocked(true); }}
          >
            <Lock className="h-3 w-3 mr-1" />
            Lock
          </Button>
        )}
      </div>
    </div>
  );
}
