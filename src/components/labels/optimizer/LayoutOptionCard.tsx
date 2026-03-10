import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Check, Zap, Package, Scissors, AlertTriangle, Info, LayoutGrid, Bug, ChevronDown } from 'lucide-react';
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
  const scorePercent = Math.round(option.overall_score * 100);
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  };

  const getOptionIcon = (id: string) => {
    switch (id) {
      case 'ganged-all': return <Zap className="h-4 w-4" />;
      case 'individual': return <Package className="h-4 w-4" />;
      case 'optimized': return <Scissors className="h-4 w-4" />;
      case 'equal-qty': return <Zap className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  const getOptionTitle = (id: string) => {
    switch (id) {
      case 'ganged-all': return 'Ganged Run';
      case 'individual': return 'Individual Runs';
      case 'optimized': return 'Optimized Split';
      case 'equal-qty': return 'Equal Quantity';
      default: return 'Layout Option';
    }
  };

  const tradeOffs = option.trade_offs;

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
            {getOptionIcon(option.id)}
            <CardTitle className="text-base">{getOptionTitle(option.id)}</CardTitle>
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
        {/* Score */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Efficiency Score</span>
            <span className={cn('font-bold', getScoreColor(scorePercent))}>
              {scorePercent}%
            </span>
          </div>
          <Progress value={scorePercent} className="h-2" />
        </div>

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

        {/* Efficiency Breakdown */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Material Efficiency</span>
            <span>{Math.round(option.material_efficiency_score * 100)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Print Efficiency</span>
            <span>{Math.round(option.print_efficiency_score * 100)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Labor Efficiency</span>
            <span>{Math.round(option.labor_efficiency_score * 100)}%</span>
          </div>
        </div>

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

        {/* Debug / AI Reasoning Section */}
        {(option.debug_info || option.runs.some(r => r.reasoning)) && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full" onClick={(e) => e.stopPropagation()}>
              <Bug className="h-3 w-3" />
              <span>Debug / AI Reasoning</span>
              <ChevronDown className="h-3 w-3 ml-auto" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3 text-xs">
              {/* Input items the AI received */}
              {option.debug_info?.input_items && option.debug_info.input_items.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground">AI Input Items:</p>
                  <div className="bg-muted/50 rounded p-2 space-y-0.5 font-mono text-[11px]">
                    {option.debug_info.input_items.map((item, i) => (
                      <p key={i}>{item.name}: {item.quantity.toLocaleString()} labels</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-run reasoning */}
              {option.runs.some(r => r.reasoning) && (
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground">Per-Run Reasoning:</p>
                  <div className="bg-muted/50 rounded p-2 space-y-1.5">
                    {option.runs.map((run, i) => run.reasoning ? (
                      <p key={i} className="text-[11px]">
                        <span className="font-semibold">Run {run.run_number}:</span> {run.reasoning}
                      </p>
                    ) : null)}
                  </div>
                </div>
              )}

              {/* Validation warnings */}
              {option.debug_info?.validation_warnings && option.debug_info.validation_warnings.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Validation Warnings:</p>
                  <div className="bg-destructive/5 rounded p-2 space-y-0.5">
                    {option.debug_info.validation_warnings.map((w, i) => (
                      <p key={i} className="text-[11px] text-destructive">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Correction notes */}
              {option.debug_info?.correction_notes && option.debug_info.correction_notes.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-amber-600">Auto-Corrections Applied:</p>
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded p-2 space-y-0.5">
                    {option.debug_info.correction_notes.map((n, i) => (
                      <p key={i} className="text-[11px] text-amber-700 dark:text-amber-300">{n}</p>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
