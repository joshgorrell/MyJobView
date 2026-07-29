import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, LineChart, ComposedChart, ReferenceLine,
} from 'recharts';
import { computeChartTrend, computeRollingAverage } from '../../lib/salesDashboardCalculations';
import type { SalesDashboardResult } from '../../lib/salesDashboardTypes';

interface SalesTrendChartProps {
  data: SalesDashboardResult;
}

export function SalesTrendChart({ data }: SalesTrendChartProps) {
  const chartData = computeChartTrend(data.monthlyTrend);
  const rollingAvg = computeRollingAverage(data.monthlyTrend);
  const combined = chartData.map((p, i) => ({
    ...p,
    rollingAvg: rollingAvg[i] ?? 0,
  }));

  const monthlyQuota = data.quota.monthlyQuota;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-gray-700 mb-4">Monthly Sales Trend</h3>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={combined} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={{ stroke: '#e5e7eb' }} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`} />
          <Tooltip
            formatter={(v: number) => `$${v.toLocaleString()}`}
            contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Booked Sales" />
          <Line
            type="monotone"
            dataKey="rollingAvg"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="3-Month Avg"
          />
          {monthlyQuota > 0 && (
            <ReferenceLine
              y={monthlyQuota}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{ value: 'Monthly Goal', fontSize: 10, fill: '#ef4444', position: 'right' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
