/**
 * Labels Reporting Dashboard
 * Production metrics, efficiency scores, and waste analysis
 */

import { useMemo } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp, Layers, Ruler, Clock, CheckCircle2, AlertTriangle, Package } from 'lucide-react';
import { useLabelOrders } from '@/hooks/labels/useLabelOrders';
import { useLabelRuns } from '@/hooks/labels/useLabelRuns';
import { useLabelStock } from '@/hooks/labels/useLabelStock';
import { LowStockAlert } from '@/components/labels/production';

const glassCard = 'rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur';

export default function LabelsReporting() {
  const { data: orders = [] } = useLabelOrders();
  const { data: runs = [] } = useLabelRuns();
  const { data: stock = [] } = useLabelStock(false);

  const metrics = useMemo(() => {
    const completedRuns = runs.filter(r => r.status === 'completed');
    const totalMetersPlanned = runs.reduce((sum, r) => sum + (r.meters_to_print || 0), 0);
    const totalMetersActual = completedRuns.reduce((sum, r) => sum + (r.actual_meters_printed || r.meters_to_print || 0), 0);
    const totalWaste = completedRuns.reduce((sum, r) => {
      if (r.actual_meters_printed && r.meters_to_print) return sum + Math.max(0, r.actual_meters_printed - r.meters_to_print);
      return sum;
    }, 0);
    const avgEfficiency = completedRuns.length > 0 ? completedRuns.reduce((sum, r) => sum + (r.ai_optimization_score || 0), 0) / completedRuns.length : 0;
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
    const wastePercentage = totalMetersPlanned > 0 ? (totalWaste / totalMetersPlanned) * 100 : 0;
    return { totalOrders: orders.length, completedOrders: ordersByStatus.completed, totalRuns: runs.length, completedRuns: completedRuns.length, totalMetersPlanned, totalMetersActual, totalWaste, wastePercentage, avgEfficiency, ordersByStatus, runsByStatus };
  }, [orders, runs]);

  const orderStatusData = useMemo(() => [
    { name: 'Quote', value: metrics.ordersByStatus.quote, color: '#94a3b8' },
    { name: 'Pending', value: metrics.ordersByStatus.pending_approval, color: '#fbbf24' },
    { name: 'Approved', value: metrics.ordersByStatus.approved, color: '#3b82f6' },
    { name: 'In Production', value: metrics.ordersByStatus.in_production, color: '#8b5cf6' },
    { name: 'Completed', value: metrics.ordersByStatus.completed, color: '#22c55e' },
  ].filter(d => d.value > 0), [metrics]);

  const dailyProduction = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      const dayRuns = runs.filter(r => { if (!r.completed_at) return false; const d = new Date(r.completed_at); return d >= dayStart && d <= dayEnd; });
      return { date: format(date, 'EEE'), runs: dayRuns.length, meters: dayRuns.reduce((sum, r) => sum + (r.actual_meters_printed || r.meters_to_print || 0), 0) };
    });
  }, [runs]);

  const stockData = useMemo(() =>
    stock.slice(0, 8).map(s => ({ name: s.name.slice(0, 20), current: s.current_stock_meters, reorder: s.reorder_level_meters, isLow: s.current_stock_meters <= s.reorder_level_meters }))
  , [stock]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Production Reports</h1>
        <p className="text-sm text-slate-500">Metrics, efficiency analysis, and production insights</p>
      </div>

      <LowStockAlert />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', icon: Package, value: metrics.totalOrders, sub: `${metrics.completedOrders} completed`, accent: '#6B7280' },
          { label: 'Production Runs', icon: Layers, value: metrics.totalRuns, sub: `${metrics.completedRuns} completed`, accent: '#3B82F6' },
          { label: 'Total Meters', icon: Ruler, value: `${metrics.totalMetersActual.toFixed(0)}m`, sub: `${metrics.totalMetersPlanned.toFixed(0)}m planned`, accent: '#10B981' },
          { label: 'Avg AI Score', icon: TrendingUp, value: `${metrics.avgEfficiency.toFixed(0)}%`, sub: null, accent: '#F59E0B', showProgress: true },
        ].map((kpi) => (
          <Card key={kpi.label} className={glassCard}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                <kpi.icon className="h-4 w-4" style={{ color: kpi.accent }} />
                {kpi.label}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: kpi.accent }}>{kpi.value}</div>
              {kpi.sub && <p className="text-xs text-slate-500">{kpi.sub}</p>}
              {kpi.showProgress && <Progress value={metrics.avgEfficiency} className="h-2 mt-2" />}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Waste Analysis */}
      <Card className={glassCard}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Waste Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div>
              <div className="text-3xl font-bold text-slate-900">{metrics.totalWaste.toFixed(1)}m</div>
              <p className="text-sm text-slate-500">Total waste meters</p>
            </div>
            <div>
              <div className={`text-3xl font-bold ${metrics.wastePercentage > 10 ? 'text-red-600' : metrics.wastePercentage > 5 ? 'text-amber-600' : 'text-green-600'}`}>
                {metrics.wastePercentage.toFixed(1)}%
              </div>
              <p className="text-sm text-slate-500">Waste percentage</p>
            </div>
            <div className="flex-1">
              <Progress value={Math.min(100, metrics.wastePercentage * 10)} className="h-4" />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0%</span><span className="text-green-600">5%</span><span className="text-amber-600">10%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className={glassCard}>
          <CardHeader><CardTitle className="text-slate-900">Daily Production (Last 7 Days)</CardTitle></CardHeader>
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

        <Card className={glassCard}>
          <CardHeader><CardTitle className="text-slate-900">Order Status Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={orderStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                    {orderStatusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock Levels */}
      <Card className={glassCard}>
        <CardHeader>
          <CardTitle className="text-slate-900">Substrate Stock Levels</CardTitle>
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
