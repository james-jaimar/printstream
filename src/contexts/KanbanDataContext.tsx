import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface KanbanJob {
  id: string;
  wo_no: string;
  customer: string;
  status: string;
  due_date?: string;
  reference?: string;
  category_id?: string;
  category_name?: string;
  stages?: any[];
  created_at?: string;
  is_expedited?: boolean;
}

interface KanbanDataContextType {
  jobs: KanbanJob[];
  stages: any[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

const KanbanDataContext = createContext<KanbanDataContextType | undefined>(undefined);

export const useKanbanDataContext = () => {
  const ctx = useContext(KanbanDataContext);
  if (!ctx) throw new Error("useKanbanDataContext must be used within KanbanDataProvider");
  return ctx;
};

// --- Data Fetching/Caching/Realtime ---
let globalKanbanCache = { jobs: [] as KanbanJob[], stages: [], lastUpdated: 0 };

// OPTIMIZED: Specific columns instead of SELECT *
const JOBS_SELECT = `
  id, wo_no, customer, status, due_date, reference, 
  category_id, created_at, is_expedited
`;

const STAGES_SELECT = `
  id, name, description, color, order_index, is_active, supports_parts
`;

export const KanbanDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<KanbanJob[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isTabVisible, setIsTabVisible] = useState(() => {
    if (typeof document === 'undefined') return true;
    return !document.hidden;
  });
  
  const subscriptionRef = useRef<any>(null);
  const debouncedFetchRef = useRef<NodeJS.Timeout | null>(null);

  // 5 min cache
  const CACHE_TTL = 5 * 60 * 1000;

  // Tab visibility detection
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const handler = () => {
      const visible = !document.hidden;
      setIsTabVisible(visible);
      console.log(`📱 KanbanDataContext: Tab ${visible ? 'visible' : 'hidden'}`);
    };
    
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const fetchKanbanData = useCallback(async (force = false) => {
    if (
      !force &&
      globalKanbanCache.jobs.length &&
      globalKanbanCache.stages.length &&
      Date.now() - globalKanbanCache.lastUpdated < CACHE_TTL
    ) {
      setJobs(globalKanbanCache.jobs);
      setStages(globalKanbanCache.stages);
      setLastUpdated(new Date(globalKanbanCache.lastUpdated));
      setIsLoading(false);
      setError(null);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // OPTIMIZED: Fetch jobs with specific columns only
      const { data: jobsData, error: jobsError } = await supabase
        .from('production_jobs')
        .select(JOBS_SELECT)
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;

      // OPTIMIZED: Fetch stages with specific columns only
      const { data: stagesData, error: stagesErr } = await supabase
        .from('production_stages')
        .select(STAGES_SELECT)
        .order('order_index', { ascending: true });

      if (stagesErr) throw stagesErr;

      globalKanbanCache = {
        jobs: jobsData,
        stages: stagesData,
        lastUpdated: Date.now(),
      };
      setJobs(jobsData);
      setStages(stagesData);
      setLastUpdated(new Date());
      setIsLoading(false);
      setIsRefreshing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Kanban data");
      setIsLoading(false);
      setIsRefreshing(false);
      toast.error("Failed to load Kanban data");
    }
  }, []);

  // OPTIMIZED: Debounced handler for real-time changes
  const handleRealtimeChange = useCallback(() => {
    // Skip if tab is hidden
    if (!isTabVisible) {
      console.log('📡 KanbanDataContext: Skipping refetch (tab hidden)');
      return;
    }

    // Debounce: wait 2 seconds before refetching
    if (debouncedFetchRef.current) {
      clearTimeout(debouncedFetchRef.current);
    }

    debouncedFetchRef.current = setTimeout(() => {
      console.log('📡 KanbanDataContext: Debounced refetch triggered');
      fetchKanbanData(true);
    }, 2000);
  }, [isTabVisible, fetchKanbanData]);

  const refresh = useCallback(() => {
    // Clear any pending debounced fetches
    if (debouncedFetchRef.current) {
      clearTimeout(debouncedFetchRef.current);
    }
    setIsRefreshing(true);
    fetchKanbanData(true);
  }, [fetchKanbanData]);

  // Initial fetch and real-time subscription
  useEffect(() => {
    fetchKanbanData(false);

    // OPTIMIZED: Only subscribe when tab is visible
    if (!isTabVisible) {
      // Cleanup existing subscription when tab hidden
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      return;
    }

    if (!subscriptionRef.current) {
      const channel = supabase
        .channel("kanban_realtime")
        .on('postgres_changes', { event: '*', schema: 'public', table: 'production_jobs' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'production_stages' }, handleRealtimeChange)
        .subscribe();
      subscriptionRef.current = channel;
    }

    return () => {
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [fetchKanbanData, handleRealtimeChange, isTabVisible]);

  return (
    <KanbanDataContext.Provider value={{ jobs, stages, isLoading, isRefreshing, error, lastUpdated, refresh }}>
      {children}
    </KanbanDataContext.Provider>
  );
};
