import { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TechProfile {
  id: string;
  full_name: string;
  employment_type: string;
}

interface ChartRow {
  label: string;
  date: string;
  [techId: string]: number | string;
}

interface TooltipPayloadEntry {
  color: string;
  name: string;
  value: number;
}

interface EfficiencyTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  nameResolver: (uid: string) => string;
}

const TECH_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

function getEfficiencyBarColor(efficiency: number): string {
  if (efficiency >= 90) return '#22c55e';
  if (efficiency >= 75) return '#3b82f6';
  if (efficiency >= 60) return '#eab308';
  return '#ef4444';
}

function EfficiencyTooltip({ active, payload, label, nameResolver }: EfficiencyTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const sorted = [...payload]
    .filter(e => e.value > 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  if (!sorted.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 min-w-[190px]">
      <div className="text-sm font-semibold text-white mb-2">{label}</div>
      <div className="space-y-1.5">
        {sorted.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-300 text-xs truncate max-w-[120px]">{nameResolver(entry.name)}</span>
            </div>
            <span className="text-white font-semibold text-xs tabular-nums">
              {entry.value.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildDateSlots(startDate: string, endDate: string): { label: string; date: string }[] {
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (diffDays <= 31) {
    const slots: { label: string; date: string }[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      slots.push({
        label: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        date: cur.toISOString().split('T')[0],
      });
      cur.setDate(cur.getDate() + 1);
    }
    return slots;
  }

  if (diffDays <= 120) {
    const slots: { label: string; date: string }[] = [];
    const cur = new Date(start);
    cur.setDate(cur.getDate() - cur.getDay() + 1);
    while (cur <= end) {
      const weekStart = cur.toISOString().split('T')[0];
      slots.push({
        label: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        date: weekStart,
      });
      cur.setDate(cur.getDate() + 7);
    }
    return slots;
  }

  const slots: { label: string; date: string }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    slots.push({
      label: cur.toLocaleDateString('en-US', { month: 'short', year: diffDays > 400 ? '2-digit' : undefined }),
      date: cur.toISOString().split('T')[0],
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return slots;
}

function slotKey(date: string, startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const d = new Date(date + 'T12:00:00');

  if (diffDays <= 31) return date;
  if (diffDays <= 120) {
    const mon = new Date(d);
    mon.setDate(d.getDate() - d.getDay() + 1);
    return mon.toISOString().split('T')[0];
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

interface Props {
  startDate: string;
  endDate: string;
  selectedTech: string;
  technicians: TechProfile[];
}

export function TechEfficiencyChart({ startDate, endDate, selectedTech, technicians }: Props) {
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTechIds, setSelectedTechIds] = useState<Set<string>>(new Set());

  const activeTechs = useMemo(() => {
    if (selectedTech === 'all') return technicians;
    return technicians.filter(t => t.id === selectedTech);
  }, [selectedTech, technicians]);

  useEffect(() => {
    setSelectedTechIds(new Set());
  }, [selectedTech]);

  useEffect(() => {
    if (activeTechs.length === 0) {
      setChartData([]);
      setLoading(false);
      return;
    }
    loadChartData();
  }, [startDate, endDate, activeTechs]);

  function calculateExpectedHours(s: string, e: string): number {
    let count = 0;
    const cur = new Date(s + 'T12:00:00');
    const fin = new Date(e + 'T12:00:00');
    while (cur <= fin) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count * 8;
  }

  async function loadChartData() {
    try {
      setLoading(true);
      const slots = buildDateSlots(startDate, endDate);
      const diffDays = Math.round(
        (new Date(endDate + 'T12:00:00').getTime() - new Date(startDate + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
      const isMonthly = diffDays > 120;
      const isWeekly = diffDays > 31 && diffDays <= 120;

      const rows: ChartRow[] = slots.map(s => {
        const row: ChartRow = { label: s.label, date: s.date };
        activeTechs.forEach(t => { row[t.id] = 0; });
        return row;
      });

      const slotMap = new Map(slots.map(s => [s.date, s.date]));

      await Promise.all(activeTechs.map(async tech => {
        const isSalaryNoClock = tech.employment_type === 'salary_no_clock';

        const [clockResult, jobResult] = await Promise.all([
          isSalaryNoClock
            ? Promise.resolve({ data: [], error: null })
            : supabase
                .from('daily_clock_entries')
                .select('entry_date, total_hours')
                .eq('technician_id', tech.id)
                .gte('entry_date', startDate)
                .lte('entry_date', endDate)
                .or('status.eq.clocked_out,payroll_hours_only.eq.true'),
          supabase
            .from('time_entries')
            .select('entry_date, total_hours')
            .eq('technician_id', tech.id)
            .gte('entry_date', startDate)
            .lte('entry_date', endDate)
            .not('clock_out', 'is', null),
        ]);

        const clockData = (clockResult.data || []) as { entry_date: string; total_hours: string }[];
        const jobData = (jobResult.data || []) as { entry_date: string; total_hours: string }[];

        const clockByDate = new Map<string, number>();
        clockData.forEach(e => {
          const k = slotKey(e.entry_date, startDate, endDate);
          clockByDate.set(k, (clockByDate.get(k) || 0) + (parseFloat(e.total_hours) || 0));
        });

        const jobByDate = new Map<string, number>();
        jobData.forEach(e => {
          const k = slotKey(e.entry_date, startDate, endDate);
          jobByDate.set(k, (jobByDate.get(k) || 0) + (parseFloat(e.total_hours) || 0));
        });

        rows.forEach((row, idx) => {
          const key = slots[idx].date;
          const clockHrs = clockByDate.get(key) || 0;
          const jobHrs = jobByDate.get(key) || 0;

          let efficiency = 0;
          if (isSalaryNoClock || tech.employment_type === 'salary') {
            let expectedHrs = 0;
            if (isMonthly) {
              const d = new Date(key + 'T12:00:00');
              const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
              const rangeEnd = new Date(endDate + 'T12:00:00');
              expectedHrs = calculateExpectedHours(key, mEnd <= rangeEnd ? mEnd.toISOString().split('T')[0] : endDate);
            } else if (isWeekly) {
              const d = new Date(key + 'T12:00:00');
              const wEnd = new Date(d);
              wEnd.setDate(d.getDate() + 6);
              const rangeEnd = new Date(endDate + 'T12:00:00');
              expectedHrs = calculateExpectedHours(key, wEnd <= rangeEnd ? wEnd.toISOString().split('T')[0] : endDate);
            } else {
              expectedHrs = 8;
            }
            efficiency = expectedHrs > 0 ? (jobHrs / expectedHrs) * 100 : 0;
          } else {
            efficiency = clockHrs > 0 ? (jobHrs / clockHrs) * 100 : 0;
          }

          row[tech.id] = Math.min(Math.round(efficiency * 10) / 10, 200);
        });
      }));

      const filtered = rows.filter(row =>
        activeTechs.some(t => (row[t.id] as number) > 0)
      );

      setChartData(filtered.length > 0 ? filtered : rows);
    } catch (err) {
      console.error('Error loading efficiency chart data:', err);
    } finally {
      setLoading(false);
    }
  }

  const { techIds, leaderboard, grandAvg } = useMemo(() => {
    const totals: Record<string, { sum: number; count: number }> = {};
    activeTechs.forEach(t => { totals[t.id] = { sum: 0, count: 0 }; });
    chartData.forEach(row => {
      activeTechs.forEach(t => {
        const v = row[t.id] as number;
        if (v > 0) {
          totals[t.id].sum += v;
          totals[t.id].count += 1;
        }
      });
    });

    const avgs: Record<string, number> = {};
    activeTechs.forEach(t => {
      avgs[t.id] = totals[t.id].count > 0 ? totals[t.id].sum / totals[t.id].count : 0;
    });

    const sorted = [...activeTechs.map(t => t.id)].sort((a, b) => (avgs[b] || 0) - (avgs[a] || 0));

    const allVals = sorted.map(id => avgs[id]).filter(v => v > 0);
    const avg = allVals.length > 0 ? allVals.reduce((a, b) => a + b, 0) / allVals.length : 0;

    return {
      techIds: sorted,
      leaderboard: sorted.map(id => ({ id, avg: avgs[id] || 0 })),
      grandAvg: avg,
    };
  }, [chartData, activeTechs]);

  const visibleIds = useMemo(() => {
    if (selectedTechIds.size === 0) return techIds;
    return techIds.filter(id => selectedTechIds.has(id));
  }, [techIds, selectedTechIds]);

  const visibleLeaderboard = useMemo(() => {
    if (selectedTechIds.size === 0) return leaderboard;
    return leaderboard.filter(({ id }) => selectedTechIds.has(id));
  }, [leaderboard, selectedTechIds]);

  function nameFor(id: string): string {
    return activeTechs.find(t => t.id === id)?.full_name || 'Unknown';
  }

  function firstNameFor(id: string): string {
    const name = nameFor(id);
    return name.split(' ')[0];
  }

  function toggleTech(id: string) {
    setSelectedTechIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isFiltered = selectedTechIds.size > 0;
  const showPills = selectedTech === 'all' && techIds.length > 1;

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gray-700 rounded-lg animate-pulse" />
          <div className="h-5 w-56 bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="h-72 bg-gray-700/40 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Efficiency Over Time</h3>
            <p className="text-xs text-gray-400">
              {showPills
                ? isFiltered
                  ? `Showing ${selectedTechIds.size} of ${techIds.length} technician${techIds.length !== 1 ? 's' : ''}`
                  : `${techIds.length} technician${techIds.length !== 1 ? 's' : ''} — click names to filter`
                : nameFor(activeTechs[0]?.id || '')}
            </p>
          </div>
        </div>
      </div>

      {showPills && (
        <div className="px-5 py-3 border-b border-gray-700/60 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-500 mr-1">Filter:</span>
          <button
            onClick={() => setSelectedTechIds(new Set())}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
              !isFiltered
                ? 'bg-gray-600 border-gray-500 text-white'
                : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
            }`}
          >
            All
          </button>
          {techIds.map((id, i) => {
            const color = TECH_COLORS[i % TECH_COLORS.length];
            const selected = selectedTechIds.has(id);
            return (
              <button
                key={id}
                onClick={() => toggleTech(id)}
                title={nameFor(id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                  selected
                    ? 'text-white'
                    : 'bg-transparent text-gray-400 hover:text-gray-200'
                }`}
                style={
                  selected
                    ? { backgroundColor: color, borderColor: color }
                    : { borderColor: color + '55' }
                }
              >
                {firstNameFor(id)}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-5">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={46}
                domain={[0, 'auto']}
              />
              <Tooltip content={<EfficiencyTooltip nameResolver={nameFor} />} />
              {techIds.length > 1 && (
                <Legend
                  formatter={(value: string) => (
                    <span className="text-gray-300 text-xs">{firstNameFor(value)}</span>
                  )}
                  wrapperStyle={{ paddingTop: '12px' }}
                />
              )}
              {grandAvg > 0 && (
                <ReferenceLine
                  y={Math.round(grandAvg * 10) / 10}
                  stroke="#f59e0b"
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Avg ${grandAvg.toFixed(1)}%`,
                    fill: '#f59e0b',
                    fontSize: 10,
                    position: 'insideTopRight',
                    dx: -4,
                    dy: -6,
                  }}
                />
              )}
              {techIds.map((id, i) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  name={id}
                  stroke={TECH_COLORS[i % TECH_COLORS.length]}
                  strokeWidth={visibleIds.includes(id) ? 2 : 0}
                  dot={visibleIds.includes(id) ? { r: 3, fill: TECH_COLORS[i % TECH_COLORS.length], strokeWidth: 0 } : false}
                  activeDot={visibleIds.includes(id) ? { r: 6, strokeWidth: 2, stroke: '#1f2937' } : false}
                  connectNulls={false}
                  isAnimationActive
                  animationDuration={600}
                  legendType={visibleIds.includes(id) ? 'line' : 'none'}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {visibleLeaderboard.length > 0 && (
          <div className="mt-5 border-t border-gray-700 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">Average Efficiency Ranking</span>
            </div>
            <div className="space-y-2">
              {visibleLeaderboard.map(({ id, avg }, idx) => {
                const globalRank = leaderboard.findIndex(l => l.id === id);
                const color = TECH_COLORS[techIds.indexOf(id) % TECH_COLORS.length];
                const maxAvg = visibleLeaderboard[0]?.avg || 1;
                const barPct = maxAvg > 0 ? Math.round((avg / maxAvg) * 100) : 0;
                const barColor = getEfficiencyBarColor(avg);
                return (
                  <div key={id} className="flex items-center gap-3">
                    <div className="w-5 text-center">
                      {globalRank === 0
                        ? <span className="text-amber-400 text-sm font-bold">1</span>
                        : <span className="text-gray-500 text-xs font-medium">{globalRank + 1}</span>
                      }
                    </div>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm text-gray-200 truncate">{nameFor(id)}</span>
                        <span className="text-sm font-bold text-white tabular-nums">{avg.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${barPct}%`, backgroundColor: barColor }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
