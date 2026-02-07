import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTabVisibility } from "@/hooks/useTabVisibility";

// Cache for job specifications to avoid repeated RPC calls
const specsCache = new Map<string, { data: any; timestamp: number }>();
const SPECS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to fetch job specifications with caching
const fetchJobSpecifications = async (jobId: string) => {
  // Check cache first
  const cached = specsCache.get(jobId);
  if (cached && Date.now() - cached.timestamp < SPECS_CACHE_TTL) {
    return cached.data;
  }

  try {
    // Fetch print specifications
    const { data: printSpecs } = await supabase.rpc('get_job_specifications', {
      p_job_id: jobId,
      p_job_table_name: 'production_jobs'
    });

    // Fetch HP12000 paper size info
    const { data: hp12000Data } = await supabase.rpc('get_job_hp12000_stages', {
      p_job_id: jobId
    });

    // Parse print specifications
    const printingSpecs = printSpecs?.find(spec => spec.category === 'printing');
    const paperSpecs = printSpecs?.filter(spec => ['paper_type', 'paper_weight'].includes(spec.category));
    
    // Build print specs string
    let printSpecsString = '';
    if (printingSpecs?.properties) {
      const props = printingSpecs.properties as any;
      if (props.colours && props.sides) {
        printSpecsString = `${props.colours} (${props.sides})`;
      } else if (props.colours) {
        printSpecsString = props.colours;
      }
    }

    // Build paper specs string
    let paperSpecsString = '';
    if (paperSpecs?.length > 0) {
      const paperType = paperSpecs.find(s => s.category === 'paper_type')?.display_name;
      const paperWeight = paperSpecs.find(s => s.category === 'paper_weight')?.display_name;
      if (paperWeight && paperType) {
        paperSpecsString = `${paperWeight} ${paperType}`;
      } else if (paperWeight) {
        paperSpecsString = paperWeight;
      } else if (paperType) {
        paperSpecsString = paperType;
      }
    }

    // Get sheet size from HP12000 data
    let sheetSize = '';
    if (hp12000Data?.length > 0) {
      const paperSize = hp12000Data[0]?.paper_size_name;
      if (paperSize) {
        if (paperSize.includes('B1') || paperSize.includes('Large')) {
          sheetSize = 'Large Sheet';
        } else if (paperSize.includes('B2') || paperSize.includes('Small')) {
          sheetSize = 'Small Sheet';
        } else {
          sheetSize = paperSize;
        }
      }
    }

    const result = {
      print_specs: printSpecsString,
      paper_specs: paperSpecsString,
      sheet_size: sheetSize
    };

    // Cache the result
    specsCache.set(jobId, { data: result, timestamp: Date.now() });
    
    return result;
  } catch (error) {
    console.error('Error fetching job specifications:', error);
    return {
      print_specs: undefined,
      paper_specs: undefined,
      sheet_size: undefined
    };
  }
};

export interface PersonalQueueJob {
  job_id: string;
  job_stage_instance_id: string;
  wo_no: string;
  customer?: string;
  current_stage_name: string;
  current_stage_status: 'pending' | 'active' | 'completed';
  scheduled_start_at?: string;
  estimated_duration_minutes?: number;
  due_date?: string;
  priority_score: number;
  queue_position: number;
  workflow_progress: number;
  reference?: string;
  category_name?: string;
  category_color?: string;
  is_rush: boolean;
  // Print operator specifications
  print_specs?: string;
  paper_specs?: string;
  sheet_size?: string;
  // Additional fields for compatibility with TouchOptimizedJobCard
  completed_stages?: number;
  total_stages?: number;
  user_can_work?: boolean;
  current_stage_id?: string;
}

// Optimized column selection to reduce payload
const NEXT_JOBS_SELECT = `
  id,
  job_id,
  status,
  scheduled_start_at,
  estimated_duration_minutes,
  production_jobs!inner(wo_no, customer, due_date, reference),
  production_stages!inner(name),
  categories(name, color)
`;

const ACTIVE_JOBS_SELECT = `
  id,
  job_id,
  status,
  started_at,
  estimated_duration_minutes,
  production_jobs!inner(wo_no, customer, due_date, reference),
  production_stages!inner(name),
  categories(name, color)
`;

