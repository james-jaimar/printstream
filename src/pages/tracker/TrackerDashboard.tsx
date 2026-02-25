import React from "react";
import { Loader2 } from "lucide-react";
import { FactoryFloorDashboard } from "@/components/tracker/dashboard/factory/FactoryFloorDashboard";
import { useDashboardJobs } from "@/hooks/tracker/useDashboardJobs";
import { supabase } from "@/integrations/supabase/client";

const TrackerDashboard = () => {
  const {
    jobs,
    isLoading,
    error,
    refreshJobs,
    lastFetchTime
  } = useDashboardJobs();

  // Fetch completed this month count from DB using updated_at
  const [completedThisMonthCount, setCompletedThisMonthCount] = React.useState(0);
  React.useEffect(() => {
    const fetchCompletedThisMonth = async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count, error } = await supabase
        .from('production_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Completed')
        .gte('updated_at', startOfMonth);
      if (!error && count !== null) {
        setCompletedThisMonthCount(count);
      }
    };
    fetchCompletedThisMonth();
  }, [jobs]); // re-fetch when jobs refresh

  // Calculate comprehensive dashboard metrics
  const stats = React.useMemo(() => {
    if (!jobs || jobs.length === 0) {
      return {
        total: 0,
        inProgress: 0,
        completed: 0,
        pending: 0,
        dueToday: 0,
        dueTomorrow: 0,
        dueThisWeek: 0,
        overdue: 0,
        critical: 0,
        completedThisMonth: completedThisMonthCount,
        statusCounts: {},
        stages: []
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const weekFromNow = new Date(today);
    weekFromNow.setDate(today.getDate() + 7);

    // Calculate time-based metrics
    const dueToday = jobs.filter(job => {
      if (!job.due_date || !job.proof_approved_at) return false;
      const dueDate = new Date(job.due_date);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate.getTime() === today.getTime();
    }).length;

    const dueTomorrow = jobs.filter(job => {
      if (!job.due_date || !job.proof_approved_at || job.status === 'Completed') return false;
      const dueDate = new Date(job.due_date);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate.getTime() === tomorrow.getTime();
    }).length;

    const dueThisWeek = jobs.filter(job => {
      if (!job.due_date || !job.proof_approved_at || job.status === 'Completed') return false;
      const dueDate = new Date(job.due_date);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate > today && dueDate <= weekFromNow;
    }).length;

    const overdue = jobs.filter(job => {
      if (!job.due_date || !job.proof_approved_at || job.status === 'Completed') return false;
      const dueDate = new Date(job.due_date);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    }).length;

    const completedThisMonth = completedThisMonthCount;

    // Critical = overdue + due today + approved jobs with low progress and approaching due dates
    const critical = overdue + dueToday + jobs.filter(job => 
      job.proof_approved_at && job.workflow_progress && job.workflow_progress < 30 && job.due_date && 
      new Date(job.due_date) <= weekFromNow
    ).length;

    // In Progress = has proof approval AND not completed
    const inProgress = jobs.filter(job => 
      job.proof_approved_at && job.status !== 'Completed'
    ).length;

    const pending = jobs.filter(job => 
      job.current_stage_status === 'pending' || !job.current_stage_status
    ).length;

    // Completed = status is 'Completed'
    const completed = jobs.filter(job => 
      job.status === 'Completed'
    ).length;

    // Build status counts from actual job statuses
    const statusCounts: Record<string, number> = {};
    jobs.forEach(job => {
      const status = job.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Get unique stages with counts
    const stageMap = new Map();
    jobs.forEach(job => {
      if (job.current_stage_name && job.current_stage_status !== 'completed') {
        const stageName = job.display_stage_name || job.current_stage_name;
        const existing = stageMap.get(stageName) || { 
          name: stageName, 
          color: job.current_stage_color || '#6B7280', 
          count: 0 
        };
        existing.count += 1;
        stageMap.set(stageName, existing);
      }
    });

    const stages = Array.from(stageMap.values()).sort((a, b) => b.count - a.count);

    return {
      total: jobs.filter(job => job.status !== 'Completed').length,
      inProgress,
      completed,
      pending,
      dueToday,
      dueTomorrow,
      dueThisWeek,
      overdue,
      critical,
      completedThisMonth,
      statusCounts,
      stages
    };
  }, [jobs, completedThisMonthCount]);

  // Auto-refresh every 5 minutes for factory display
  React.useEffect(() => {
    const interval = setInterval(() => {
      refreshJobs();
    }, 300000);

    return () => clearInterval(interval);
  }, [refreshJobs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 min-h-screen bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-400" />
          <span className="text-2xl font-medium text-white">Loading factory display...</span>
          <p className="text-gray-300 mt-2">Initializing production monitoring...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 min-h-screen bg-gray-900">
        <div className="bg-red-900 border border-red-700 text-red-200 p-6 rounded-lg max-w-2xl mx-auto mt-20">
          <div className="text-center">
            <p className="font-semibold text-xl">Factory Display Error</p>
            <p className="mt-2 text-lg">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FactoryFloorDashboard 
      stats={stats} 
      onBack={() => {}} 
      refreshJobs={refreshJobs}
      lastFetchTime={lastFetchTime}
    />
  );
};

export default TrackerDashboard;