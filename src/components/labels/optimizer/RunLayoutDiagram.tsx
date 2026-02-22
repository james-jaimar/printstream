/**
 * Run Layout Diagram
 * Visual representation of how labels are arranged across slots on the press roll
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUp, Layers, Ruler, Clock, AlertTriangle } from 'lucide-react';
import type { LabelItem, LabelDieline, SlotAssignment, LabelRunStatus, RollSplitOption } from '@/types/labels';
import { cn } from '@/lib/utils';
import { getSlotConfig } from '@/utils/labels/layoutOptimizer';
import { RunQuantityAdjuster } from './RunQuantityAdjuster';
import { RollSplitSelector } from './RollSplitSelector';

// Color palette for items - using semantic tokens where possible
const ITEM_COLORS = [
  { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-600', light: 'bg-blue-100' },
  { bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-600', light: 'bg-emerald-100' },
  { bg: 'bg-amber-500', text: 'text-white', border: 'border-amber-600', light: 'bg-amber-100' },
  { bg: 'bg-purple-500', text: 'text-white', border: 'border-purple-600', light: 'bg-purple-100' },
  { bg: 'bg-pink-500', text: 'text-white', border: 'border-pink-600', light: 'bg-pink-100' },
  { bg: 'bg-cyan-500', text: 'text-white', border: 'border-cyan-600', light: 'bg-cyan-100' },
  { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600', light: 'bg-orange-100' },
  { bg: 'bg-teal-500', text: 'text-white', border: 'border-teal-600', light: 'bg-teal-100' },
];

function formatQty(n: number): string {
  if (n >= 1000) {
    return n % 1000 === 0 ? `${n / 1000}k` : `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

interface RunLayoutDiagramProps {
  runNumber: number;
  status?: LabelRunStatus;
  slotAssignments: SlotAssignment[];
  dieline: LabelDieline;
  items: LabelItem[];
  meters?: number | null;
  frames?: number | null;
  estimatedMinutes?: number | null;
  aiScore?: number | null;
  compact?: boolean;
  showStats?: boolean;
  // Roll-awareness
  qtyPerRoll?: number;
  needsRewinding?: boolean;
  labelsPerOutputRoll?: number;
  actualLabelsPerSlot?: number;
  consolidationSuggestion?: string;
  // Interactive controls
  quantityOverride?: number;
  rollSplit?: RollSplitOption;
  onQuantityOverride?: (runNumber: number, newQty: number) => void;
  onRollSplitChange?: (runNumber: number, split: RollSplitOption) => void;
}

export function RunLayoutDiagram({
  runNumber,
  status,
  slotAssignments,
  dieline,
  items,
  meters,
  frames,
  estimatedMinutes,
  aiScore,
  compact = false,
  showStats = true,
  qtyPerRoll,
  needsRewinding,
  labelsPerOutputRoll,
  actualLabelsPerSlot,
  consolidationSuggestion,
  quantityOverride,
  rollSplit,
  onQuantityOverride,
  onRollSplitChange,
}: RunLayoutDiagramProps) {
  // Create item color map
  const itemColorMap = new Map<string, typeof ITEM_COLORS[0]>();
  items.forEach((item, index) => {
    itemColorMap.set(item.id, ITEM_COLORS[index % ITEM_COLORS.length]);
  });

  // Create slot map for quick lookup
  const slotMap = new Map<number, SlotAssignment>();
  slotAssignments.forEach(assignment => {
    slotMap.set(assignment.slot, assignment);
  });

  // Detect single-item runs - these use ALL slots for the same item
  const isSingleItemRun = slotAssignments.length === 1;
  const singleItemAssignment = isSingleItemRun ? slotAssignments[0] : null;
  const singleItem = singleItemAssignment 
    ? items.find(i => i.id === singleItemAssignment.item_id) 
    : null;

  const columnsAcross = dieline.columns_across;
  const rowsAround = dieline.rows_around;

  // Calculate total print qty for this run using proper template stacking
  const slotConfig = getSlotConfig(dieline);
  const labelsPerFrame = slotConfig.labelsPerFrame;
  const totalPrintQty = frames ? frames * labelsPerFrame : null;
  
  // Actual output per slot (frames-based, not requested)
  const effectiveActualPerSlot = actualLabelsPerSlot ?? (frames ? frames * slotConfig.labelsPerSlotPerFrame : null);

  // Calculate how many frames to show (max 3 for preview)
  const framesToShow = compact ? 1 : Math.min(3, Math.max(1, frames || 1));
  
  // Show interactive controls even in compact mode when callbacks are provided
  const showControls = qtyPerRoll && qtyPerRoll > 0;
  const showAdjuster = showControls && needsRewinding && onQuantityOverride && effectiveActualPerSlot;
  const showSplitter = showControls && effectiveActualPerSlot && effectiveActualPerSlot > qtyPerRoll && onRollSplitChange;

  return (
    <Card className={cn("overflow-hidden", compact && "border-0 shadow-none")}>
      {/* Compact mode header */}
      {compact && (
        <div className="px-2 pt-2 pb-1 text-center space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Run {runNumber}
            {totalPrintQty && (
              <> — {totalPrintQty.toLocaleString()} labels</>
            )}
          </span>
          {needsRewinding && (
            <div className="flex items-center justify-center gap-1 text-[10px] text-destructive font-medium">
              <AlertTriangle className="h-3 w-3" />
              Short rolls — rewind
            </div>
          )}
          {effectiveActualPerSlot != null && qtyPerRoll && (
            <div className={cn(
              "text-[10px] font-mono",
              effectiveActualPerSlot >= qtyPerRoll ? "text-green-600" : "text-destructive"
            )}>
              {effectiveActualPerSlot.toLocaleString()}/slot {qtyPerRoll ? `(need ${qtyPerRoll.toLocaleString()})` : ''}
            </div>
          )}
        </div>
      )}
      {!compact && (
        <CardHeader className="py-3 px-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">
                Run {runNumber}
              </CardTitle>
              {status && (
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs",
                    status === 'completed' && "bg-green-100 text-green-700",
                    status === 'printing' && "bg-amber-100 text-amber-700",
                    status === 'approved' && "bg-blue-100 text-blue-700",
                  )}
                >
                  {status}
                </Badge>
              )}
              {aiScore && (
                <Badge variant="outline" className="text-xs">
                  AI: {aiScore}%
                </Badge>
              )}
            </div>
            {showStats && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {totalPrintQty && (
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    {totalPrintQty.toLocaleString()} labels
                  </span>
                )}
                {meters && (
                  <span className="flex items-center gap-1">
                    <Ruler className="h-3 w-3" />
                    {meters.toFixed(1)}m
                  </span>
                )}
                {frames && (
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {frames}
                  </span>
                )}
                {estimatedMinutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    ~{estimatedMinutes}min
                  </span>
                )}
                {effectiveActualPerSlot != null && qtyPerRoll && (
                  <span className={cn(
                    "flex items-center gap-1 font-medium",
                    effectiveActualPerSlot >= qtyPerRoll ? "text-green-600" : "text-destructive"
                  )}>
                    {effectiveActualPerSlot.toLocaleString()}/slot
                  </span>
                )}
              </div>
            )}
          </div>
          {needsRewinding && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-medium">Short rolls — manual rewind required</span>
            </div>
          )}
          {consolidationSuggestion && (
            <p className="text-[11px] text-amber-600 mt-1">{consolidationSuggestion}</p>
          )}
        </CardHeader>
      )}
      
      <CardContent className={cn("p-4", compact && "p-2")}>
        <TooltipProvider>
          <div className="flex items-stretch gap-3">
            {/* Web Direction Indicator - Left */}
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <ArrowUp className="h-4 w-4 mb-1 animate-pulse" />
              <div className="text-[10px]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                WEB
              </div>
            </div>

            {/* Roll Layout Container */}
            <div className="flex-1 border-2 border-dashed border-muted-foreground/30 rounded-lg p-2 bg-muted/20">
              {/* Roll Width Label */}
              <div className="text-center text-[10px] text-muted-foreground mb-2 font-mono">
                {dieline.roll_width_mm}mm roll
              </div>

              {/* Frames */}
              <div className="space-y-2">
                {Array.from({ length: framesToShow }).map((_, frameIndex) => (
                  <div key={frameIndex}>
                    {/* Frame separator */}
                    {frameIndex > 0 && (
                      <div className="border-t border-dashed border-muted-foreground/40 my-2" />
                    )}
                    
                    {/* Label Grid for this frame */}
                    <div 
                      className="grid gap-1"
                      style={{ 
                        gridTemplateColumns: `repeat(${columnsAcross}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${rowsAround}, minmax(${compact ? '24px' : '32px'}, auto))`,
                      }}
                    >
                      {Array.from({ length: columnsAcross * rowsAround }).map((_, cellIndex) => {
                        const slotNumber = cellIndex % columnsAcross;
                        // For single-item runs, ALL slots use the same item
                        const assignment = isSingleItemRun ? singleItemAssignment : slotMap.get(slotNumber);
                        const item = isSingleItemRun ? singleItem : (assignment ? items.find(i => i.id === assignment.item_id) : null);
                        const colors = item ? itemColorMap.get(item.id) : null;
                        const isFirstRow = Math.floor(cellIndex / columnsAcross) === 0;

                        return (
                          <Tooltip key={cellIndex}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "rounded transition-all flex items-center justify-center border",
                                  compact ? "min-h-[24px] text-[9px]" : "min-h-[32px] text-xs",
                                  item && colors
                                    ? cn(colors.bg, colors.text, colors.border)
                                    : "bg-muted border-dashed border-muted-foreground/30"
                                )}
                              >
                                {item ? (
                                  <span className="font-medium truncate px-1">
                                    {isFirstRow ? (
                                      isSingleItemRun 
                                        ? item.name.substring(0, 8) 
                                        : `S${slotNumber + 1} x${formatQty(effectiveActualPerSlot ?? assignment?.quantity_in_slot ?? 0)}`
                                    ) : ''}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">
                                    {isFirstRow ? `${slotNumber + 1}` : ''}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              {item && assignment ? (
                                <div className="text-sm space-y-1">
                                  <p className="font-medium">{item.name}</p>
                                  {isSingleItemRun ? (
                                    <p className="text-muted-foreground">
                                      Full roll • {(effectiveActualPerSlot ?? assignment.quantity_in_slot).toLocaleString()} labels/slot
                                    </p>
                                  ) : (
                                    <>
                                      <p className="text-muted-foreground">
                                        Slot {slotNumber + 1} • Requested: {assignment.quantity_in_slot.toLocaleString()}
                                      </p>
                                      {effectiveActualPerSlot != null && effectiveActualPerSlot !== assignment.quantity_in_slot && (
                                        <p className="text-muted-foreground">
                                          Actual output: {effectiveActualPerSlot.toLocaleString()}
                                          {effectiveActualPerSlot > assignment.quantity_in_slot && (
                                            <span className="text-amber-500">
                                              {' '}(+{(effectiveActualPerSlot - assignment.quantity_in_slot).toLocaleString()} overrun)
                                            </span>
                                          )}
                                        </p>
                                      )}
                                    </>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm">Slot {slotNumber + 1}: Empty</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* More frames indicator */}
                {(frames || 0) > framesToShow && (
                  <div className="text-center text-[10px] text-muted-foreground py-1 border-t border-dashed border-muted-foreground/30">
                    + {(frames || 0) - framesToShow} more frames
                  </div>
                )}
              </div>

              {/* Print Direction */}
              <div className="flex items-center justify-center gap-1 mt-2 text-muted-foreground">
                <ArrowUp className="h-3 w-3" />
                <span className="text-[10px]">Print Direction</span>
              </div>
            </div>

            {/* Web Direction Indicator - Right */}
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <ArrowUp className="h-4 w-4 mb-1 animate-pulse" />
              <div className="text-[10px]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                WEB
              </div>
            </div>
          </div>

          {/* Legend */}
          {!compact && slotAssignments.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Legend:</span>
                {isSingleItemRun && singleItem && singleItemAssignment ? (
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-3 h-3 rounded", itemColorMap.get(singleItem.id)?.bg)} />
                    <span className="text-xs">
                      {singleItem.name} (Full roll • {(effectiveActualPerSlot ?? singleItemAssignment.quantity_in_slot).toLocaleString()} labels/slot)
                    </span>
                  </div>
                ) : (
                  slotAssignments.map((assignment) => {
                    const item = items.find(i => i.id === assignment.item_id);
                    const colors = item ? itemColorMap.get(item.id) : null;
                    if (!item || !colors) return null;
                    
                    return (
                      <div key={assignment.slot} className="flex items-center gap-1.5">
                        <div className={cn("w-3 h-3 rounded", colors.bg)} />
                        <span className="text-xs">
                          S{assignment.slot + 1}: {item.name} (req {assignment.quantity_in_slot.toLocaleString()}
                          {effectiveActualPerSlot != null && effectiveActualPerSlot !== assignment.quantity_in_slot
                            ? ` → actual ${effectiveActualPerSlot.toLocaleString()}`
                            : ''
                          })
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </TooltipProvider>
        
        {/* Interactive Controls */}
        {showAdjuster && (
          <div className="mt-3">
            <RunQuantityAdjuster
              runNumber={runNumber}
              actualPerSlot={effectiveActualPerSlot!}
              qtyPerRoll={qtyPerRoll!}
              quantityOverride={quantityOverride}
              onOverride={onQuantityOverride!}
            />
          </div>
        )}
        
        {showSplitter && (
          <div className="mt-3">
            <RollSplitSelector
              runNumber={runNumber}
              actualPerSlot={effectiveActualPerSlot!}
              qtyPerRoll={qtyPerRoll!}
              currentSplit={rollSplit}
              onSplitChange={onRollSplitChange!}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
