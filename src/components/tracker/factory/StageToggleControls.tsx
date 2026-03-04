import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Settings, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StageItem {
  id: string;
  title: string;
  backgroundColor?: string;
}

interface StageToggleControlsProps {
  stages: StageItem[];
  hiddenStageIds: string[];
  stageOrder: string[];
  onToggleStage: (stageId: string) => void;
  onMoveStage: (stageId: string, direction: 'left' | 'right') => void;
}

export const StageToggleControls: React.FC<StageToggleControlsProps> = ({
  stages,
  hiddenStageIds,
  stageOrder,
  onToggleStage,
  onMoveStage,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const enabledCount = stages.filter(s => !hiddenStageIds.includes(s.id)).length;

  // Order stages by stageOrder for the settings panel
  const orderedStages = [...stages].sort((a, b) => {
    const ai = stageOrder.indexOf(a.id);
    const bi = stageOrder.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="relative">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Queues</span>
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {enabledCount}/{stages.length}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="absolute top-full right-0 z-50 mt-2">
          <Card className="w-72 shadow-lg border">
            <CardContent className="p-4">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Show / Reorder Queues</h4>
                {orderedStages.map((stage, idx) => {
                  const isVisible = !hiddenStageIds.includes(stage.id);
                  const visibleOrderedStages = orderedStages.filter(s => !hiddenStageIds.includes(s.id));
                  const visibleIdx = visibleOrderedStages.findIndex(s => s.id === stage.id);

                  return (
                    <div key={stage.id} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.backgroundColor || '#6b7280', opacity: isVisible ? 1 : 0.3 }}
                      />
                      <Label
                        htmlFor={`stage-${stage.id}`}
                        className="text-sm font-normal cursor-pointer flex-1 truncate"
                        style={{ opacity: isVisible ? 1 : 0.5 }}
                      >
                        {stage.title}
                      </Label>
                      {isVisible && (
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={visibleIdx <= 0}
                            onClick={() => onMoveStage(stage.id, 'left')}
                          >
                            <ArrowLeft className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={visibleIdx >= visibleOrderedStages.length - 1}
                            onClick={() => onMoveStage(stage.id, 'right')}
                          >
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <Switch
                        id={`stage-${stage.id}`}
                        checked={isVisible}
                        onCheckedChange={() => onToggleStage(stage.id)}
                      />
                    </div>
                  );
                })}
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  Turn off queues you're not working on. Use arrows to reorder.
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
