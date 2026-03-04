import { useState, useCallback, useMemo } from 'react';

interface StageVisibilityPreferences {
  hiddenStageIds: string[];
  stageOrder: string[];
}

const getStorageKey = (userId?: string) => `operator-stage-preferences-${userId || 'anonymous'}`;

const loadPreferences = (userId?: string): StageVisibilityPreferences => {
  try {
    const saved = localStorage.getItem(getStorageKey(userId));
    if (saved) return JSON.parse(saved);
  } catch {}
  return { hiddenStageIds: [], stageOrder: [] };
};

const savePreferences = (prefs: StageVisibilityPreferences, userId?: string) => {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(prefs));
  } catch {}
};

export interface StageConfig {
  id: string;
  [key: string]: any;
}

export const useStageVisibilityPreferences = (userId?: string) => {
  const [preferences, setPreferences] = useState<StageVisibilityPreferences>(() => loadPreferences(userId));

  const updatePreferences = useCallback((update: Partial<StageVisibilityPreferences>) => {
    setPreferences(prev => {
      const next = { ...prev, ...update };
      savePreferences(next, userId);
      return next;
    });
  }, [userId]);

  const toggleStage = useCallback((stageId: string) => {
    setPreferences(prev => {
      const hidden = prev.hiddenStageIds.includes(stageId)
        ? prev.hiddenStageIds.filter(id => id !== stageId)
        : [...prev.hiddenStageIds, stageId];
      const next = { ...prev, hiddenStageIds: hidden };
      savePreferences(next, userId);
      return next;
    });
  }, [userId]);

  const moveStage = useCallback((stageId: string, direction: 'left' | 'right') => {
    setPreferences(prev => {
      const order = [...prev.stageOrder];
      const idx = order.indexOf(stageId);
      if (idx === -1) return prev;
      const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= order.length) return prev;
      [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
      const next = { ...prev, stageOrder: order };
      savePreferences(next, userId);
      return next;
    });
  }, [userId]);

  const getVisibleOrderedConfigs = useCallback(<T extends StageConfig>(configs: T[]): T[] => {
    // Ensure stageOrder includes all config IDs (append any new ones)
    const currentOrder = preferences.stageOrder;
    const allIds = configs.map(c => c.id);
    const orderedIds = [
      ...currentOrder.filter(id => allIds.includes(id)),
      ...allIds.filter(id => !currentOrder.includes(id))
    ];

    // Persist the full order if it changed
    if (orderedIds.length !== currentOrder.length || orderedIds.some((id, i) => currentOrder[i] !== id)) {
      const next = { ...preferences, stageOrder: orderedIds };
      savePreferences(next, userId);
      // Don't call setPreferences here to avoid render loop — it's just a sync
    }

    return orderedIds
      .filter(id => !preferences.hiddenStageIds.includes(id))
      .map(id => configs.find(c => c.id === id)!)
      .filter(Boolean);
  }, [preferences, userId]);

  const initializeOrder = useCallback((configs: StageConfig[]) => {
    const allIds = configs.map(c => c.id);
    const currentOrder = preferences.stageOrder;
    const orderedIds = [
      ...currentOrder.filter(id => allIds.includes(id)),
      ...allIds.filter(id => !currentOrder.includes(id))
    ];
    if (orderedIds.join() !== currentOrder.join()) {
      updatePreferences({ stageOrder: orderedIds });
    }
  }, [preferences.stageOrder, updatePreferences]);

  return {
    preferences,
    toggleStage,
    moveStage,
    getVisibleOrderedConfigs,
    initializeOrder,
  };
};
