import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search } from 'lucide-react';
import { ViewToggle } from '@/components/tracker/common/ViewToggle';
import { 
  useLabelDielines, 
  useCreateLabelDieline, 
  useUpdateLabelDieline,
  useDeleteLabelDieline 
} from '@/hooks/labels/useLabelDielines';
import { DielineFormDialog, DielineCard, DielineListRow } from '@/components/labels/dielines';
import type { LabelDieline, CreateLabelDielineInput } from '@/types/labels';
import { toast } from 'sonner';

export default function LabelsDielines() {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDieline, setEditingDieline] = useState<LabelDieline | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: dielines, isLoading } = useLabelDielines(false);
  const createMutation = useCreateLabelDieline();
  const updateMutation = useUpdateLabelDieline();
  const deleteMutation = useDeleteLabelDieline();

  const activeDielines = dielines?.filter(d => d.is_active) || [];
  const filteredDielines = activeDielines.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (data: CreateLabelDielineInput) => {
    await createMutation.mutateAsync(data);
    setIsFormOpen(false);
  };

  const handleEdit = (dieline: LabelDieline) => {
    setEditingDieline(dieline);
    setIsFormOpen(true);
  };

  const handleUpdate = async (data: CreateLabelDielineInput) => {
    if (!editingDieline) return;
    await updateMutation.mutateAsync({
      id: editingDieline.id,
      updates: data,
    });
    setIsFormOpen(false);
    setEditingDieline(null);
  };

  const handleDuplicate = (dieline: LabelDieline) => {
    setEditingDieline(null);
    setIsFormOpen(true);
    setTimeout(() => {
      const duplicateData: LabelDieline = {
        ...dieline,
        id: '',
        name: `${dieline.name} (Copy)`,
        is_custom: true,
        created_at: '',
        updated_at: '',
      };
      setEditingDieline(duplicateData);
    }, 0);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteMutation.mutateAsync(deleteConfirm);
    setDeleteConfirm(null);
  };

  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      setEditingDieline(null);
    }
  };

  const handleSubmit = async (data: CreateLabelDielineInput) => {
    if (editingDieline?.id) {
      await handleUpdate(data);
    } else {
      await handleCreate(data);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dieline Library</h1>
          <p className="text-muted-foreground">
            Standard label layouts and die templates ({activeDielines.length} active)
          </p>
        </div>
        <Button onClick={() => { setEditingDieline(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Dieline
        </Button>
      </div>

      {/* Search + View Toggle */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search dielines..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <ViewToggle view={viewMode} onViewChange={setViewMode} />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-muted-foreground text-center py-8">Loading dielines...</div>
      ) : filteredDielines.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            {search ? 'No dielines match your search' : 'No dielines configured yet'}
          </p>
          {!search && (
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create your first dieline
            </Button>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Die No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Size (W×H)</TableHead>
              <TableHead>Across × Around</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Gaps</TableHead>
              <TableHead>Labels</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDielines.map((dieline) => (
              <DielineListRow
                key={dieline.id}
                dieline={dieline}
                onEdit={handleEdit}
                onDelete={(id) => setDeleteConfirm(id)}
                onDuplicate={handleDuplicate}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDielines.map((dieline) => (
            <DielineCard
              key={dieline.id}
              dieline={dieline}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteConfirm(id)}
              onDuplicate={handleDuplicate}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <DielineFormDialog
        open={isFormOpen}
        onOpenChange={handleFormClose}
        dieline={editingDieline}
        onSubmit={handleSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this dieline?</AlertDialogTitle>
            <AlertDialogDescription>
              This dieline will be archived and hidden from the library. 
              It can be restored later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
