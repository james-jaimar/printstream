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
import { AISuggestionCard } from './AISuggestionCard';
import type { LabelItem, LabelDieline, OptimizationWeights, LayoutOption } from '@/types/labels';
import { DEFAULT_OPTIMIZATION_WEIGHTS } from '@/types/labels';

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
  const [rushJob, setRushJob] = useState(false);
  const [preferGanging, setPreferGanging] = useState(true);
  const [localWeights, setLocalWeights] = useState<OptimizationWeights>(DEFAULT_OPTIMIZATION_WEIGHTS);

  const {
    options,
    selectedOption,
    aiSuggestion,
    isGenerating,
    isLoadingAI,
    canGenerate,
    generateOptions,
    fetchAISuggestion,
    selectOption
  } = useLayoutOptimizer({ orderId, items, dieline });

  const handleGenerate = () => {
    generateOptions(items, dieline!, localWeights);
  };

  const handleFetchAI = () => {
    fetchAISuggestion(items, dieline!, { rush_job: rushJob, prefer_ganging: preferGanging });
  };

  const handleSelectOption = (option: LayoutOption) => {
    selectOption(option);
    onLayoutSelected(option);
  };

  const updateWeight = (key: keyof OptimizationWeights, value: number) => {
    // Normalize weights to sum to 1
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

  const recommendedOptionId = aiSuggestion?.recommendation === 'ganged' 
    ? 'ganged-all' 
    : aiSuggestion?.recommendation === 'individual'
    ? 'individual'
    : 'optimized';

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
            <div className="flex items-center gap-2">
              <Switch 
                id="rush-job"
                checked={rushJob}
                onCheckedChange={setRushJob}
              />
              <Label htmlFor="rush-job">Rush Job</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch 
                id="prefer-ganging"
                checked={preferGanging}
                onCheckedChange={setPreferGanging}
              />
              <Label htmlFor="prefer-ganging">Prefer Ganging</Label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced
            </Button>
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

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Generate Options
            </Button>
            <Button 
              variant="outline"
              onClick={handleFetchAI}
              disabled={!canGenerate || isLoadingAI}
            >
              {isLoadingAI ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Get AI Suggestion
            </Button>
          </div>

          {!canGenerate && (
            <p className="text-sm text-muted-foreground">
              Add items and select a dieline to generate layout options.
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Suggestion */}
      {aiSuggestion && (
        <AISuggestionCard suggestion={aiSuggestion} />
      )}

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
                isRecommended={option.id === recommendedOptionId}
                onSelect={handleSelectOption}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
