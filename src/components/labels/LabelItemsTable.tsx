import { useState } from 'react';
import { 
  FileImage, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Trash2,
  Eye
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LabelItem, PreflightStatus } from '@/types/labels';
import { useDeleteLabelItem } from '@/hooks/labels/useLabelItems';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
interface LabelItemsTableProps {
  items: LabelItem[];
  orderId: string;
  onViewArtwork?: (item: LabelItem) => void;
}

const preflightStatusConfig: Record<PreflightStatus, { 
  icon: typeof CheckCircle2; 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline' 
}> = {
  pending: { icon: Clock, label: 'Pending', variant: 'secondary' },
  passed: { icon: CheckCircle2, label: 'Passed', variant: 'default' },
  failed: { icon: AlertCircle, label: 'Failed', variant: 'destructive' },
  warnings: { icon: AlertTriangle, label: 'Warnings', variant: 'outline' },
};

export function LabelItemsTable({ items, orderId, onViewArtwork }: LabelItemsTableProps) {
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const deleteItem = useDeleteLabelItem();

  const handleDelete = async () => {
    if (deleteItemId) {
      await deleteItem.mutateAsync({ id: deleteItemId, orderId });
      setDeleteItemId(null);
    }
  };

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Size (mm)</TableHead>
              <TableHead>Preflight</TableHead>
              <TableHead>Artwork</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <FileImage className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No label items added yet</p>
                  <p className="text-sm">Upload artwork files to get started</p>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {items.map((item) => {
                  const preflight = preflightStatusConfig[item.preflight_status];
                  const PreflightIcon = preflight.icon;

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-muted-foreground">
                        {item.item_number}
                      </TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {item.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {item.width_mm && item.height_mm ? (
                          <span className="font-mono text-sm">
                            {item.width_mm} × {item.height_mm}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={preflight.variant} className="gap-1">
                          <PreflightIcon className="h-3 w-3" />
                          {preflight.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.artwork_thumbnail_url ? (
                          <img 
                            src={item.artwork_thumbnail_url} 
                            alt={item.name}
                            className="h-10 w-10 object-contain rounded border"
                          />
                        ) : item.artwork_pdf_url ? (
                          <Badge variant="outline">PDF</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">No artwork</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {item.artwork_pdf_url && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onViewArtwork?.(item)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteItemId(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={2} className="font-medium">
                    Total: {items.length} items
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {totalQuantity.toLocaleString()}
                  </TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Label Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this label item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
