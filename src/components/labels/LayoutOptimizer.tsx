/**
 * AI Layout Optimizer Component
 * 
 * Visual interface for generating and selecting optimal label layouts
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  LayoutGrid,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { useLayoutOptimizer } from '@/hooks/labels/useLayoutOptimizer';
import { usePrepareArtwork } from '@/hooks/labels/usePrepareArtwork';
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

  const { prepareBulk, isProcessing: isPreparingArtwork } = usePrepareArtwork(orderId);

  // Check artwork readiness - separate "has any artwork" from "is print-ready"
  const artworkReadiness = useMemo(() => {
    // Items that are fully print-ready
    const printReady = items.filter(item => item.print_pdf_status === 'ready');
    
    // Items with some form of artwork (proof or print)
    const hasAnyArtwork = items.filter(item => 
      item.proof_pdf_url || item.artwork_pdf_url || item.print_pdf_url
    );
    
    // Items missing all artwork (blocks layout generation)
    const missingArtwork = items.filter(item => 
      !item.proof_pdf_url && !item.artwork_pdf_url && !item.print_pdf_url
    );
    
    // Items not print-ready (for apply-time blocking)
    const notPrintReady = items.filter(item => item.print_pdf_status !== 'ready');
    const needsCrop = notPrintReady.filter(item => item.requires_crop || item.print_pdf_status === 'needs_crop');
    const canAutoFix = notPrintReady.filter(item => 
      (item.proof_pdf_url || item.artwork_pdf_url) && 
      !item.requires_crop && 
      item.print_pdf_status !== 'needs_crop'
    );
    
    return {
      // For layout generation - only need some artwork
      allHaveArtwork: missingArtwork.length === 0,
      missingArtworkCount: missingArtwork.length,
      
      // For apply - need print-ready
      allPrintReady: printReady.length === items.length,
      notPrintReadyCount: notPrintReady.length,
      notPrintReadyItems: notPrintReady,
      
      // For auto-fix UI
      needsCropCount: needsCrop.length,
      needsCropItems: needsCrop,
      canAutoFixCount: canAutoFix.length + needsCrop.length,
      canAutoFixItems: [...canAutoFix, ...needsCrop],
    };
  }, [items]);

  const handleApply = async () => {
    const success = await applyLayout();
    if (success && onLayoutApplied) {
      onLayoutApplied();
    }
  };

  const handlePrepareAll = async () => {
    const itemsToPrep = artworkReadiness.canAutoFixItems.map(item => ({
      id: item.id,
      action: (item.requires_crop || item.print_pdf_status === 'needs_crop') 
        ? 'crop' as const 
        : 'use_proof_as_print' as const,
      cropMm: item.crop_amount_mm || undefined,
    }));
    
    await prepareBulk(itemsToPrep);
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

        {/* Missing Artwork Alert - Blocks layout generation */}
        {!artworkReadiness.allHaveArtwork && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Missing Artwork</AlertTitle>
            <AlertDescription>
              {artworkReadiness.missingArtworkCount} item{artworkReadiness.missingArtworkCount !== 1 ? 's' : ''} missing 
              artwork files. Please upload artwork before generating layouts.
            </AlertDescription>
          </Alert>
        )}

        {/* Print-Ready Warning - Allows layout generation but warns about apply */}
        {artworkReadiness.allHaveArtwork && !artworkReadiness.allPrintReady && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Items Need Preparation</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                {artworkReadiness.notPrintReadyCount} item{artworkReadiness.notPrintReadyCount !== 1 ? 's' : ''} will 
                need print files before production. You can still preview layouts now.
              </p>
              {artworkReadiness.canAutoFixCount > 0 && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handlePrepareAll}
                  disabled={isPreparingArtwork}
                  className="mt-2"
                >
                  {isPreparingArtwork ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>Prepare {artworkReadiness.canAutoFixCount} Items</>
                  )}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

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
              <ScrollArea className="h-[60vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-4">
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
                      compact={true}
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
              disabled={isApplying || !artworkReadiness.allPrintReady}
              className="w-full"
              variant="default"
            >
              {isApplying ? (
                <>Creating Runs...</>
              ) : !artworkReadiness.allPrintReady ? (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Prepare Items First ({artworkReadiness.notPrintReadyCount} remaining)
                </>
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
          <Badge variant={Math.round(option.overall_score * 100) >= 80 ? "default" : "secondary"}>
            {Math.round(option.overall_score * 100)}% score
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
  const percent = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} className="h-1" />
    </div>
  );
}
