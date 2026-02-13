import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Crosshair } from 'lucide-react';
import type { LabelDieline } from '@/types/labels';
import { Badge } from '@/components/ui/badge';

interface DielineFinderProps {
  dielines: LabelDieline[];
}

interface MatchResult {
  dieline: LabelDieline;
  isRotated: boolean;
  widthDiff: number;
  heightDiff: number;
  totalDiff: number;
}

export function DielineFinder({ dielines }: DielineFinderProps) {
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  const searchW = parseFloat(width);
  const searchH = parseFloat(height);

  const matches = useMemo<MatchResult[]>(() => {
    if (!searchW || !searchH || searchW <= 0 || searchH <= 0) return [];

    const results: MatchResult[] = [];

    for (const d of dielines) {
      const directWDiff = Math.abs(d.label_width_mm - searchW);
      const directHDiff = Math.abs(d.label_height_mm - searchH);
      const rotatedWDiff = Math.abs(d.label_width_mm - searchH);
      const rotatedHDiff = Math.abs(d.label_height_mm - searchW);

      const directTotal = directWDiff + directHDiff;
      const rotatedTotal = rotatedWDiff + rotatedHDiff;

      const useRotated = rotatedTotal < directTotal;
      const wDiff = useRotated ? rotatedWDiff : directWDiff;
      const hDiff = useRotated ? rotatedHDiff : directHDiff;

      if (wDiff <= 5 && hDiff <= 5) {
        results.push({
          dieline: d,
          isRotated: useRotated,
          widthDiff: wDiff,
          heightDiff: hDiff,
          totalDiff: wDiff + hDiff,
        });
      }
    }

    results.sort((a, b) => a.totalDiff - b.totalDiff);
    return results.slice(0, 4);
  }, [dielines, searchW, searchH]);

  const getMatchLabel = (m: MatchResult) => {
    if (m.totalDiff === 0) return { text: 'Exact match', variant: 'default' as const };
    if (m.isRotated && m.totalDiff === 0) return { text: 'Exact (rotated)', variant: 'default' as const };
    if (m.isRotated) return { text: 'Rotated', variant: 'secondary' as const };
    return { text: 'Close match', variant: 'outline' as const };
  };

  const getDiffText = (m: MatchResult) => {
    if (m.totalDiff === 0) return '';
    const parts: string[] = [];
    if (m.widthDiff > 0) parts.push(`±${m.widthDiff}mm W`);
    if (m.heightDiff > 0) parts.push(`±${m.heightDiff}mm H`);
    return parts.join(', ');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Crosshair className="h-4 w-4 mr-2" />
          Find Dieline
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-1">Dieline Finder</h4>
            <p className="text-xs text-muted-foreground">Enter label dimensions to find matching dielines</p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Width (mm)</label>
              <Input
                type="number"
                placeholder="e.g. 70"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                min={0}
                step={0.5}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Height (mm)</label>
              <Input
                type="number"
                placeholder="e.g. 100"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                min={0}
                step={0.5}
              />
            </div>
          </div>

          {searchW > 0 && searchH > 0 && (
            <div className="space-y-2">
              {matches.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No dielines within 5mm tolerance
                </p>
              ) : (
                matches.map((m) => {
                  const label = getMatchLabel(m);
                  return (
                    <div
                      key={m.dieline.id}
                      className="flex items-start justify-between gap-2 rounded-md border p-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {m.dieline.die_no && (
                            <span className="text-muted-foreground mr-1.5">{m.dieline.die_no}</span>
                          )}
                          {m.dieline.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {m.dieline.label_width_mm}×{m.dieline.label_height_mm}mm
                          {' · '}
                          {m.dieline.columns_across}×{m.dieline.rows_around}
                          {getDiffText(m) && (
                            <span className="ml-1.5 text-muted-foreground/70">({getDiffText(m)})</span>
                          )}
                        </div>
                      </div>
                      <Badge variant={label.variant} className="shrink-0 text-[10px]">
                        {label.text}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
