import { QueueMergeGroup } from '@/hooks/tracker/useQueueMergeGroups';

/**
 * Generic queue config shape expected by applyQueueMerging.
 * Each dashboard's QueueConfig must satisfy at least these fields.
 */
export interface MergeableQueueConfig {
  id: string;
  title: string;
  stageName: string;
  colorClass: string;
  backgroundColor: string;
  icon: React.ReactNode;
  stageId: string;
  mergedStageIds?: string[];
}

/**
 * Applies DB-driven queue merging to an array of queue configs.
 * For each merge group that matches 2+ configs (by stageId), replaces them
 * with a single merged config whose `mergedStageIds` contains all originals.
 */
export function applyQueueMerging<T extends MergeableQueueConfig>(
  configs: T[],
  mergeGroups: QueueMergeGroup[]
): T[] {
  if (!mergeGroups || mergeGroups.length === 0) return configs;

  let result = [...configs];

  for (const group of mergeGroups) {
    const stageIdSet = new Set(group.stageIds);
    const matching = result.filter(c => stageIdSet.has(c.stageId));
    const nonMatching = result.filter(c => !stageIdSet.has(c.stageId));

    if (matching.length >= 2) {
      // Create merged config using first match as template
      const merged: T = {
        ...matching[0],
        id: `merge-${group.id}`,
        title: group.name,
        stageName: group.name,
        stageId: `merge-${group.id}`,
        backgroundColor: group.displayColor,
        mergedStageIds: matching.map(c => c.stageId),
      };
      result = [...nonMatching, merged];
    }
  }

  return result;
}
