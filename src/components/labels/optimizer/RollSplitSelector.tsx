/**
 * Roll Split Selector
 * Shows splitting options when actual output per slot > qty_per_roll
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Scissors, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RollSplitOption } from '@/types/labels';

interface RollSplitSelectorProps {
  runNumber: number;
  actualPerSlot: number;
  qtyPerRoll: number;
  currentSplit?: RollSplitOption;
  onSplitChange: (runNumber: number, split: RollSplitOption) => void;
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

    const rollCount = Math.ceil(totalLabels / qtyPerRoll);
    const options: { strategy: RollSplitOption['strategy']; label: string; rolls: RollSplitOption['rolls'] }[] = [];

    // Fill first: 500 + 360
    const fillFirstRolls: RollSplitOption['rolls'] = [];
    let remaining = totalLabels;
    let rollNum = 1;
    while (remaining > 0) {
      const count = Math.min(qtyPerRoll, remaining);
      fillFirstRolls.push({ roll_number: rollNum++, label_count: count });
      remaining -= count;
    }
    options.push({
      strategy: 'fill_first',
      label: `Fill first: ${fillFirstRolls.map(r => r.label_count.toLocaleString()).join(' + ')}`,
      rolls: fillFirstRolls,
    });

    // Even split: 430 + 430
    const evenCount = Math.floor(totalLabels / rollCount);
    const remainder = totalLabels - evenCount * rollCount;
    const evenRolls: RollSplitOption['rolls'] = [];
    for (let i = 0; i < rollCount; i++) {
      evenRolls.push({
        roll_number: i + 1,
        label_count: evenCount + (i < remainder ? 1 : 0),
      });
    }
    // Only show even if different from fill_first
    const evenLabel = `Even split: ${evenRolls.map(r => r.label_count.toLocaleString()).join(' + ')}`;
    if (evenRolls[0].label_count !== fillFirstRolls[0].label_count) {
      options.push({
        strategy: 'even',
        label: evenLabel,
        rolls: evenRolls,
      });
    }

    return options;
  }, [actualPerSlot, qtyPerRoll]);

  if (splitOptions.length === 0) return null;

  const selectedStrategy = currentSplit?.strategy;

  return (
    <div className="space-y-2 p-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Scissors className="h-3.5 w-3.5" />
        Roll splitting — {actualPerSlot.toLocaleString()} labels/slot exceeds {qtyPerRoll.toLocaleString()}/roll
      </div>
      
      <div className="space-y-1.5">
        {splitOptions.map((option) => (
          <button
            key={option.strategy}
            onClick={() => onSplitChange(runNumber, { strategy: option.strategy, rolls: option.rolls })}
            className={cn(
              "w-full flex items-center gap-2 p-2 rounded text-xs transition-colors text-left",
              selectedStrategy === option.strategy
                ? "bg-primary/10 border border-primary/30 text-foreground"
                : "bg-background border border-border hover:border-primary/30"
            )}
          >
            {selectedStrategy === option.strategy && (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            )}
            <span className={cn(
              "font-medium",
              selectedStrategy !== option.strategy && "ml-5"
            )}>
              {option.label}
            </span>
            <div className="ml-auto flex gap-1">
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
            // Initialize custom with fill_first values
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
          <div className="flex items-center gap-2 pl-5">
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
