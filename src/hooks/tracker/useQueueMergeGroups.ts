import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface QueueMergeGroup {
  id: string;
  name: string;
  displayColor: string;
  stageIds: string[];
}

export const useQueueMergeGroups = () => {
  const [mergeGroups, setMergeGroups] = useState<QueueMergeGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMergeGroups = useCallback(async () => {
    try {
      setIsLoading(true);

      const { data: groups, error: groupsError } = await supabase
        .from('queue_merge_groups' as any)
        .select('id, name, display_color');

      if (groupsError) throw groupsError;
      if (!groups || groups.length === 0) {
        setMergeGroups([]);
        return;
      }

      const { data: stages, error: stagesError } = await supabase
        .from('queue_merge_group_stages' as any)
        .select('merge_group_id, production_stage_id');

      if (stagesError) throw stagesError;

      const result: QueueMergeGroup[] = (groups as any[]).map((g: any) => ({
        id: g.id,
        name: g.name,
        displayColor: g.display_color || '#ea580c',
        stageIds: ((stages as any[]) || [])
          .filter((s: any) => s.merge_group_id === g.id)
          .map((s: any) => s.production_stage_id),
      }));

      setMergeGroups(result);
    } catch (err) {
      console.error('Error fetching queue merge groups:', err);
      setMergeGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMergeGroups();
  }, [fetchMergeGroups]);

  return { mergeGroups, isLoading, refetch: fetchMergeGroups };
};
