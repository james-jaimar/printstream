import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Sets up and tears down a real-time subscription on job_stage_instances.
 * OPTIMIZED: Added tab visibility detection and debouncing to reduce egress.
 * @param jobs Active jobs array to determine if subscription should run
 * @param onStageChanged Callback to fire on any job_stage_instances change.
 */
export function useJobStageSubscription(jobs: any[], onStageChanged: () => void) {
  const [isTabVisible, setIsTabVisible] = useState(() => {
    if (typeof document === 'undefined') return true;
    return !document.hidden;
  });
  const channelRef = useRef<any>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Tab visibility detection
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const handler = () => setIsTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    // Don't subscribe if no jobs or tab is hidden
    if (jobs.length === 0 || !isTabVisible) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    // Don't create duplicate subscriptions
    if (channelRef.current) return;

    const channel = supabase
      .channel('job_stage_instances_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_stage_instances',
        },
        () => {
          // OPTIMIZED: Skip if tab hidden
          if (!isTabVisible) return;
          
          // OPTIMIZED: Debounce notifications (2 seconds)
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          debounceRef.current = setTimeout(onStageChanged, 2000);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [jobs.length, onStageChanged, isTabVisible]);
}
