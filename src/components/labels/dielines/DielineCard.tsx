import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Grid3X3, Ruler, MoreVertical, Pencil, Trash2, Copy } from 'lucide-react';
import type { LabelDieline } from '@/types/labels';

interface DielineCardProps {
  dieline: LabelDieline;
  onEdit: (dieline: LabelDieline) => void;
  onDelete: (id: string) => void;
  onDuplicate: (dieline: LabelDieline) => void;
  isDeleting?: boolean;
}

export function DielineCard({ dieline, onEdit, onDelete, onDuplicate, isDeleting }: DielineCardProps) {
  const labelsPerFrame = dieline.columns_across * dieline.rows_around;

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate" title={dieline.name}>
              {dieline.name}
            </CardTitle>
            {dieline.die_no && (
              <CardDescription className="font-mono text-xs">{dieline.die_no}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {dieline.die_type && dieline.die_type !== 'rectangle' && (
              <Badge variant="outline" className="text-xs capitalize">{dieline.die_type}</Badge>
            )}
            {dieline.is_custom && (
              <Badge variant="outline">Custom</Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(dieline)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(dieline)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onDelete(dieline.id)}
                  className="text-destructive focus:text-destructive"
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Ruler className="h-4 w-4" />
            <span>{dieline.label_width_mm} x {dieline.label_height_mm}mm</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Grid3X3 className="h-4 w-4" />
            <span>{dieline.columns_across} x {dieline.rows_around}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <span className="text-xs text-muted-foreground">
            Gaps: {dieline.horizontal_gap_mm}mm H, {dieline.vertical_gap_mm}mm V
          </span>
          <Badge variant="secondary" className="text-xs">
            {labelsPerFrame} labels/frame
          </Badge>
        </div>
        {dieline.corner_radius_mm != null && dieline.corner_radius_mm > 0 && (
          <div className="mt-2">
            <span className="text-xs text-muted-foreground">
              Corner radius: {dieline.corner_radius_mm}mm
            </span>
          </div>
        )}
        {dieline.client && (
          <div className="mt-1">
            <span className="text-xs text-muted-foreground">Client: {dieline.client}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
