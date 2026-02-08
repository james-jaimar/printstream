import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Lightbulb, TrendingDown, Target } from 'lucide-react';

interface AISuggestion {
  recommendation: 'ganged' | 'individual' | 'hybrid';
  reasoning: string;
  estimated_waste_percent: number;
  suggested_run_count: number;
  efficiency_tips?: string[];
}

interface AISuggestionCardProps {
  suggestion: AISuggestion;
}

export function AISuggestionCard({ suggestion }: AISuggestionCardProps) {
  const getRecommendationLabel = (rec: string) => {
    switch (rec) {
      case 'ganged': return 'Gang All Items';
      case 'individual': return 'Print Separately';
      case 'hybrid': return 'Hybrid Approach';
      default: return rec;
    }
  };

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'ganged': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'individual': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'hybrid': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">AI Recommendation</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Recommendation */}
        <div className="flex items-center gap-3">
          <Badge className={getRecommendationColor(suggestion.recommendation)}>
            <Target className="h-3 w-3 mr-1" />
            {getRecommendationLabel(suggestion.recommendation)}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {suggestion.suggested_run_count} run(s) suggested
          </span>
        </div>

        {/* Reasoning */}
        <p className="text-sm">{suggestion.reasoning}</p>

        {/* Waste Estimate */}
        <div className="flex items-center gap-2 text-sm">
          <TrendingDown className="h-4 w-4 text-green-500" />
          <span>
            Estimated waste: <strong>{suggestion.estimated_waste_percent.toFixed(1)}%</strong>
          </span>
        </div>

        {/* Tips */}
        {suggestion.efficiency_tips && suggestion.efficiency_tips.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              <span>Efficiency Tips</span>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {suggestion.efficiency_tips.map((tip, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
