import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, AlertTriangle, Info, LayoutGrid, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { LayoutOption } from '@/types/labels';

interface LayoutOptionCardProps {
  option: LayoutOption;
  isSelected: boolean;
  isRecommended?: boolean;
  onSelect: (option: LayoutOption) => void;
}

export function LayoutOptionCard({ 
  option, 
  isSelected, 
  isRecommended,
  onSelect 
}: LayoutOptionCardProps) {
  const tradeOffs = option.trade_offs;
  const hasWarnings = option.warnings && option.warnings.length > 0;

  return (
    <Card 
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        isSelected && 'ring-2 ring-primary',
        isRecommended && !isSelected && 'border-green-500/50'
      )}
      onClick={() => onSelect(option)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <CardTitle className="text-base">AI Layout</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isRecommended && (
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                AI Recommended
              </Badge>
            )}
            {isSelected && (
              <Badge className="bg-primary">
                <Check className="h-3 w-3 mr-1" />
                Selected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-muted-foreground text-xs">Runs</p>
            <p className="font-semibold">{option.runs.length}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-muted-foreground text-xs">Meters</p>
            <p className="font-semibold">{option.total_meters.toFixed(1)}m</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-muted-foreground text-xs">Waste</p>
            <p className="font-semibold">{option.total_waste_meters.toFixed(1)}m</p>
          </div>
        </div>

        {/* Warnings */}
        {hasWarnings && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 space-y-1">
            <p className="text-xs font-medium text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {option.warnings!.length} warning{option.warnings!.length > 1 ? 's' : ''}
            </p>
            {option.warnings!.map((w, i) => (
              <p key={i} className="text-[11px] text-destructive/80">{w}</p>
            ))}
          </div>
        )}

        {/* Trade-off Badges */}
        {tradeOffs && (
          <TooltipProvider>
            <div className="flex flex-wrap gap-1.5">
              {tradeOffs.blank_slots_available > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                      <LayoutGrid className="h-3 w-3 mr-1" />
                      {tradeOffs.blank_slots_available} blank slot{tradeOffs.blank_slots_available > 1 ? 's' : ''}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">
                      {tradeOffs.blank_slot_note || 'Blank slots can be used for internal labels or another job'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
              {tradeOffs.overrun_warnings && tradeOffs.overrun_warnings.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {tradeOffs.overrun_warnings.length} overrun warning{tradeOffs.overrun_warnings.length > 1 ? 's' : ''}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-w-xs text-xs space-y-1">
                      {tradeOffs.overrun_warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              {tradeOffs.roll_size_note && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                      <Info className="h-3 w-3 mr-1" />
                      Roll size tip
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">{tradeOffs.roll_size_note}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        )}

        {/* Reasoning */}
        <p className="text-xs text-muted-foreground italic">
          {option.reasoning}
        </p>

        {/* Per-Run Reasoning */}
        {option.runs.some(r => r.reasoning) && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full" onClick={(e) => e.stopPropagation()}>
              <Sparkles className="h-3 w-3" />
              <span>AI Run Details</span>
              <ChevronDown className="h-3 w-3 ml-auto" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1">
              <div className="bg-muted/50 rounded p-2 space-y-1.5">
                {option.runs.map((run, i) => run.reasoning ? (
                  <p key={i} className="text-[11px]">
                    <span className="font-semibold">Run {run.run_number}:</span> {run.reasoning}
                  </p>
                ) : null)}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
