import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Dot
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  RefreshCw,
  Award,
  Minus
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface MonthlyStat {
  id: string;
  year: number;
  month: number;
  total_sales: number;
  sales_order_count: number;
  proposals_sent: number;
  proposals_approved: number;
}

interface ChartDataPoint {
  label: string;
  month: number;
  year: number;
  total_sales: number;
  average: number;
  aboveAverage: boolean;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: ChartDataPoint;
  value?: number;
}

function CustomDot({ cx, cy, payload }: CustomDotProps) {
  if (cx == null || cy == null || !payload) return null;
  const color = payload.aboveAverage ? '#10b981' : '#ef4444';
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={color}
      stroke="#1f2937"
      strokeWidth={2}
    />
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint; value: number; name: string }>;
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload as ChartDataPoint;
  const diff = data.total_sales - data.average;
  const pct = data.average > 0 ? Math.abs((diff / data.average) * 100) : 0;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 min-w-[180px]">
      <div className="text-sm font-semibold text-white mb-2">{data.label}</div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 text-xs">Sales</span>
          <span className="text-white font-bold text-sm">{formatCurrency(data.total_sales)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 text-xs">Average</span>
          <span className="text-amber-400 text-sm">{formatCurrency(data.average)}</span>
        </div>
        <div className="border-t border-gray-700 pt-1.5 mt-1.5">
          {diff === 0 ? (
            <div className="flex items-center gap-1 text-gray-400 text-xs">
              <Minus className="w-3 h-3" /> At average
            </div>
          ) : diff > 0 ? (
            <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
              <TrendingUp className="w-3 h-3" />
              +{formatCurrency(diff)} ({pct.toFixed(1)}% above avg)
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-400 text-xs font-medium">
              <TrendingDown className="w-3 h-3" />
              {formatCurrency(diff)} ({pct.toFixed(1)}% below avg)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MonthlySalesStatsProps {
  compact?: boolean;
}

export function MonthlySalesStats({ compact = false }: MonthlySalesStatsProps) {
  const { profile } = useAuth();
  const [stats, setStats] = useState<MonthlyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2].filter(y => y >= 2020);
  }, []);

  const loadStats = useCallback(async (showRefresh = false) => {
    if (!profile?.id || !profile?.organization_id) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      if (showRefresh) {
        await supabase.rpc('refresh_sales_monthly_stats', {
          p_user_id: profile.id,
          p_org_id: profile.organization_id
        });
      }

      const { data } = await supabase
        .from('sales_monthly_stats')
        .select('*')
        .eq('user_id', profile.id)
        .eq('organization_id', profile.organization_id)
        .order('year', { ascending: true })
        .order('month', { ascending: true });

      setStats(data || []);
    } catch (err) {
      console.error('Error loading monthly stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, profile?.organization_id]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const chartData = useMemo((): ChartDataPoint[] => {
    const yearStats = stats.filter(s => s.year === selectedYear);

    const allMonthsWithData = stats
      .filter(s => s.total_sales > 0)
      .map(s => s.total_sales);
    const overallAvg = allMonthsWithData.length > 0
      ? allMonthsWithData.reduce((a, b) => a + b, 0) / allMonthsWithData.length
      : 0;

    const byMonth = new Map(yearStats.map(s => [s.month, s]));

    const now = new Date();
    const maxMonth = selectedYear < now.getFullYear() ? 12 : now.getMonth() + 1;

    return Array.from({ length: maxMonth }, (_, i) => {
      const mo = i + 1;
      const stat = byMonth.get(mo);
      const value = stat?.total_sales ?? 0;
      return {
        label: `${MONTH_NAMES[i]} ${selectedYear}`,
        month: mo,
        year: selectedYear,
        total_sales: value,
        average: Math.round(overallAvg),
        aboveAverage: value >= overallAvg
      };
    });
  }, [stats, selectedYear]);

  const summaryStats = useMemo(() => {
    const values = chartData.map(d => d.total_sales).filter(v => v > 0);
    if (!values.length) return null;
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;
    const best = Math.max(...values);
    const worst = Math.min(...values);
    const bestMonth = chartData.find(d => d.total_sales === best);
    const worstMonth = chartData.find(d => d.total_sales === worst);
    return { total, avg, best, worst, bestMonth, worstMonth };
  }, [chartData]);

  const gradientId = 'salesGradient';

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gray-700 rounded-lg animate-pulse" />
          <div className="h-5 w-48 bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="h-64 bg-gray-700/40 rounded-lg animate-pulse" />
      </div>
    );
  }

  const hasData = chartData.some(d => d.total_sales > 0);
  const avgValue = summaryStats?.avg ?? 0;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Monthly Sales Progress</h3>
            <p className="text-xs text-gray-400">Your sales trend with period average</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  selectedYear === y
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          <button
            onClick={() => loadStats(true)}
            disabled={refreshing}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {summaryStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-700">
          <div className="bg-gray-800 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <DollarSign className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Total {selectedYear}</span>
            </div>
            <div className="text-lg font-bold text-white tabular-nums">{formatCurrency(summaryStats.total)}</div>
          </div>
          <div className="bg-gray-800 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Monthly Avg</span>
            </div>
            <div className="text-lg font-bold text-amber-400 tabular-nums">{formatCurrency(summaryStats.avg)}</div>
          </div>
          <div className="bg-gray-800 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Best Month</span>
            </div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums">{formatCurrency(summaryStats.best)}</div>
            {summaryStats.bestMonth && (
              <div className="text-xs text-gray-500">{MONTH_NAMES[summaryStats.bestMonth.month - 1]}</div>
            )}
          </div>
          <div className="bg-gray-800 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TrendingDown className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Lowest Month</span>
            </div>
            <div className="text-lg font-bold text-red-400 tabular-nums">{formatCurrency(summaryStats.worst)}</div>
            {summaryStats.worstMonth && (
              <div className="text-xs text-gray-500">{MONTH_NAMES[summaryStats.worstMonth.month - 1]}</div>
            )}
          </div>
        </div>
      )}

      <div className="p-5">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-56 text-center">
            <BarChart3 className="w-10 h-10 text-gray-600 mb-3" />
            <p className="text-gray-400 text-sm font-medium">No sales data for {selectedYear}</p>
            <p className="text-gray-600 text-xs mt-1">Sales orders will appear here once created</p>
          </div>
        ) : (
          <>
            <div className={compact ? 'h-52' : 'h-72'}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickFormatter={(val: string) => val.split(' ')[0]}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={{ stroke: '#374151' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatCurrency(v)}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                  />
                  <Tooltip content={<CustomTooltip />} />

                  <Area
                    type="monotone"
                    dataKey="total_sales"
                    fill={`url(#${gradientId})`}
                    stroke="none"
                    isAnimationActive
                    animationDuration={800}
                  />

                  <ReferenceLine
                    y={avgValue}
                    stroke="#f59e0b"
                    strokeDasharray="6 3"
                    strokeWidth={2}
                    label={{
                      value: `Avg ${formatCurrency(avgValue)}`,
                      fill: '#f59e0b',
                      fontSize: 10,
                      fontWeight: 600,
                      position: 'insideTopRight',
                      dx: -4,
                      dy: -6
                    }}
                  />

                  <Line
                    type="monotone"
                    dataKey="total_sales"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={<CustomDot />}
                    activeDot={{ r: 7, fill: '#3b82f6', stroke: '#1f2937', strokeWidth: 2 }}
                    isAnimationActive
                    animationDuration={800}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-5 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-0.5 bg-blue-500" />
                <span className="text-xs text-gray-400">Monthly Sales</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-0 border-t-2 border-dashed border-amber-400" />
                <span className="text-xs text-gray-400">Period Average</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-gray-900" />
                <span className="text-xs text-gray-400">Above avg</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-gray-900" />
                <span className="text-xs text-gray-400">Below avg</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
