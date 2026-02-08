/**
 * Visual Slot Layout Preview
 * 
 * Shows a visual representation of how labels are arranged across slots
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type ProposedRun, type LabelItem, type LabelDieline } from '@/types/labels';
import { cn } from '@/lib/utils';

interface SlotLayoutPreviewProps {
  runs: ProposedRun[];
  items: LabelItem[];
  dieline: LabelDieline;
}

export function SlotLayoutPreview({ runs, items, dieline }: SlotLayoutPreviewProps) {
  const itemMap = new Map(items.map(item => [item.id, item]));
  
  // Generate colors for each item
  const itemColors = new Map<string, string>();
  const colorPalette = [
    'bg-blue-500',
    'bg-green-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-orange-500',
    'bg-teal-500',
  ];
  items.forEach((item, index) => {
    itemColors.set(item.id, colorPalette[index % colorPalette.length]);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm text-muted-foreground">Legend:</span>
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-1.5">
            <div className={cn('w-3 h-3 rounded', itemColors.get(item.id))} />
            <span className="text-xs">{item.name}</span>
          </div>
        ))}
      </div>

      <TooltipProvider>
        <div className="space-y-3">
          {runs.map((run) => (
            <RunPreview
              key={run.run_number}
              run={run}
              slotsPerFrame={dieline.columns_across}
              itemMap={itemMap}
              itemColors={itemColors}
            />
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

interface RunPreviewProps {
  run: ProposedRun;
  slotsPerFrame: number;
  itemMap: Map<string, LabelItem>;
  itemColors: Map<string, string>;
}

function RunPreview({ run, slotsPerFrame, itemMap, itemColors }: RunPreviewProps) {
  // Create slot array with assigned items
  const slots: Array<{ item: LabelItem | undefined; quantity: number } | null> = [];
  
  for (let i = 0; i < slotsPerFrame; i++) {
    const assignment = run.slot_assignments.find(a => a.slot === i);
    if (assignment) {
      slots.push({
        item: itemMap.get(assignment.item_id),
        quantity: assignment.quantity_in_slot
      });
    } else {
      slots.push(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2 px-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Run {run.run_number}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{run.meters.toFixed(2)}m</span>
            <span>·</span>
            <span>{run.frames} frames</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {/* Visual slot representation */}
        <div className="flex gap-1 h-16">
          {slots.map((slot, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex-1 rounded transition-colors flex items-center justify-center',
                    slot?.item
                      ? cn(itemColors.get(slot.item.id), 'text-white')
                      : 'bg-muted border-2 border-dashed border-muted-foreground/30'
                  )}
                >
                  {slot?.item ? (
                    <span className="text-xs font-medium text-center px-1 truncate">
                      {slot.quantity.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Empty</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {slot?.item ? (
                  <div className="text-sm">
                    <p className="font-medium">{slot.item.name}</p>
                    <p className="text-muted-foreground">
                      Slot {index + 1}: {slot.quantity.toLocaleString()} labels
                    </p>
                  </div>
                ) : (
                  <p className="text-sm">Slot {index + 1}: Unused</p>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Slot assignments list */}
        <div className="mt-3 flex flex-wrap gap-1">
          {run.slot_assignments.map((assignment) => {
            const item = itemMap.get(assignment.item_id);
            return (
              <Badge 
                key={`${assignment.slot}-${assignment.item_id}`}
                variant="secondary"
                className="text-xs"
              >
                S{assignment.slot + 1}: {item?.name || 'Unknown'} × {assignment.quantity_in_slot.toLocaleString()}
              </Badge>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
