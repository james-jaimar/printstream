/**
 * Labels Reporting Dashboard
 * Production metrics, efficiency scores, and waste analysis
 */

import { useMemo } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Layers,
  Ruler,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Package,
} from 'lucide-react';
import { useLabelOrders } from '@/hooks/labels/useLabelOrders';
import { useLabelRuns } from '@/hooks/labels/useLabelRuns';
import { useLabelStock } from '@/hooks/labels/useLabelStock';
import { LowStockAlert } from '@/components/labels/production';

export default function LabelsReporting() {
  const { data: orders = [] } = useLabelOrders();
  const { data: runs = [] } = useLabelRuns();
  const { data: stock = [] } = useLabelStock(false);

  // Calculate metrics
  const metrics = useMemo(() => {
    const completedRuns = runs.filter(r => r.status === 'completed');
    const totalMetersPlanned = runs.reduce((sum, r) => sum + (r.meters_to_print || 0), 0);
    const totalMetersActual = completedRuns.reduce((sum, r) => sum + (r.actual_meters_printed || r.meters_to_print || 0), 0);
    const totalWaste = completedRuns.reduce((sum, r) => {
      if (r.actual_meters_printed && r.meters_to_print) {
        return sum + Math.max(0, r.actual_meters_printed - r.meters_to_print);
      }
      return sum;
    }, 0);

    const avgEfficiency = completedRuns.length > 0
      ? completedRuns.reduce((sum, r) => sum + (r.ai_optimization_score || 0), 0) / completedRuns.length
      : 0;

    const ordersByStatus = {
      quote: orders.filter(o => o.status === 'quote').length,
      pending_approval: orders.filter(o => o.status === 'pending_approval').length,
      approved: orders.filter(o => o.status === 'approved').length,
      in_production: orders.filter(o => o.status === 'in_production').length,
      completed: orders.filter(o => o.status === 'completed').length,
    };

    const runsByStatus = {
      planned: runs.filter(r => r.status === 'planned').length,
      approved: runs.filter(r => r.status === 'approved').length,
      printing: runs.filter(r => r.status === 'printing').length,
      completed: runs.filter(r => r.status === 'completed').length,
    };

    const wastePercentage = totalMetersPlanned > 0
      ? (totalWaste / totalMetersPlanned) * 100
      : 0;

    return {
      totalOrders: orders.length,
      completedOrders: ordersByStatus.completed,
      totalRuns: runs.length,
      completedRuns: completedRuns.length,
      totalMetersPlanned,
      totalMetersActual,
      totalWaste,
      wastePercentage,
      avgEfficiency,
      ordersByStatus,
      runsByStatus,
    };
  }, [orders, runs]);

  // Status distribution for pie chart
  const orderStatusData = useMemo(() => [
    { name: 'Quote', value: metrics.ordersByStatus.quote, color: '#94a3b8' },
    { name: 'Pending', value: metrics.ordersByStatus.pending_approval, color: '#fbbf24' },
    { name: 'Approved', value: metrics.ordersByStatus.approved, color: '#3b82f6' },
    { name: 'In Production', value: metrics.ordersByStatus.in_production, color: '#8b5cf6' },
    { name: 'Completed', value: metrics.ordersByStatus.completed, color: '#22c55e' },
  ].filter(d => d.value > 0), [metrics]);

  const runStatusData = useMemo(() => [
    { name: 'Planned', value: metrics.runsByStatus.planned, color: '#94a3b8' },
    { name: 'Approved', value: metrics.runsByStatus.approved, color: '#3b82f6' },
    { name: 'Printing', value: metrics.runsByStatus.printing, color: '#fbbf24' },
    { name: 'Completed', value: metrics.runsByStatus.completed, color: '#22c55e' },
  ].filter(d => d.value > 0), [metrics]);

  // Production by day (last 7 days)
  const dailyProduction = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      
      const dayRuns = runs.filter(r => {
        if (!r.completed_at) return false;
        const completedDate = new Date(r.completed_at);
        return completedDate >= dayStart && completedDate <= dayEnd;
      });

      return {
        date: format(date, 'EEE'),
        runs: dayRuns.length,
        meters: dayRuns.reduce((sum, r) => sum + (r.actual_meters_printed || r.meters_to_print || 0), 0),
      };
    });
    return days;
  }, [runs]);

  // Stock levels
  const stockData = useMemo(() => 
    stock.slice(0, 8).map(s => ({
      name: s.name.slice(0, 20),
      current: s.current_stock_meters,
      reorder: s.reorder_level_meters,
      isLow: s.current_stock_meters <= s.reorder_level_meters,
    }))
  , [stock]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Production Reports</h1>
        <p className="text-muted-foreground">
          Metrics, efficiency analysis, and production insights
        </p>
      </div>

      {/* Low Stock Alert */}
      <LowStockAlert />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Total Orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalOrders}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.completedOrders} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Production Runs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalRuns}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.completedRuns} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Total Meters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalMetersActual.toFixed(0)}m</div>
            <p className="text-xs text-muted-foreground">
              {metrics.totalMetersPlanned.toFixed(0)}m planned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Avg AI Score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.avgEfficiency.toFixed(0)}%</div>
            <Progress value={metrics.avgEfficiency} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Waste Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Waste Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div>
              <div className="text-3xl font-bold">
                {metrics.totalWaste.toFixed(1)}m
              </div>
              <p className="text-sm text-muted-foreground">Total waste meters</p>
            </div>
            <div>
              <div className={`text-3xl font-bold ${
                metrics.wastePercentage > 10 ? 'text-red-600' :
                metrics.wastePercentage > 5 ? 'text-amber-600' : 'text-green-600'
              }`}>
                {metrics.wastePercentage.toFixed(1)}%
              </div>
              <p className="text-sm text-muted-foreground">Waste percentage</p>
            </div>
            <div className="flex-1">
              <Progress 
                value={Math.min(100, metrics.wastePercentage * 10)} 
                className="h-4"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0%</span>
                <span className="text-green-600">5%</span>
                <span className="text-amber-600">10%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Daily Production */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Production (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyProduction}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" orientation="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="runs" name="Runs" fill="#3b82f6" />
                  <Bar yAxisId="right" dataKey="meters" name="Meters" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Order Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Order Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={orderStatusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {orderStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock Levels */}
      <Card>
        <CardHeader>
          <CardTitle>Substrate Stock Levels</CardTitle>
          <CardDescription>Current stock vs reorder levels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip />
                <Legend />
                <Bar dataKey="current" name="Current Stock (m)" fill="#3b82f6" />
                <Bar dataKey="reorder" name="Reorder Level (m)" fill="#fbbf24" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
