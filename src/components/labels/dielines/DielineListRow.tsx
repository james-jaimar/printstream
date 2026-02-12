import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableCell, TableRow } from '@/components/ui/table';
import { MoreVertical, Pencil, Trash2, Copy } from 'lucide-react';
import type { LabelDieline } from '@/types/labels';

interface DielineListRowProps {
  dieline: LabelDieline;
  onEdit: (dieline: LabelDieline) => void;
  onDelete: (id: string) => void;
  onDuplicate: (dieline: LabelDieline) => void;
  isDeleting?: boolean;
}

export function DielineListRow({ dieline, onEdit, onDelete, onDuplicate, isDeleting }: DielineListRowProps) {
  const labelsPerFrame = dieline.columns_across * dieline.rows_around;

  return (
    <TableRow className="group">
      <TableCell className="font-mono text-xs whitespace-nowrap">
        {dieline.die_no || '—'}
      </TableCell>
      <TableCell className="font-medium truncate max-w-[200px]" title={dieline.name}>
        {dieline.name}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {dieline.label_width_mm} × {dieline.label_height_mm}mm
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {dieline.columns_across} × {dieline.rows_around}
      </TableCell>
      <TableCell>
        {dieline.die_type && dieline.die_type !== 'rectangle' ? (
          <Badge variant="outline" className="text-xs capitalize">{dieline.die_type}</Badge>
        ) : (
          <span className="text-muted-foreground text-xs">rect</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {dieline.horizontal_gap_mm}H / {dieline.vertical_gap_mm}V
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="text-xs">{labelsPerFrame}</Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]" title={dieline.client || ''}>
        {dieline.client || '—'}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
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
      </TableCell>
    </TableRow>
  );
}
