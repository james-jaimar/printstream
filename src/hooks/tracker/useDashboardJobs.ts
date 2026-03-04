import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DashboardJob {
  id: string;
  wo_no: string;
  customer: string | null;
  status: string;
  due_date: string | null;
  proof_approved_at: string | null;
  current_stage_name: string;
  current_stage_status: string;
  current_stage_color: string;
  display_stage_name: string;
  workflow_progress: number;
  category: string | null;
  category_color: string | null;
}

export const useDashboardJobs = () => {
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase.rpc(
        'get_dashboard_job_stats' as any
      );

      if (fetchError) {
        console.error('Error fetching dashboard jobs:', fetchError);
        throw fetchError;
      }

      setJobs((data as any) || []);
      setLastFetchTime(new Date());
    } catch (err) {
      console.error('Failed to fetch dashboard jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return {
    jobs,
    isLoading,
    error,
    refreshJobs: fetchJobs,
    lastFetchTime
  };
};
