import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart as PieChartIcon,
  Clock,
  Target,
  DollarSign,
  Activity
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { TestTunePermissions } from '../../lib/testTunePermissions';

interface BonusRecord {
  evaluation_date: string;
  bonus_tier: string;
  status: string;
  total_bonus_amount: number;
  tech_bonus_amount: number;
  pm_bonus_amount: number;
  lead_technician_id: string | null;
  project_manager_id: string | null;
  labor_savings_hours: number;
  total_field_hours: number;
  field_labor_target: number;
}

interface TestTuneAnalyticsProps {
  permissions: TestTunePermissions;
}

type ChartTab = 'monthly_savings' | 'tier_dist' | 'status_trend' | 'efficiency';

const TIER_COLORS: Record<string, string> = {
  'Tier 3': '#f59e0b',
  'Tier 2': '#3b82f6',
  'Tier 1': '#10b981',
  'On Target': '#06b6d4',
  'Over Target / No Bonus': '#ef4444',
  'Other': '#6b7280'
};

const STATUS_COLORS: Record<string, string> = {
  provisional: '#f59e0b',
  approved: '#10b981',
  paid: '#3b82f6',
  denied: '#ef4444'
};

export function TestTuneAnalytics({ permissions }: TestTuneAnalyticsProps) {
  const { profile } = useAuth();
  const [bonuses, setBonuses] = useState<BonusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<ChartTab>('monthly_savings');
  const [months, setMonths] = useState(6);

  useEffect(() => {
    loadAnalyticsData();
  }, [months]);

  async function loadAnalyticsData() {
    try {
      setLoading(true);
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      let query = supabase
        .from('test_tune_bonus_calculations')
        .select(`
          evaluation_date,
          bonus_tier,
          status,
          total_bonus_amount,
          tech_bonus_amount,
          pm_bonus_amount,
          lead_technician_id,
          project_manager_id,
          labor_savings_hours,
          total_field_hours,
          field_labor_target
        `)
        .gte('evaluation_date', cutoffStr)
        .order('evaluation_date', { ascending: true });

      if (!permissions.can_view_all_projects) {
        query = query.or(`lead_technician_id.eq.${profile?.id},project_manager_id.eq.${profile?.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setBonuses(data || []);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; savings: number; drag: number; bonuses: number; count: number }>();

    bonuses.forEach(b => {
      const d = new Date(b.evaluation_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      if (!map.has(key)) {
        map.set(key, { month: label, savings: 0, drag: 0, bonuses: 0, count: 0 });
      }
      const entry = map.get(key)!;
      const saved = b.labor_savings_hours || 0;
      if (saved > 0) {
        entry.savings += b.total_bonus_amount || 0;
      } else {
        entry.drag += Math.abs(saved) * 75;
      }
      if (b.status === 'paid' || b.status === 'approved') {
        entry.bonuses += b.total_bonus_amount || 0;
      }
      entry.count++;
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [bonuses]);

  const tierData = useMemo(() => {
    const map = new Map<string, { name: string; count: number; amount: number }>();

    bonuses.forEach(b => {
      let tier = 'Other';
      const t = b.bonus_tier || '';
      if (t.includes('Tier 3')) tier = 'Tier 3';
      else if (t.includes('Tier 2')) tier = 'Tier 2';
      else if (t.includes('Tier 1')) tier = 'Tier 1';
      else if (t.includes('On Target')) tier = 'On Target';
      else if (t.includes('Over') || t.includes('No Bonus')) tier = 'Over Target / No Bonus';

      if (!map.has(tier)) map.set(tier, { name: tier, count: 0, amount: 0 });
      const e = map.get(tier)!;
      e.count++;
      e.amount += b.total_bonus_amount || 0;
    });

    return Array.from(map.values()).filter(e => e.count > 0);
  }, [bonuses]);

  const efficiencyTrend = useMemo(() => {
    const map = new Map<string, { month: string; avgEff: number; onTrack: number; total: number }>();

    bonuses.forEach(b => {
      const d = new Date(b.evaluation_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      if (!map.has(key)) map.set(key, { month: label, avgEff: 0, onTrack: 0, total: 0 });
      const e = map.get(key)!;
      const pct = b.field_labor_target > 0 ? (b.total_field_hours / b.field_labor_target) * 100 : 100;
      e.avgEff = (e.avgEff * e.total + pct) / (e.total + 1);
      if (b.labor_savings_hours > 0) e.onTrack++;
      e.total++;
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        ...v,
        winRate: v.total > 0 ? Math.round((v.onTrack / v.total) * 100) : 0
      }));
  }, [bonuses]);

  const statusTrend = useMemo(() => {
    const map = new Map<string, { month: string; provisional: number; approved: number; paid: number; denied: number }>();

    bonuses.forEach(b => {
      const d = new Date(b.evaluation_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      if (!map.has(key)) map.set(key, { month: label, provisional: 0, approved: 0, paid: 0, denied: 0 });
      const e = map.get(key)!;
      const status = b.status as keyof Omit<typeof e, 'month'>;
      if (status in e) (e[status] as number)++;
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [bonuses]);

  const totalSavings = bonuses.reduce((s, b) => s + Math.max(0, b.labor_savings_hours || 0), 0);
  const totalProjects = bonuses.length;
  const avgEfficiency = bonuses.length > 0
    ? bonuses.reduce((s, b) => s + (b.field_labor_target > 0 ? (b.total_field_hours / b.field_labor_target) * 100 : 100), 0) / bonuses.length
    : 0;
  const totalBonusPaid = bonuses
    .filter(b => b.status === 'paid')
    .reduce((s, b) => s + (b.total_bonus_amount || 0), 0);

  const charts: { id: ChartTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'monthly_savings', label: 'Monthly Savings', icon: BarChart3 },
    { id: 'tier_dist', label: 'Tier Distribution', icon: PieChartIcon },
    { id: 'efficiency', label: 'Efficiency Trend', icon: TrendingUp },
    { id: 'status_trend', label: 'Status Trend', icon: Activity }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-center">
          <Clock className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600 text-sm">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (bonuses.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg py-12 text-center">
        <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">No analytics data</p>
        <p className="text-gray-400 text-sm mt-1">Analytics appear after projects complete their 90-day period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-green-900">Total Hours Saved</span>
            <TrendingUp className="w-4 h-4 text-green-600" />
          </div>
          <div className="text-2xl font-bold text-green-900">{totalSavings.toFixed(1)}h</div>
          <div className="text-xs text-green-700 mt-0.5">Last {months} months</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-blue-900">Projects Evaluated</span>
            <Target className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-900">{totalProjects}</div>
          <div className="text-xs text-blue-700 mt-0.5">With bonus calculations</div>
        </div>

        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-cyan-900">Avg Efficiency</span>
            <Activity className="w-4 h-4 text-cyan-600" />
          </div>
          <div className={`text-2xl font-bold ${avgEfficiency <= 95 ? 'text-green-700' : avgEfficiency <= 100 ? 'text-amber-700' : 'text-red-700'}`}>
            {avgEfficiency.toFixed(1)}%
          </div>
          <div className="text-xs text-cyan-700 mt-0.5">Field labor vs target</div>
        </div>

        {permissions.can_view_bonus_amounts && (
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-amber-900">Total Paid Out</span>
              <DollarSign className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-900">${totalBonusPaid.toLocaleString()}</div>
            <div className="text-xs text-amber-700 mt-0.5">Bonuses paid (last {months}mo)</div>
          </div>
        )}
      </div>

      {/* Chart controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-col gap-3">
          {/* Chart selector — wraps on mobile */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
            {charts.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveChart(c.id)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap flex-1 sm:flex-none justify-center sm:justify-start ${
                  activeChart === c.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <c.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden xs:inline sm:inline">{c.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-gray-600 flex-shrink-0">Period:</span>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {[3, 6, 12].map(m => (
                <button
                  key={m}
                  onClick={() => setMonths(m)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    months === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {m}mo
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart area — shorter on mobile */}
        <div className="h-52 sm:h-72">
          {activeChart === 'monthly_savings' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={40} />
                <Tooltip
                  formatter={(v: number, name: string) => [`$${v.toLocaleString()}`, name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="savings" fill="#10b981" name="Labor Savings Value" radius={[4, 4, 0, 0]} />
                <Bar dataKey="drag" fill="#ef4444" name="Margin Drag" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChart === 'tier_dist' && (
            <div className="flex flex-col sm:flex-row items-center gap-3 h-full">
              <div className="flex-1 w-full" style={{ minHeight: 0, height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tierData}
                      cx="50%"
                      cy="50%"
                      outerRadius="40%"
                      dataKey="count"
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {tierData.map((entry, i) => (
                        <Cell key={i} fill={TIER_COLORS[entry.name] || '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, _name: string, props: any) => [
                        `${v} projects${permissions.can_view_bonus_amounts ? ` · $${props.payload?.amount?.toLocaleString()}` : ''}`,
                        'Count'
                      ]}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0 w-full sm:w-auto pb-2 sm:pb-0">
                {tierData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs sm:text-sm">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TIER_COLORS[entry.name] || '#6b7280' }} />
                    <span className="text-gray-700 truncate">{entry.name}</span>
                    <span className="font-semibold text-gray-900 ml-auto pl-2">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeChart === 'efficiency' && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={efficiencyTrend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 120]} width={36} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} width={36} />
                <Tooltip
                  formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avgEff"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Avg Efficiency %"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="winRate"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Win Rate %"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {activeChart === 'status_trend' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={statusTrend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  {Object.entries(STATUS_COLORS).map(([status, color]) => (
                    <linearGradient key={status} id={`grad_${status}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={30} />
                <Tooltip
                  formatter={(v: number, name: string) => [v, name.charAt(0).toUpperCase() + name.slice(1)]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="paid" stroke={STATUS_COLORS.paid} fill={`url(#grad_paid)`} name="Paid" strokeWidth={2} />
                <Area type="monotone" dataKey="approved" stroke={STATUS_COLORS.approved} fill={`url(#grad_approved)`} name="Approved" strokeWidth={2} />
                <Area type="monotone" dataKey="provisional" stroke={STATUS_COLORS.provisional} fill={`url(#grad_provisional)`} name="Pending" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <p className="text-xs text-gray-400">
          {activeChart === 'monthly_savings' && 'Monthly labor savings value vs margin drag from over-budget projects.'}
          {activeChart === 'tier_dist' && 'Distribution of completed projects across performance tiers.'}
          {activeChart === 'efficiency' && 'Average field labor efficiency (lower is better) and team win rate over time.'}
          {activeChart === 'status_trend' && 'Bonus approval pipeline — volume of bonuses moving through each stage.'}
        </p>
      </div>
    </div>
  );
}
