import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Check, Zap, Package, Clock, Scissors } from 'lucide-react';
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
      default: return <Package className="h-4 w-4" />;
    }
  };

  const getOptionTitle = (id: string) => {
    switch (id) {
      case 'ganged-all': return 'Ganged Run';
      case 'individual': return 'Individual Runs';
      case 'optimized': return 'Optimized Split';
      default: return 'Layout Option';
    }
  };

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

        {/* Reasoning */}
        <p className="text-xs text-muted-foreground italic">
          {option.reasoning}
        </p>
      </CardContent>
    </Card>
  );
}
