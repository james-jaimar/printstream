import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Grid3X3, Ruler, Trash2 } from 'lucide-react';
import { useLabelDielines, useCreateLabelDieline, useDeleteLabelDieline } from '@/hooks/labels/useLabelDielines';
import { LABEL_PRINT_CONSTANTS } from '@/types/labels';

export default function LabelsDielines() {
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDieline, setNewDieline] = useState({
    name: '',
    roll_width_mm: 320,
    label_width_mm: 50,
    label_height_mm: 30,
    columns_across: 6,
    rows_around: 4,
    horizontal_gap_mm: 3,
    vertical_gap_mm: 2.5,
    corner_radius_mm: 0,
  });

  const { data: dielines, isLoading } = useLabelDielines();
  const createMutation = useCreateLabelDieline();
  const deleteMutation = useDeleteLabelDieline();

  const filteredDielines = dielines?.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    await createMutation.mutateAsync(newDieline);
    setIsCreateOpen(false);
    setNewDieline({
      name: '',
      roll_width_mm: 320,
      label_width_mm: 50,
      label_height_mm: 30,
      columns_across: 6,
      rows_around: 4,
      horizontal_gap_mm: 3,
      vertical_gap_mm: 2.5,
      corner_radius_mm: 0,
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to archive this dieline?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  // Auto-generate name when dimensions change
  const generateName = () => {
    return `${newDieline.columns_across} Across x ${newDieline.rows_around} Around - ${newDieline.label_width_mm}x${newDieline.label_height_mm}mm (${newDieline.roll_width_mm}mm roll)`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dieline Library</h1>
          <p className="text-muted-foreground">
            Standard label layouts and die templates
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Dieline
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Dieline Template</DialogTitle>
              <DialogDescription>
                Define the label dimensions and layout for the die.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Roll Width (mm)</Label>
                  <select
                    className="w-full p-2 border rounded"
                    value={newDieline.roll_width_mm}
                    onChange={(e) =>
                      setNewDieline({ ...newDieline, roll_width_mm: Number(e.target.value) })
                    }
                  >
                    {LABEL_PRINT_CONSTANTS.ROLL_WIDTHS_MM.map((w) => (
                      <option key={w} value={w}>{w}mm</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Corner Radius (mm)</Label>
                  <Input
                    type="number"
                    value={newDieline.corner_radius_mm}
                    onChange={(e) =>
                      setNewDieline({ ...newDieline, corner_radius_mm: Number(e.target.value) })
                    }
                    min={0}
                    step={0.5}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Label Width (mm)</Label>
                  <Input
                    type="number"
                    value={newDieline.label_width_mm}
                    onChange={(e) =>
                      setNewDieline({ ...newDieline, label_width_mm: Number(e.target.value) })
                    }
                    min={10}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Label Height (mm)</Label>
                  <Input
                    type="number"
                    value={newDieline.label_height_mm}
                    onChange={(e) =>
                      setNewDieline({ ...newDieline, label_height_mm: Number(e.target.value) })
                    }
                    min={10}
                    step={1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Columns Across</Label>
                  <Input
                    type="number"
                    value={newDieline.columns_across}
                    onChange={(e) =>
                      setNewDieline({ ...newDieline, columns_across: Number(e.target.value) })
                    }
                    min={1}
                    max={20}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rows Around</Label>
                  <Input
                    type="number"
                    value={newDieline.rows_around}
                    onChange={(e) =>
                      setNewDieline({ ...newDieline, rows_around: Number(e.target.value) })
                    }
                    min={1}
                    max={20}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Horizontal Gap (mm)</Label>
                  <Input
                    type="number"
                    value={newDieline.horizontal_gap_mm}
                    onChange={(e) =>
                      setNewDieline({ ...newDieline, horizontal_gap_mm: Number(e.target.value) })
                    }
                    min={0}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vertical Gap (mm)</Label>
                  <Input
                    type="number"
                    value={newDieline.vertical_gap_mm}
                    onChange={(e) =>
                      setNewDieline({ ...newDieline, vertical_gap_mm: Number(e.target.value) })
                    }
                    min={0}
                    step={0.5}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  value={newDieline.name || generateName()}
                  onChange={(e) =>
                    setNewDieline({ ...newDieline, name: e.target.value })
                  }
                  placeholder="Auto-generated from dimensions"
                />
              </div>

              {/* Preview */}
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Layout Preview</p>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>
                    Labels per frame: {newDieline.columns_across * newDieline.rows_around}
                  </span>
                  <span>|</span>
                  <span>
                    Total width: {newDieline.columns_across * newDieline.label_width_mm + 
                      (newDieline.columns_across - 1) * newDieline.horizontal_gap_mm}mm
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Dieline'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search dielines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Dielines Grid */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading dielines...</p>
      ) : filteredDielines?.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No dielines found</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDielines?.map((dieline) => (
            <Card key={dieline.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{dieline.name}</CardTitle>
                  {dieline.is_custom && (
                    <Badge variant="outline">Custom</Badge>
                  )}
                </div>
                <CardDescription>
                  {dieline.roll_width_mm}mm roll width
                </CardDescription>
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
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    Gaps: {dieline.horizontal_gap_mm}mm H, {dieline.vertical_gap_mm}mm V
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(dieline.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
