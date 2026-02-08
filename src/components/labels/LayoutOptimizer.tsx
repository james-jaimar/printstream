/**
 * AI Layout Optimizer Component
 * 
 * Visual interface for generating and selecting optimal label layouts
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sparkles, 
  Play, 
  CheckCircle2, 
  Clock, 
  Ruler, 
  Layers,
  Settings2,
  ChevronDown,
  ChevronUp,
  Zap,
  LayoutGrid
} from 'lucide-react';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { useLayoutOptimizer } from '@/hooks/labels/useLayoutOptimizer';
import { RunLayoutDiagram } from './optimizer/RunLayoutDiagram';
import { type LabelItem, type LabelDieline, type LayoutOption } from '@/types/labels';
import { cn } from '@/lib/utils';

interface LayoutOptimizerProps {
  orderId: string;
  items: LabelItem[];
  dieline: LabelDieline | null;
  onLayoutApplied?: () => void;
}

export function LayoutOptimizer({ 
  orderId, 
  items, 
  dieline,
  onLayoutApplied 
}: LayoutOptimizerProps) {
  const [showWeights, setShowWeights] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const {
    options,
    selectedOption,
    isGenerating,
    isApplying,
    weights,
    summary,
    canGenerate,
    generateOptions,
    selectOption,
    applyLayout,
    updateWeights,
    getProductionTime
  } = useLayoutOptimizer({ orderId, items, dieline });

  const handleApply = async () => {
    const success = await applyLayout();
    if (success && onLayoutApplied) {
      onLayoutApplied();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>AI Layout Optimizer</CardTitle>
          </div>
          <Badge variant="secondary" className="font-mono">
            {items.length} items · {dieline?.columns_across || 0} slots
          </Badge>
        </div>
        <CardDescription>
          Automatically arrange labels across slots to minimize waste and optimize production
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Weight Controls */}
        <Collapsible open={showWeights} onOpenChange={setShowWeights}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Optimization Weights
              </span>
              {showWeights ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <WeightSlider
              label="Material Efficiency"
              value={weights.material_efficiency}
              onChange={(v) => updateWeights({ ...weights, material_efficiency: v })}
              description="Minimize substrate waste"
            />
            <WeightSlider
              label="Print Efficiency"
              value={weights.print_efficiency}
              onChange={(v) => updateWeights({ ...weights, print_efficiency: v })}
              description="Minimize number of runs"
            />
            <WeightSlider
              label="Labor Efficiency"
              value={weights.labor_efficiency}
              onChange={(v) => updateWeights({ ...weights, labor_efficiency: v })}
              description="Minimize handling/changeovers"
            />
          </CollapsibleContent>
        </Collapsible>

        {/* Generate Button */}
        <Button 
          onClick={() => generateOptions()} 
          disabled={!canGenerate || isGenerating}
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Zap className="h-4 w-4 mr-2 animate-pulse" />
              Generating Options...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Layout Options
            </>
          )}
        </Button>

        {/* Layout Options */}
        {options.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Select a Layout Option
            </h4>
            {options.map((option) => (
              <LayoutOptionCard
                key={option.id}
                option={option}
                isSelected={selectedOption?.id === option.id}
                productionTime={getProductionTime(option)}
                onSelect={() => selectOption(option)}
              />
            ))}
          </div>
        )}

        {/* Selected Layout Preview */}
        {selectedOption && dieline && (
          <Collapsible open={showPreview} onOpenChange={setShowPreview}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  Preview Layout Diagram
                </span>
                {showPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <ScrollArea className="h-[50vh]">
                <div className="space-y-6 pr-4">
                  {selectedOption.runs.map((run, idx) => (
                    <RunLayoutDiagram
                      key={idx}
                      runNumber={run.run_number}
                      slotAssignments={run.slot_assignments}
                      dieline={dieline}
                      items={items}
                      meters={run.meters}
                      frames={run.frames}
                      showStats={true}
                    />
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Summary & Apply */}
        {summary && selectedOption && (
          <div className="border-t pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span>{summary.totalRuns} runs · {summary.totalFrames} frames</span>
              </div>
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span>{summary.totalMeters.toFixed(1)}m total</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>~{summary.estimatedMinutes} min</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Waste:</span>
                <span className="text-destructive">{summary.wasteMeters.toFixed(2)}m</span>
              </div>
            </div>
            
            <Button 
              onClick={handleApply} 
              disabled={isApplying}
              className="w-full"
              variant="default"
            >
              {isApplying ? (
                <>Creating Runs...</>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Apply Layout & Create Runs
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Sub-components

interface WeightSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  description: string;
}

function WeightSlider({ label, value, onChange, description }: WeightSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{Math.round(value * 100)}%</span>
      </div>
      <Slider
        value={[value * 100]}
        onValueChange={([v]) => onChange(v / 100)}
        max={100}
        step={5}
        className="w-full"
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

interface LayoutOptionCardProps {
  option: LayoutOption;
  isSelected: boolean;
  productionTime: number;
  onSelect: () => void;
}

function LayoutOptionCard({ option, isSelected, productionTime, onSelect }: LayoutOptionCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left p-4 rounded-lg border transition-all",
        isSelected 
          ? "border-primary bg-primary/5 ring-1 ring-primary" 
          : "border-border hover:border-primary/50"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
          <span className="font-medium">
            {option.runs.length} Run{option.runs.length !== 1 ? 's' : ''}
          </span>
          <Badge variant={option.overall_score >= 80 ? "default" : "secondary"}>
            {option.overall_score}% score
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground">
          ~{productionTime} min
        </span>
      </div>
      
      <div className="grid grid-cols-3 gap-2 mb-2">
        <ScoreBar label="Material" value={option.material_efficiency_score} />
        <ScoreBar label="Print" value={option.print_efficiency_score} />
        <ScoreBar label="Labor" value={option.labor_efficiency_score} />
      </div>
      
      <p className="text-xs text-muted-foreground">
        {option.reasoning}
      </p>
    </button>
  );
}

interface ScoreBarProps {
  label: string;
  value: number;
}

function ScoreBar({ label, value }: ScoreBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span>{value}%</span>
      </div>
      <Progress value={value} className="h-1" />
    </div>
  );
}
