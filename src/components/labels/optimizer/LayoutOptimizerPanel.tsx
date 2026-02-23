import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles, Settings, Play } from 'lucide-react';
import { useLayoutOptimizer } from '@/hooks/labels/useLayoutOptimizer';
import { LayoutOptionCard } from './LayoutOptionCard';
import type { LabelItem, LabelDieline, OptimizationWeights, LayoutOption } from '@/types/labels';
import { DEFAULT_OPTIMIZATION_WEIGHTS } from '@/types/labels';
import { DEFAULT_MAX_OVERRUN } from '@/utils/labels/layoutOptimizer';

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localWeights, setLocalWeights] = useState<OptimizationWeights>(DEFAULT_OPTIMIZATION_WEIGHTS);
  const [localMaxOverrun, setLocalMaxOverrun] = useState(DEFAULT_MAX_OVERRUN);

  const {
    options,
    selectedOption,
    isGenerating,
    isLoadingAI,
    canGenerate,
    generateOptions,
    selectOption
  } = useLayoutOptimizer({ orderId, items, dieline });

  const handleGenerate = () => {
    generateOptions(items, dieline!, localWeights);
  };

  const handleSelectOption = (option: LayoutOption) => {
    selectOption(option);
    onLayoutSelected(option);
  };

  const updateWeight = (key: keyof OptimizationWeights, value: number) => {
    const remaining = 1 - value;
    const otherKeys = Object.keys(localWeights).filter(k => k !== key) as (keyof OptimizationWeights)[];
    const currentOtherSum = otherKeys.reduce((sum, k) => sum + localWeights[k], 0);
    
    if (currentOtherSum > 0) {
      const newWeights = { ...localWeights, [key]: value };
      for (const k of otherKeys) {
        newWeights[k] = (localWeights[k] / currentOtherSum) * remaining;
      }
      setLocalWeights(newWeights);
    } else {
      const equalShare = remaining / otherKeys.length;
      const newWeights = { ...localWeights, [key]: value };
      for (const k of otherKeys) {
        newWeights[k] = equalShare;
      }
      setLocalWeights(newWeights);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
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
          {/* Quick Settings */}
          <div className="flex flex-wrap items-center gap-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced
            </Button>
          </div>

          {/* Max Overrun Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Max Overrun per Slot</Label>
              <span className="text-sm font-mono text-muted-foreground">{localMaxOverrun} labels</span>
            </div>
            <Slider
              value={[localMaxOverrun]}
              onValueChange={([v]) => setLocalMaxOverrun(v)}
              min={50}
              max={1000}
              step={50}
            />
            <p className="text-xs text-muted-foreground">
              Controls how many extra labels the optimizer may produce per slot beyond what's ordered
            </p>
          </div>

          {/* Advanced Weights */}
          {showAdvanced && (
            <>
              <Separator />
              <div className="space-y-4">
                <p className="text-sm font-medium">Optimization Weights</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <Label>Material Efficiency</Label>
                      <span>{Math.round(localWeights.material_efficiency * 100)}%</span>
                    </div>
                    <Slider
                      value={[localWeights.material_efficiency * 100]}
                      onValueChange={([v]) => updateWeight('material_efficiency', v / 100)}
                      max={100}
                      step={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <Label>Print Efficiency</Label>
                      <span>{Math.round(localWeights.print_efficiency * 100)}%</span>
                    </div>
                    <Slider
                      value={[localWeights.print_efficiency * 100]}
                      onValueChange={([v]) => updateWeight('print_efficiency', v / 100)}
                      max={100}
                      step={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <Label>Labor Efficiency</Label>
                      <span>{Math.round(localWeights.labor_efficiency * 100)}%</span>
                    </div>
                    <Slider
                      value={[localWeights.labor_efficiency * 100]}
                      onValueChange={([v]) => updateWeight('labor_efficiency', v / 100)}
                      max={100}
                      step={5}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Single Generate Button — fires algorithm + AI in parallel */}
          <Button 
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="w-full"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : isLoadingAI ? (
              <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isGenerating ? 'Generating...' : isLoadingAI ? 'AI Computing Layout...' : 'Generate Layout Options'}
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
                isRecommended={option.id === 'ai-computed'}
                onSelect={handleSelectOption}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
