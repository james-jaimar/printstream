import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Save, X, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

interface ProductionStage {
  id: string;
  name: string;
}

interface MergeGroup {
  id: string;
  name: string;
  display_color: string;
  stageIds: string[];
}

export const QueueMergeGroupsManagement: React.FC = () => {
  const [groups, setGroups] = useState<MergeGroup[]>([]);
  const [allStages, setAllStages] = useState<ProductionStage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<MergeGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#ea580c');
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [groupsRes, stagesRes, mappingsRes] = await Promise.all([
        supabase.from('queue_merge_groups' as any).select('*'),
        supabase.from('production_stages').select('id, name').order('name'),
        supabase.from('queue_merge_group_stages' as any).select('merge_group_id, production_stage_id'),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (stagesRes.error) throw stagesRes.error;

      const mappings = (mappingsRes.data as any[]) || [];
      const loadedGroups: MergeGroup[] = ((groupsRes.data as any[]) || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        display_color: g.display_color || '#ea580c',
        stageIds: mappings
          .filter((m: any) => m.merge_group_id === g.id)
          .map((m: any) => m.production_stage_id),
      }));

      setGroups(loadedGroups);
      setAllStages(stagesRes.data || []);
    } catch (err) {
      console.error('Error loading merge groups:', err);
      toast.error('Failed to load merge groups');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Stage IDs already assigned to any group (for duplicate prevention)
  const assignedStageIds = new Set(
    groups.flatMap(g => (editingGroup && g.id === editingGroup.id) ? [] : g.stageIds)
  );

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error('Name is required');
      return;
    }
    if (selectedStageIds.length < 2) {
      toast.error('Select at least 2 stages to merge');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('queue_merge_groups' as any)
        .insert({ name: newGroupName.trim(), display_color: newGroupColor } as any)
        .select('id')
        .single();

      if (error) throw error;

      const groupId = (data as any).id;
      const rows = selectedStageIds.map(sid => ({
        merge_group_id: groupId,
        production_stage_id: sid,
      }));

      const { error: stagesError } = await supabase
        .from('queue_merge_group_stages' as any)
        .insert(rows as any);

      if (stagesError) throw stagesError;

      toast.success(`Created merge group "${newGroupName}"`);
      setShowAddForm(false);
      setNewGroupName('');
      setNewGroupColor('#ea580c');
      setSelectedStageIds([]);
      fetchData();
    } catch (err: any) {
      console.error('Error creating merge group:', err);
      toast.error(err.message || 'Failed to create merge group');
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('queue_merge_groups' as any)
        .delete()
        .eq('id', groupId);

      if (error) throw error;
      toast.success('Merge group deleted');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const startEditing = (group: MergeGroup) => {
    setEditingGroup(group);
    setNewGroupName(group.name);
    setNewGroupColor(group.display_color);
    setSelectedStageIds([...group.stageIds]);
  };

  const handleSaveEdit = async () => {
    if (!editingGroup) return;
    if (selectedStageIds.length < 2) {
      toast.error('Select at least 2 stages');
      return;
    }

    try {
      // Update group
      const { error: updateError } = await supabase
        .from('queue_merge_groups' as any)
        .update({ name: newGroupName.trim(), display_color: newGroupColor } as any)
        .eq('id', editingGroup.id);

      if (updateError) throw updateError;

      // Replace stage mappings
      await supabase
        .from('queue_merge_group_stages' as any)
        .delete()
        .eq('merge_group_id', editingGroup.id);

      const rows = selectedStageIds.map(sid => ({
        merge_group_id: editingGroup.id,
        production_stage_id: sid,
      }));

      const { error: insertError } = await supabase
        .from('queue_merge_group_stages' as any)
        .insert(rows as any);

      if (insertError) throw insertError;

      toast.success('Merge group updated');
      setEditingGroup(null);
      setNewGroupName('');
      setSelectedStageIds([]);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    }
  };

  const cancelEdit = () => {
    setEditingGroup(null);
    setNewGroupName('');
    setSelectedStageIds([]);
  };

  const toggleStageSelection = (stageId: string) => {
    setSelectedStageIds(prev =>
      prev.includes(stageId) ? prev.filter(id => id !== stageId) : [...prev, stageId]
    );
  };

  const getStageName = (stageId: string) =>
    allStages.find(s => s.id === stageId)?.name || stageId;

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading merge groups...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Queue Merge Groups</h2>
          <p className="text-sm text-muted-foreground">
            Combine multiple production stages into a single operator queue
          </p>
        </div>
        {!showAddForm && !editingGroup && (
          <Button onClick={() => { setShowAddForm(true); setSelectedStageIds([]); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Group
          </Button>
        )}
      </div>

      {/* Existing Groups */}
      {groups.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Merged Stages</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(group => (
              <TableRow key={group.id}>
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded border"
                      style={{ backgroundColor: group.display_color }}
                    />
                    <span className="text-xs text-muted-foreground">{group.display_color}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {group.stageIds.map(sid => (
                      <Badge key={sid} variant="secondary" className="text-xs">
                        {getStageName(sid)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEditing(group)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteGroup(group.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {groups.length === 0 && !showAddForm && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No merge groups configured yet.</p>
            <p className="text-sm">Create one to combine stages into a single operator queue.</p>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Form */}
      {(showAddForm || editingGroup) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingGroup ? `Edit "${editingGroup.name}"` : 'New Merge Group'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium">Group Name</label>
                <Input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="e.g. Trimming, Finishing"
                />
              </div>
              <div className="w-40">
                <label className="text-sm font-medium">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newGroupColor}
                    onChange={e => setNewGroupColor(e.target.value)}
                    className="h-10 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={newGroupColor}
                    onChange={e => setNewGroupColor(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">
                Select Stages to Merge ({selectedStageIds.length} selected)
              </label>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto border rounded-md p-3">
                {allStages.map(stage => {
                  const isAssignedElsewhere = assignedStageIds.has(stage.id);
                  const isSelected = selectedStageIds.includes(stage.id);
                  return (
                    <label
                      key={stage.id}
                      className={`flex items-center gap-2 p-2 rounded text-sm cursor-pointer hover:bg-muted ${
                        isAssignedElsewhere ? 'opacity-40' : ''
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleStageSelection(stage.id)}
                        disabled={isAssignedElsewhere && !isSelected}
                      />
                      <span className="truncate">{stage.name}</span>
                      {isAssignedElsewhere && (
                        <span className="text-xs text-muted-foreground">(used)</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { cancelEdit(); setShowAddForm(false); }}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button onClick={editingGroup ? handleSaveEdit : handleCreateGroup}>
                <Save className="h-4 w-4 mr-1" /> {editingGroup ? 'Save Changes' : 'Create Group'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
