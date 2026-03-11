import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, Settings, Play } from 'lucide-react';
import { useLayoutOptimizer } from '@/hooks/labels/useLayoutOptimizer';
import { LayoutOptionCard } from './LayoutOptionCard';
import type { LabelItem, LabelDieline, LayoutOption } from '@/types/labels';

interface LayoutOptimizerPanelProps {
  orderId: string;
  items: LabelItem[];
  dieline: LabelDieline | null;
  onLayoutSelected: (option: LayoutOption) => void;
}

export function LayoutOptimizerPanel({ 
  orderId,
  items, 
  dieline, 
  onLayoutSelected 
}: LayoutOptimizerPanelProps) {
  const {
    options,
    selectedOption,
    isGenerating,
    canGenerate,
    generateOptions,
    selectOption,
    maxOverrun,
    setMaxOverrun
  } = useLayoutOptimizer({ orderId, items, dieline });

  const handleSelectOption = (option: LayoutOption) => {
    selectOption(option);
    onLayoutSelected(option);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Layout Optimizer
          </CardTitle>
          <CardDescription>
            Generate optimal production layouts for {items.length} item(s)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Max Overrun Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Max Overrun per Slot</Label>
              <span className="text-sm font-mono text-muted-foreground">{maxOverrun} labels</span>
            </div>
            <Slider
              value={[maxOverrun]}
              onValueChange={([v]) => setMaxOverrun(v)}
              min={50}
              max={1000}
              step={50}
            />
            <p className="text-xs text-muted-foreground">
              Controls how many extra labels the optimizer may produce per slot beyond what's ordered
            </p>
          </div>

          {/* Generate Button */}
          <Button 
            onClick={() => generateOptions()}
            disabled={!canGenerate || isGenerating}
            className="w-full"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {isGenerating ? 'AI Computing Layout...' : 'Generate Layout'}
          </Button>

          {!canGenerate && (
            <p className="text-sm text-muted-foreground">
              Add items and select a dieline to generate layout options.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Layout Options */}
      {options.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Layout Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {options.map((option) => (
              <LayoutOptionCard
                key={option.id}
                option={option}
                isSelected={selectedOption?.id === option.id}
                isRecommended={option.id === 'ai-layout'}
                onSelect={handleSelectOption}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
