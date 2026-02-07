// --- Refactored for maintainability. Utilities/types extracted. ---
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTabVisibility } from '@/hooks/useTabVisibility';
import { toast } from 'sonner';
import { CACHE_TTL, isCacheValid, groupStagesByMasterQueue } from './useDataManager.utils';
import type { CachedData, DataManagerState } from './useDataManager.types';

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const globalRouteCache: Record<string, { jobs: CachedData | null; stages: CachedData | null }> = {};

// OPTIMIZED: Specific columns instead of SELECT *
const JOBS_SELECT = `
  id, wo_no, customer, status, due_date, reference,
  created_at, is_expedited, category_id,
  categories(id, name, color, sla_target_days)
`;

const STAGES_SELECT = `
  id, name, description, color, order_index, is_active, supports_parts
`;

export const useDataManager = () => {
  const { user } = useAuth();
  const { isVisible } = useTabVisibility();
  const [state, setState] = useState<DataManagerState>({
    jobs: [],
    stages: [],
    isLoading: true,
    isRefreshing: false,
    lastUpdated: null,
    error: null
  });

  const routeKey = typeof window !== 'undefined' && window.location ? window.location.pathname : 'default-route-key';
  if (!globalRouteCache[routeKey]) {
    globalRouteCache[routeKey] = { jobs: null, stages: null };
  }
  const cacheRef = useRef(globalRouteCache[routeKey]);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isManualRefreshRef = useRef(false);

  const fetchJobs = useCallback(async (): Promise<any[]> => {
    // OPTIMIZED: Use specific columns
    const { data, error } = await supabase
      .from('production_jobs')
      .select(JOBS_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }, []);

  const fetchStages = useCallback(async (): Promise<any[]> => {
    // OPTIMIZED: Use specific columns
    const { data, error } = await supabase
      .from('production_stages')
      .select(STAGES_SELECT)
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data || [];
  }, []);

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (!user?.id) return;

    isManualRefreshRef.current = isManualRefresh;

    try {
      setState(prev => ({
        ...prev,
        error: null,
        isLoading: !isManualRefresh && prev.jobs.length === 0,
        isRefreshing: isManualRefresh
      }));

      if (!isManualRefresh) {
        const jobsCache = cacheRef.current.jobs;
        const stagesCache = cacheRef.current.stages;

        if (isCacheValid(jobsCache) && isCacheValid(stagesCache)) {
          setState(prev => ({
            ...prev,
            jobs: jobsCache!.data,
            stages: stagesCache!.data,
            isLoading: false,
            isRefreshing: false,
            lastUpdated: new Date(jobsCache!.timestamp)
          }));
          return;
        }
      }

      const [jobsData, stagesData] = await Promise.all([
        fetchJobs(),
        fetchStages()
      ]);

      const now = Date.now();

      cacheRef.current.jobs = { data: jobsData, timestamp: now, isStale: false };
      cacheRef.current.stages = { data: stagesData, timestamp: now, isStale: false };
      globalRouteCache[routeKey] = cacheRef.current;

      setState(prev => ({
        ...prev,
        jobs: jobsData,
        stages: stagesData,
        isLoading: false,
        isRefreshing: false,
        lastUpdated: new Date(now),
        error: null
      }));

      if (isManualRefresh) {
        toast.success('Data refreshed successfully');
      }

    } catch (error) {
      console.error('❌ Error loading data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load data';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
        isRefreshing: false
      }));

      if (isManualRefresh) {
        toast.error('Failed to refresh data');
      }
    }
  }, [user?.id, fetchJobs, fetchStages, routeKey]);

  const manualRefresh = useCallback(() => {
    console.log('🔄 Manual refresh triggered');
    loadData(true);
  }, [loadData]);

  // OPTIMIZED: Only run interval when tab is visible
  useEffect(() => {
    if (!user?.id) return;

    // Initial load
    loadData(false);

    // OPTIMIZED: Only set up interval when tab is visible
    if (isVisible) {
      autoRefreshIntervalRef.current = setInterval(() => {
        console.log('🔄 Auto-refresh triggered (tab visible)');
        loadData(false);
      }, AUTO_REFRESH_INTERVAL);
    }

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    };
  }, [user?.id, loadData, routeKey, isVisible]);

  // OPTIMIZED: Pause/resume interval based on tab visibility
  useEffect(() => {
    if (!user?.id) return;

    if (isVisible) {
      // Tab became visible - refresh data and restart interval
      console.log('📱 useDataManager: Tab visible - resuming');
      loadData(false);
      
      if (!autoRefreshIntervalRef.current) {
        autoRefreshIntervalRef.current = setInterval(() => {
          loadData(false);
        }, AUTO_REFRESH_INTERVAL);
      }
    } else {
      // Tab hidden - pause interval
      console.log('📱 useDataManager: Tab hidden - pausing');
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    }
  }, [isVisible, user?.id, loadData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, []);

  const getTimeSinceLastUpdate = useCallback(() => {
    if (!state.lastUpdated) return null;
    const now = new Date();
    const diffMs = now.getTime() - state.lastUpdated.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    return `${diffMins} minutes ago`;
  }, [state.lastUpdated]);

  return {
    jobs: state.jobs,
    stages: state.stages,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    lastUpdated: state.lastUpdated,
    error: state.error,
    manualRefresh,
    getTimeSinceLastUpdate,
    groupStagesByMasterQueue
  };
};