export const usePersonalOperatorQueue = (operatorId?: string) => {
  const { user } = useAuth();
  const { isVisible } = useTabVisibility();
  const queryClient = useQueryClient();
  const effectiveOperatorId = operatorId || user?.id;
  const subscriptionRef = useRef<any>(null);

  // OPTIMIZED: 120s polling for next jobs (was 30s)
  const { data: myNextJobs = [], isLoading: isLoadingNext, refetch: refetchNext } = useQuery({
    queryKey: ['personal-next-jobs', effectiveOperatorId],
    queryFn: async () => {
      if (!effectiveOperatorId) return [];

      const { data, error } = await supabase
        .from('job_stage_instances')
        .select(NEXT_JOBS_SELECT)
        .eq('status', 'pending')
        .eq('started_by', effectiveOperatorId)
        .not('scheduled_start_at', 'is', null)
        .order('scheduled_start_at', { ascending: true })
        .limit(3);

      if (error) throw error;

      // Fetch specifications for each job (with caching)
      const jobsWithSpecs = await Promise.all(
        data.map(async (item, index) => {
          const specs = await fetchJobSpecifications(item.job_id);
          
          return {
            job_id: item.job_id,
            job_stage_instance_id: item.id,
            wo_no: item.production_jobs.wo_no,
            customer: item.production_jobs.customer,
            current_stage_name: item.production_stages.name,
            current_stage_status: item.status as 'pending',
            scheduled_start_at: item.scheduled_start_at,
            estimated_duration_minutes: item.estimated_duration_minutes,
            due_date: item.production_jobs.due_date,
            priority_score: 0,
            queue_position: index + 1,
            workflow_progress: 0,
            reference: item.production_jobs.reference,
            category_name: item.categories?.name || 'No Category',
            category_color: item.categories?.color || '#6B7280',
            is_rush: false,
            print_specs: specs.print_specs,
            paper_specs: specs.paper_specs,
            sheet_size: specs.sheet_size,
            completed_stages: 0,
            total_stages: 1,
            user_can_work: true,
            current_stage_id: item.id,
          } as PersonalQueueJob;
        })
      );

      return jobsWithSpecs;
    },
    enabled: !!effectiveOperatorId,
    // OPTIMIZED: Pause polling when tab hidden, 120s when visible (was 30s)
    refetchInterval: isVisible ? 120000 : false,
    staleTime: 60000, // Consider data fresh for 1 minute
  });

  // OPTIMIZED: 60s polling for active jobs (was 10s)
  const { data: activeJobs = [], isLoading: isLoadingActive, refetch: refetchActive } = useQuery({
    queryKey: ['personal-active-jobs', effectiveOperatorId],
    queryFn: async () => {
      if (!effectiveOperatorId) return [];

      const { data, error } = await supabase
        .from('job_stage_instances')
        .select(ACTIVE_JOBS_SELECT)
        .eq('status', 'active')
        .eq('started_by', effectiveOperatorId)
        .order('started_at', { ascending: true });

      if (error) throw error;

      // Fetch specifications for each active job (with caching)
      const jobsWithSpecs = await Promise.all(
        data.map(async (item) => {
          const specs = await fetchJobSpecifications(item.job_id);
          
          return {
            job_id: item.job_id,
            job_stage_instance_id: item.id,
            wo_no: item.production_jobs.wo_no,
            customer: item.production_jobs.customer,
            current_stage_name: item.production_stages.name,
            current_stage_status: 'active',
            scheduled_start_at: item.started_at,
            estimated_duration_minutes: item.estimated_duration_minutes,
            due_date: item.production_jobs.due_date,
            priority_score: 1000,
            queue_position: 0,
            workflow_progress: 50,
            reference: item.production_jobs.reference,
            category_name: item.categories?.name || 'No Category',
            category_color: item.categories?.color || '#6B7280',
            is_rush: false,
            print_specs: specs.print_specs,
            paper_specs: specs.paper_specs,
            sheet_size: specs.sheet_size,
            completed_stages: 0,
            total_stages: 1,
            user_can_work: true,
            current_stage_id: item.id,
          } as PersonalQueueJob;
        })
      );

      return jobsWithSpecs;
    },
    enabled: !!effectiveOperatorId,
    // OPTIMIZED: Pause polling when tab hidden, 60s when visible (was 10s)
    refetchInterval: isVisible ? 60000 : false,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  // OPTIMIZED: Only subscribe when tab is visible
  useEffect(() => {
    if (!effectiveOperatorId || !isVisible) {
      // Cleanup existing subscription when tab hidden
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      return;
    }

    // Don't create duplicate subscriptions
    if (subscriptionRef.current) return;

    const channel = supabase
      .channel('personal-queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_stage_instances',
          filter: `started_by=eq.${effectiveOperatorId}`,
        },
        () => {
          // Debounce by using query invalidation
          queryClient.invalidateQueries({ queryKey: ['personal-next-jobs', effectiveOperatorId] });
          queryClient.invalidateQueries({ queryKey: ['personal-active-jobs', effectiveOperatorId] });
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [effectiveOperatorId, isVisible, queryClient]);

  const refetch = () => {
    refetchNext();
    refetchActive();
  };

  return {
    myNextJobs,
    activeJobs,
    allPersonalJobs: [...activeJobs, ...myNextJobs],
    isLoading: isLoadingNext || isLoadingActive,
    refetch,
  };
};
