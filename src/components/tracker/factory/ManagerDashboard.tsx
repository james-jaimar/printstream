
import React, { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  TrendingUp, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Settings,
  Activity,
  RefreshCw,
  Wifi,
  WifiOff,
  CreditCard
} from "lucide-react";
import { useAccessibleJobs } from "@/hooks/tracker/useAccessibleJobs";
import { calculateDashboardMetrics } from "@/hooks/tracker/useAccessibleJobs/dashboardUtils";
import { toast } from "sonner";

export const ManagerDashboard: React.FC = () => {
  const { 
    jobs, 
    isLoading, 
    error,
    refreshJobs,
    hasOptimisticUpdates,
    hasPendingUpdates,
    lastFetchTime
  } = useAccessibleJobs();
  
  const [refreshing, setRefreshing] = useState(false);

  // Calculate comprehensive dashboard metrics
  const metrics = useMemo(() => {
    try {
      const dashboardMetrics = calculateDashboardMetrics(jobs);
      
      // Calculate efficiency (mock calculation - would use real performance data)
      const efficiency = jobs.length > 0 
        ? Math.min(95, Math.max(70, 85 + (dashboardMetrics.averageProgress - 50) / 10))
        : 85;

      // Get recent completions
      const recentCompletions = jobs
        .filter(j => j.workflow_progress > 80)
        .sort((a, b) => (b.workflow_progress || 0) - (a.workflow_progress || 0))
        .slice(0, 5);

      // Get overdue jobs
      const overdueJobs = jobs.filter(j => {
        if (!j.due_date) return false;
        return new Date(j.due_date) < new Date();
      }).slice(0, 5);

      return {
        ...dashboardMetrics,
        efficiency: Math.round(efficiency),
        recentCompletions,
        overdueJobs
      };
    } catch (metricsError) {
      console.error("❌ Error calculating manager metrics:", metricsError);
      toast.error("Error calculating dashboard metrics");
      return {
        totalJobs: 0,
        pendingJobs: 0,
        activeJobs: 0,
        completedJobs: 0,
        urgentJobs: 0,
        dtpJobs: 0,
        proofJobs: 0,
        averageProgress: 0,
        efficiency: 85,
        recentCompletions: [],
        overdueJobs: []
      };
    }
  }, [jobs]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshJobs();
      toast.success("Dashboard refreshed successfully");
    } catch (error) {
      console.error('❌ Refresh failed:', error);
      toast.error("Failed to refresh dashboard");
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  }, [refreshJobs]);

  // Calculate connection status
  const isConnected = lastFetchTime > 0 && (Date.now() - lastFetchTime) < 60000; // 1 minute

  // Enhanced loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-8 bg-gray-200 rounded w-64"></div>
              <div className="h-4 bg-gray-200 rounded w-48"></div>
            </div>
            <div className="h-8 w-8 bg-gray-200 rounded"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Enhanced error handling
  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-red-700">Dashboard Error</h2>
            <p className="text-red-600 text-center mb-4">{error}</p>
            <div className="flex gap-2">
              <Button onClick={handleRefresh} variant="outline">
                Retry
              </Button>
              <Button onClick={() => window.location.reload()} variant="outline">
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Manager Dashboard</h2>
          <p className="text-gray-600">Production overview and team performance</p>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm text-gray-500">
                {isConnected ? 'Live Data' : 'Offline'}
              </span>
            </div>
            {lastFetchTime > 0 && (
              <span className="text-sm text-gray-500">
                Last updated: {new Date(lastFetchTime).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(hasOptimisticUpdates || hasPendingUpdates()) && (
            <Badge variant="outline" className="text-sm">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Syncing
            </Badge>
          )}
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Jobs</p>
                <p className="text-3xl font-bold text-blue-900">{metrics.totalJobs}</p>
                <p className="text-xs text-blue-700 mt-1">
                  {metrics.activeJobs} active, {metrics.pendingJobs} pending
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Active Jobs</p>
                <p className="text-3xl font-bold text-green-900">{metrics.activeJobs}</p>
                <p className="text-xs text-green-700 mt-1">
                  Currently in progress
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Urgent Jobs</p>
                <p className="text-3xl font-bold text-orange-900">{metrics.urgentJobs}</p>
                <p className="text-xs text-orange-700 mt-1">
                  Need immediate attention
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Efficiency</p>
                <p className="text-3xl font-bold text-purple-900">{metrics.efficiency}%</p>
                <p className="text-xs text-purple-700 mt-1">
                  Overall performance
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Production Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                <span className="text-sm font-bold text-gray-900">{metrics.averageProgress}%</span>
              </div>
              <Progress value={metrics.averageProgress} className="h-3" />
            </div>
            
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{metrics.pendingJobs}</div>
                <div className="text-sm text-gray-600">Pending</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-900">{metrics.activeJobs}</div>
                <div className="text-sm text-blue-600">In Progress</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-900">{metrics.completedJobs}</div>
                <div className="text-sm text-green-600">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mock team data - would come from actual user activity */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    A
                  </div>
                  <span className="font-medium">Alex Smith</span>
                </div>
                <Badge className="bg-green-600">{Math.min(3, metrics.activeJobs)} Active</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    M
                  </div>
                  <span className="font-medium">Maria Garcia</span>
                </div>
                <Badge className="bg-blue-600">{Math.min(2, Math.max(0, metrics.activeJobs - 1))} Active</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    J
                  </div>
                  <span className="font-medium">John Doe</span>
                </div>
                <Badge variant="outline">Available</Badge>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">Team Efficiency</div>
              <div className="text-2xl font-bold text-gray-900">{metrics.efficiency}%</div>
              <Progress value={metrics.efficiency} className="h-2 mt-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Recent Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.recentCompletions.length > 0 ? (
                metrics.recentCompletions.map((job) => (
                  <div key={job.job_id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{job.wo_no}</span>
                        {job.payment_status === 'awaiting_payment' && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0">
                            <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                            AWAITING PAYMENT
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">{job.customer || 'Unknown Customer'}</div>
                    </div>
                    <Badge className="bg-green-600">{Math.round(job.workflow_progress)}%</Badge>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-4">
                  No recent high-progress jobs
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Attention Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.overdueJobs.length > 0 ? (
                metrics.overdueJobs.map((job) => (
                  <div key={job.job_id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{job.wo_no}</span>
                        {job.payment_status === 'awaiting_payment' && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0">
                            <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                            AWAITING PAYMENT
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-red-600">
                        Overdue: {job.due_date ? new Date(job.due_date).toLocaleDateString() : 'No date'}
                      </div>
                    </div>
                    <Badge variant="destructive">Overdue</Badge>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-4">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  No overdue jobs - Great work!
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
