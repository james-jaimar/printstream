/**
 * Roll Split Selector
 * Shows splitting options when actual output per slot > qty_per_roll + tolerance
 */

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Scissors, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RollSplitOption } from '@/types/labels';

const ROLL_TOLERANCE = 50;

interface RollSplitSelectorProps {
  runNumber: number;
  actualPerSlot: number;
  qtyPerRoll: number;
  currentSplit?: RollSplitOption;
  onSplitChange: (runNumber: number, split: RollSplitOption) => void;
}

/**
 * Format roll counts compactly: "8 x 500 + 5" instead of listing all individually
 */
function formatRollLabel(rolls: { roll_number: number; label_count: number }[]): string {
  if (rolls.length <= 4) {
    return rolls.map(r => r.label_count.toLocaleString()).join(' + ');
  }
  
  // Group by count
  const countMap = new Map<number, number>();
  for (const r of rolls) {
    countMap.set(r.label_count, (countMap.get(r.label_count) || 0) + 1);
  }
  
  const parts: string[] = [];
  for (const [count, qty] of countMap) {
    parts.push(qty > 1 ? `${qty} x ${count.toLocaleString()}` : count.toLocaleString());
  }
  return parts.join(' + ');
}

export function RollSplitSelector({
  runNumber,
  actualPerSlot,
  qtyPerRoll,
  currentSplit,
  onSplitChange,
}: RollSplitSelectorProps) {
  const [customValues, setCustomValues] = useState<number[]>([]);

  const splitOptions = useMemo(() => {
    const totalLabels = actualPerSlot;
    if (totalLabels <= qtyPerRoll) return [];

    const options: { strategy: RollSplitOption['strategy']; label: string; rolls: RollSplitOption['rolls'] }[] = [];

    // Fill first: 500 + 508 (merge tiny remainder into previous roll)
    const fillFirstRolls: RollSplitOption['rolls'] = [];
    let remaining = totalLabels;
    let rollNum = 1;
    while (remaining > 0) {
      const count = Math.min(qtyPerRoll, remaining);
      fillFirstRolls.push({ roll_number: rollNum++, label_count: count });
      remaining -= count;
    }
    // Merge tiny last roll (<=ROLL_TOLERANCE) into the previous one
    if (fillFirstRolls.length >= 2) {
      const last = fillFirstRolls[fillFirstRolls.length - 1];
      if (last.label_count <= ROLL_TOLERANCE) {
        fillFirstRolls[fillFirstRolls.length - 2].label_count += last.label_count;
        fillFirstRolls.pop();
      }
    }
    options.push({
      strategy: 'fill_first',
      label: `Fill first: ${formatRollLabel(fillFirstRolls)}`,
      rolls: fillFirstRolls,
    });

    // Even split using corrected roll count
    const effectiveRollCount = fillFirstRolls.length;
    const evenCount = Math.floor(totalLabels / effectiveRollCount);
    const evenRemainder = totalLabels - evenCount * effectiveRollCount;
    const evenRolls: RollSplitOption['rolls'] = [];
    for (let i = 0; i < effectiveRollCount; i++) {
      evenRolls.push({
        roll_number: i + 1,
        label_count: evenCount + (i < evenRemainder ? 1 : 0),
      });
    }
    // Only show even if different from fill_first
    if (evenRolls[0].label_count !== fillFirstRolls[0].label_count) {
      options.push({
        strategy: 'even',
        label: `Even split: ${formatRollLabel(evenRolls)}`,
        rolls: evenRolls,
      });
    }

    return options;
  }, [actualPerSlot, qtyPerRoll]);

  if (splitOptions.length === 0) return null;

  const selectedStrategy = currentSplit?.strategy;
  const MAX_BADGES = 4;

  return (
    <div className="space-y-2 p-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Scissors className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          Roll splitting — {actualPerSlot.toLocaleString()}/slot exceeds {qtyPerRoll.toLocaleString()}/roll
        </span>
      </div>
      
      <div className="space-y-1.5">
        {splitOptions.map((option) => (
            <button
              key={option.strategy}
              onClick={() => onSplitChange(runNumber, { strategy: option.strategy, rolls: option.rolls })}
              className={cn(
                "w-full p-2 rounded text-xs transition-colors text-left space-y-1",
                selectedStrategy === option.strategy
                  ? "bg-primary/10 border border-primary/30 text-foreground"
                  : "bg-background border border-border hover:border-primary/30"
              )}
            >
              <div className="flex items-center gap-2">
                {selectedStrategy === option.strategy && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
                <span className={cn(
                  "font-medium truncate",
                  selectedStrategy !== option.strategy && "ml-5"
                )}>
                  {option.label}
                </span>
              </div>
              <div className="flex gap-1 flex-wrap ml-5">
                {option.rolls.map((roll) => (
                  <Badge
                    key={roll.roll_number}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    R{roll.roll_number}: {roll.label_count.toLocaleString()}
                  </Badge>
                ))}
              </div>
            </button>
          ))}
        
        {/* Custom option */}
        <button
          onClick={() => {
            const fillFirst = splitOptions.find(o => o.strategy === 'fill_first');
            if (fillFirst) {
              setCustomValues(fillFirst.rolls.map(r => r.label_count));
              onSplitChange(runNumber, { strategy: 'custom', rolls: fillFirst.rolls });
            }
          }}
          className={cn(
            "w-full flex items-center gap-2 p-2 rounded text-xs transition-colors text-left",
            selectedStrategy === 'custom'
              ? "bg-primary/10 border border-primary/30 text-foreground"
              : "bg-background border border-border hover:border-primary/30"
          )}
        >
          {selectedStrategy === 'custom' && (
            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
          )}
          <span className={cn(
            "font-medium",
            selectedStrategy !== 'custom' && "ml-5"
          )}>
            Custom split
          </span>
        </button>
        
        {selectedStrategy === 'custom' && customValues.length > 0 && (
          <div className="flex items-center gap-2 pl-5 flex-wrap">
            {customValues.map((val, idx) => (
              <Input
                key={idx}
                type="number"
                value={val}
                onChange={(e) => {
                  const newVals = [...customValues];
                  newVals[idx] = parseInt(e.target.value) || 0;
                  setCustomValues(newVals);
                  onSplitChange(runNumber, {
                    strategy: 'custom',
                    rolls: newVals.map((v, i) => ({ roll_number: i + 1, label_count: v })),
                  });
                }}
                className="h-7 w-20 text-xs text-center"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
