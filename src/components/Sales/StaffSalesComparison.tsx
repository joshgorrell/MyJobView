import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Award,
  RefreshCw,
  BarChart3,
  ChevronRight,
  Calendar,
  Target,
  Zap,
  Activity,
  Ban,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { DeclinedProposalsReport } from './DeclinedProposalsReport';

type RangeMode = 'this_year' | 'last_12' | 'last_90' | 'all' | number;

interface StaffStat {
  user_id: string;
  year: number;
  month: number;
  total_sales: number;
}

interface StaffProfile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface ChartRow {
  label: string;
  month: number;
  [userId: string]: number | string;
}

interface RepBarRow {
  label: string;
  value: number;
}

interface RepDetailStats {
  total: number;
  monthlyAvg: number;
  bestMonth: { label: string; value: number } | null;
  worstMonth: { label: string; value: number } | null;
  activeMonths: number;
  vsTeamAvgPct: number | null;
  barData: RepBarRow[];
  repAvg: number;
}

interface CareerData {
  careerMonthlyAvg: number;
  vsCareerPct: number | null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STAFF_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function getDisplayName(p: StaffProfile): string {
  if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
  if (p.full_name) return p.full_name;
  return 'Unknown';
}

function getFirstName(p: StaffProfile): string {
  if (p.first_name) return p.first_name;
  if (p.full_name) return p.full_name.split(' ')[0];
  return 'Unknown';
}

interface ComparisonTooltipProps {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
  nameResolver: (uid: string) => string;
}

function ComparisonTooltip({ active, payload, label, nameResolver }: ComparisonTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 min-w-[200px]">
      <div className="text-sm font-semibold text-white mb-2">{label}</div>
      <div className="space-y-1.5">
        {sorted.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-300 text-xs truncate max-w-[120px]">{nameResolver(entry.name)}</span>
            </div>
            <span className="text-white font-semibold text-xs tabular-nums">
              {entry.value > 0 ? formatCurrency(entry.value) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RepBarTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function RepBarTooltip({ active, payload, label }: RepBarTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-sm font-bold text-white tabular-nums">
        {payload[0].value > 0 ? formatCurrency(payload[0].value) : '—'}
      </div>
    </div>
  );
}

function getRangeYears(mode: RangeMode): number[] {
  const now = new Date();
  const curYear = now.getFullYear();
  if (mode === 'this_year') return [curYear];
  if (mode === 'last_12') {
    const startMonth = now.getMonth();
    if (startMonth === now.getMonth()) {
      return curYear === now.getFullYear() && now.getMonth() < 11
        ? [curYear - 1, curYear]
        : [curYear];
    }
    return [curYear - 1, curYear];
  }
  return [mode as number];
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-gray-900/60 border-gray-700/60'}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</span>
      </div>
      <div className="text-base font-bold text-white tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function StaffSalesComparison() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<StaffStat[]>([]);
  const [raw90Data, setRaw90Data] = useState<{ rep_id: string; created_at: string; amount: number }[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeMode, setRangeMode] = useState<RangeMode>('this_year');
  const [activeTab, setActiveTab] = useState<'sales' | 'lost_deals'>('sales');
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [careerCache, setCareerCache] = useState<Record<string, CareerData>>({});
  const [careerLoading, setCareerLoading] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const curYear = now.getFullYear();

  const availableYears = useMemo(() => {
    return [curYear, curYear - 1, curYear - 2].filter(y => y >= 2020);
  }, [curYear]);

  const isPrivileged = profile?.role && ['admin', 'manager', 'sales_manager', 'finance'].includes(profile.role);

  const loadData = useCallback(async (showRefresh = false) => {
    if (!profile?.organization_id || !isPrivileged) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const profilesResult = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name')
        .eq('organization_id', profile.organization_id)
        .in('role', ['sales', 'sales_manager', 'manager', 'admin', 'finance', 'service_manager']);

      setStaffProfiles(profilesResult.data || []);

      if (rangeMode === 'last_90') {
        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() - 90);

        const [soResult, invResult] = await Promise.all([
          supabase
            .from('sales_orders')
            .select('id, contract_total, sales_rep_id, created_by, created_at')
            .eq('organization_id', profile.organization_id)
            .gte('created_at', windowStart.toISOString())
            .not('status', 'in', '(cancelled,voided)'),
          supabase
            .from('invoices')
            .select('id, total, created_by, invoice_date')
            .eq('company_id', profile.organization_id)
            .gte('invoice_date', windowStart.toISOString().split('T')[0])
            .not('status', 'in', '(void,draft)'),
        ]);

        const rows: { rep_id: string; created_at: string; amount: number }[] = [];
        (soResult.data || []).forEach(so => {
          const repId = so.sales_rep_id || so.created_by;
          if (repId) rows.push({ rep_id: repId, created_at: so.created_at, amount: Number(so.contract_total) || 0 });
        });
        (invResult.data || []).forEach(inv => {
          if (inv.created_by) rows.push({ rep_id: inv.created_by, created_at: inv.invoice_date, amount: Number(inv.total) || 0 });
        });

        setRaw90Data(rows);
        setStats([]);
      } else {
        let statsQuery = supabase
          .from('sales_monthly_stats')
          .select('user_id, year, month, total_sales')
          .eq('organization_id', profile.organization_id)
          .order('year', { ascending: true })
          .order('month', { ascending: true });

        if (rangeMode !== 'all') {
          const yearsToFetch = getRangeYears(rangeMode);
          if (yearsToFetch.length === 1) {
            statsQuery = statsQuery.eq('year', yearsToFetch[0]);
          } else {
            statsQuery = statsQuery.in('year', yearsToFetch);
          }
        }

        const statsResult = await statsQuery;
        setStats(statsResult.data || []);
        setRaw90Data([]);
      }
    } catch (err) {
      console.error('Error loading staff sales comparison:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.organization_id, rangeMode, isPrivileged]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { chartData, staffIds, leaderboard, grandAvg, periodLabel, slots } = useMemo(() => {
    // ── 90-day mode: weekly buckets from raw sales_orders data ───────────────
    if (rangeMode === 'last_90') {
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - 90);
      windowStart.setHours(0, 0, 0, 0);

      // Build 13 weekly bucket start dates (oldest → newest)
      const buckets: Date[] = [];
      for (let i = 12; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        d.setHours(0, 0, 0, 0);
        buckets.push(d);
      }

      const getWeekIndex = (date: Date): number => {
        for (let i = buckets.length - 1; i >= 0; i--) {
          if (date >= buckets[i]) return i;
        }
        return -1;
      };

      const repMap: Record<string, number[]> = {};
      raw90Data.forEach(({ rep_id, created_at, amount }) => {
        const d = new Date(created_at);
        const wi = getWeekIndex(d);
        if (wi < 0) return;
        if (!repMap[rep_id]) repMap[rep_id] = new Array(13).fill(0);
        repMap[rep_id][wi] += amount;
      });

      const ids90 = Object.keys(repMap);
      const slotList90 = buckets.map(b => ({
        label: `${b.getMonth() + 1}/${b.getDate()}`,
        year: b.getFullYear(),
        month: b.getMonth() + 1,
      }));

      const rows90: ChartRow[] = slotList90.map((slot, wi) => {
        const row: ChartRow = { label: slot.label, month: slot.month };
        ids90.forEach(uid => { row[uid] = repMap[uid][wi] || 0; });
        return row;
      });

      const totals90: Record<string, number> = {};
      ids90.forEach(uid => {
        totals90[uid] = repMap[uid].reduce((a, b) => a + b, 0);
      });

      const sorted90 = [...ids90].sort((a, b) => (totals90[b] || 0) - (totals90[a] || 0));

      const allVals90 = rows90.flatMap(row => ids90.map(uid => (row[uid] as number) || 0)).filter(v => v > 0);
      const avg90 = allVals90.length > 0 ? allVals90.reduce((a, b) => a + b, 0) / allVals90.length : 0;

      return {
        chartData: rows90,
        staffIds: sorted90,
        leaderboard: sorted90.map(uid => ({ uid, total: totals90[uid] || 0 })),
        grandAvg: avg90,
        periodLabel: 'Last 90 Days',
        slots: slotList90,
      };
    }

    // ── Monthly modes ────────────────────────────────────────────────────────
    const ids = [...new Set(stats.map(s => s.user_id))];

    let slotList: { label: string; year: number; month: number }[] = [];

    if (rangeMode === 'this_year') {
      const maxMonth = now.getMonth() + 1;
      slotList = Array.from({ length: maxMonth }, (_, i) => ({
        label: MONTH_NAMES[i],
        year: curYear,
        month: i + 1,
      }));
    } else if (rangeMode === 'last_12') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(curYear, now.getMonth() - i, 1);
        slotList.push({ label: MONTH_NAMES[d.getMonth()], year: d.getFullYear(), month: d.getMonth() + 1 });
      }
    } else if (rangeMode === 'all') {
      const years = [...new Set(stats.map(s => s.year))].sort((a, b) => a - b);
      if (years.length === 0) {
        const maxMonth = now.getMonth() + 1;
        slotList = Array.from({ length: maxMonth }, (_, i) => ({
          label: MONTH_NAMES[i],
          year: curYear,
          month: i + 1,
        }));
      } else {
        const minYear = years[0];
        const maxYear = years[years.length - 1];
        for (let y = minYear; y <= maxYear; y++) {
          const maxMonth = y < curYear ? 12 : now.getMonth() + 1;
          for (let m = 1; m <= maxMonth; m++) {
            slotList.push({
              label: years.length > 1 ? `${MONTH_NAMES[m - 1]} '${String(y).slice(2)}` : MONTH_NAMES[m - 1],
              year: y,
              month: m,
            });
          }
        }
      }
    } else {
      const yr = rangeMode as number;
      const maxMonth = yr < curYear ? 12 : now.getMonth() + 1;
      slotList = Array.from({ length: maxMonth }, (_, i) => ({
        label: MONTH_NAMES[i],
        year: yr,
        month: i + 1,
      }));
    }

    const rows: ChartRow[] = slotList.map(slot => {
      const row: ChartRow = { label: slot.label, month: slot.month };
      ids.forEach(uid => { row[uid] = 0; });
      return row;
    });

    stats.forEach(s => {
      const idx = slotList.findIndex(sl => sl.year === s.year && sl.month === s.month);
      if (idx !== -1) {
        rows[idx][s.user_id] = s.total_sales;
      }
    });

    const totals: Record<string, number> = {};
    ids.forEach(uid => {
      totals[uid] = rows.reduce((sum, row) => sum + ((row[uid] as number) || 0), 0);
    });

    const sorted = [...ids].sort((a, b) => (totals[b] || 0) - (totals[a] || 0));

    const allValues = rows.flatMap(row => ids.map(uid => (row[uid] as number) || 0)).filter(v => v > 0);
    const avg = allValues.length > 0
      ? allValues.reduce((a, b) => a + b, 0) / allValues.length
      : 0;

    let label = '';
    if (rangeMode === 'this_year') label = `${curYear}`;
    else if (rangeMode === 'last_12') label = 'Last 12 Months';
    else if (rangeMode === 'all') label = 'All Time';
    else label = `${rangeMode}`;

    return {
      chartData: rows,
      staffIds: sorted,
      leaderboard: sorted.map(uid => ({ uid, total: totals[uid] || 0 })),
      grandAvg: avg,
      periodLabel: label,
      slots: slotList,
    };
  }, [stats, raw90Data, rangeMode, curYear]);

  const singleSelectedId = useMemo(() => {
    if (selectedStaffIds.size === 1) return [...selectedStaffIds][0];
    return null;
  }, [selectedStaffIds]);

  const repDetailStats = useMemo((): RepDetailStats | null => {
    if (!singleSelectedId) return null;
    const uid = singleSelectedId;

    const barData: RepBarRow[] = slots.map((slot, i) => ({
      label: slot.label,
      value: (chartData[i]?.[uid] as number) || 0,
    }));

    const nonZeroValues = barData.filter(d => d.value > 0).map(d => d.value);
    const total = nonZeroValues.reduce((a, b) => a + b, 0);
    const monthlyAvg = nonZeroValues.length > 0 ? total / nonZeroValues.length : 0;
    const activeMonths = nonZeroValues.length;

    let bestMonth: { label: string; value: number } | null = null;
    let worstMonth: { label: string; value: number } | null = null;

    barData.forEach(d => {
      if (d.value > 0) {
        if (!bestMonth || d.value > bestMonth.value) bestMonth = { label: d.label, value: d.value };
        if (!worstMonth || d.value < worstMonth.value) worstMonth = { label: d.label, value: d.value };
      }
    });

    const vsTeamAvgPct = grandAvg > 0
      ? ((monthlyAvg - grandAvg) / grandAvg) * 100
      : null;

    return { total, monthlyAvg, bestMonth, worstMonth, activeMonths, vsTeamAvgPct, barData, repAvg: monthlyAvg };
  }, [singleSelectedId, slots, chartData, grandAvg]);

  useEffect(() => {
    if (!singleSelectedId || !profile?.organization_id) return;
    if (careerCache[singleSelectedId]) return;

    setCareerLoading(true);
    supabase
      .from('sales_monthly_stats')
      .select('total_sales')
      .eq('organization_id', profile.organization_id)
      .eq('user_id', singleSelectedId)
      .gt('total_sales', 0)
      .then(({ data }) => {
        const rows = data || [];
        const careerMonthlyAvg = rows.length > 0
          ? rows.reduce((s, r) => s + r.total_sales, 0) / rows.length
          : 0;
        const currentAvg = repDetailStats?.monthlyAvg ?? 0;
        const vsCareerPct = careerMonthlyAvg > 0
          ? ((currentAvg - careerMonthlyAvg) / careerMonthlyAvg) * 100
          : null;
        setCareerCache(prev => ({
          ...prev,
          [singleSelectedId]: { careerMonthlyAvg, vsCareerPct },
        }));
        setCareerLoading(false);
      });
  }, [singleSelectedId, profile?.organization_id, careerCache]);

  const allSelectableIds = useMemo(() => staffIds, [staffIds]);

  const visibleStaffIds = useMemo(() => {
    if (selectedStaffIds.size === 0) return staffIds;
    return staffIds.filter(uid => selectedStaffIds.has(uid));
  }, [staffIds, selectedStaffIds]);

  const visibleLeaderboard = useMemo(() => {
    if (selectedStaffIds.size === 0) return leaderboard;
    return leaderboard.filter(({ uid }) => selectedStaffIds.has(uid));
  }, [leaderboard, selectedStaffIds]);

  function nameFor(uid: string): string {
    const p = staffProfiles.find(p => p.id === uid);
    return p ? getDisplayName(p) : 'Unknown';
  }

  function firstNameFor(uid: string): string {
    const p = staffProfiles.find(p => p.id === uid);
    return p ? getFirstName(p) : 'Unknown';
  }

  function toggleStaff(uid: string) {
    setSelectedStaffIds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelectedStaffIds(new Set());
  }

  if (!isPrivileged) return null;

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

  const hasData = rangeMode === 'last_90'
    ? raw90Data.length > 0
    : stats.some(s => s.total_sales > 0);
  const isFiltered = selectedStaffIds.size > 0;
  const subtitleText = isFiltered
    ? `Showing ${selectedStaffIds.size} of ${allSelectableIds.length} rep${allSelectableIds.length !== 1 ? 's' : ''}`
    : `${allSelectableIds.length} rep${allSelectableIds.length !== 1 ? 's' : ''} — click names to filter`;

  const repColor = singleSelectedId
    ? STAFF_COLORS[staffIds.indexOf(singleSelectedId) % STAFF_COLORS.length]
    : '#10b981';

  const careerInfo = singleSelectedId ? careerCache[singleSelectedId] : null;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeTab === 'lost_deals' ? 'bg-rose-600/20' : 'bg-emerald-600/20'}`}>
            {activeTab === 'lost_deals'
              ? <Ban className="w-4 h-4 text-rose-400" />
              : <Users className="w-4 h-4 text-emerald-400" />}
          </div>
          <div>
            <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('sales')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'sales'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Team Sales
              </button>
              <button
                onClick={() => setActiveTab('lost_deals')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'lost_deals'
                    ? 'bg-rose-700 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Ban className="w-3 h-3" />
                Lost Deals
              </button>
            </div>
            {activeTab === 'sales' && (
              <p className="text-xs text-gray-400 mt-0.5">{subtitleText}</p>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-2 ${activeTab === 'lost_deals' ? 'invisible' : ''}`}>
          <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setRangeMode('last_90')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                rangeMode === 'last_90'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              90 Days
            </button>
            <button
              onClick={() => setRangeMode('this_year')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                rangeMode === 'this_year'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              This Year
            </button>
            <button
              onClick={() => setRangeMode('last_12')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                rangeMode === 'last_12'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Last 12M
            </button>
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => setRangeMode(y)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  rangeMode === y
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {y}
              </button>
            ))}
            <button
              onClick={() => setRangeMode('all')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                rangeMode === 'all'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              All
            </button>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {activeTab === 'lost_deals' ? (
        <DeclinedProposalsReport />
      ) : (
      <>
      {allSelectableIds.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-700/60 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-500 mr-1">Filter:</span>
          <button
            onClick={toggleAll}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
              !isFiltered
                ? 'bg-gray-600 border-gray-500 text-white'
                : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
            }`}
          >
            All
          </button>
          {allSelectableIds.map((uid, i) => {
            const color = STAFF_COLORS[i % STAFF_COLORS.length];
            const selected = selectedStaffIds.has(uid);
            return (
              <button
                key={uid}
                onClick={() => toggleStaff(uid)}
                title={nameFor(uid)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                  selected
                    ? 'text-white'
                    : 'bg-transparent text-gray-400 hover:text-gray-200'
                }`}
                style={
                  selected
                    ? { backgroundColor: color, borderColor: color }
                    : { borderColor: color + '60' }
                }
              >
                {firstNameFor(uid)}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-5">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <BarChart3 className="w-10 h-10 text-gray-600 mb-3" />
            <p className="text-gray-400 text-sm font-medium">No team sales data for {periodLabel}</p>
            <p className="text-gray-600 text-xs mt-1">Sales orders will populate this chart automatically</p>
          </div>
        ) : (
          <>
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
                    tickFormatter={(v: number) => formatCurrency(v)}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                  />
                  <Tooltip content={<ComparisonTooltip nameResolver={nameFor} />} />
                  <Legend
                    formatter={(value: string) => (
                      <span className="text-gray-300 text-xs">{nameFor(value)}</span>
                    )}
                    wrapperStyle={{ paddingTop: '12px' }}
                  />
                  {grandAvg > 0 && (
                    <ReferenceLine
                      y={grandAvg}
                      stroke="#f59e0b"
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                      label={{
                        value: `Team Avg ${formatCurrency(grandAvg)}`,
                        fill: '#f59e0b',
                        fontSize: 9,
                        position: 'insideTopRight',
                        dx: -4,
                        dy: -6
                      }}
                    />
                  )}
                  {staffIds.map((uid, i) => (
                    <Line
                      key={uid}
                      type="monotone"
                      dataKey={uid}
                      name={uid}
                      stroke={STAFF_COLORS[i % STAFF_COLORS.length]}
                      strokeWidth={visibleStaffIds.includes(uid) ? 2 : 0}
                      dot={visibleStaffIds.includes(uid) ? { r: 3, fill: STAFF_COLORS[i % STAFF_COLORS.length], strokeWidth: 0 } : false}
                      activeDot={visibleStaffIds.includes(uid) ? { r: 6, strokeWidth: 2, stroke: '#1f2937' } : false}
                      connectNulls={false}
                      isAnimationActive
                      animationDuration={700}
                      legendType={visibleStaffIds.includes(uid) ? 'line' : 'none'}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {visibleLeaderboard.length > 0 && (
              <div className="mt-5 border-t border-gray-700 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Period Leaderboard — {periodLabel}</span>
                  {isFiltered && (
                    <span className="text-xs text-gray-500 ml-1">(filtered)</span>
                  )}
                </div>
                <div className="space-y-2">
                  {visibleLeaderboard.map(({ uid, total }, idx) => {
                    const globalRank = leaderboard.findIndex(l => l.uid === uid);
                    const color = STAFF_COLORS[staffIds.indexOf(uid) % STAFF_COLORS.length];
                    const maxTotal = visibleLeaderboard[0]?.total || 1;
                    const barPct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
                    const isActive = singleSelectedId === uid;
                    return (
                      <div
                        key={uid}
                        className={`flex items-center gap-3 rounded-lg transition-all duration-200 ${
                          isActive ? 'bg-gray-700/50 px-2 py-1 -mx-2' : 'group cursor-default'
                        }`}
                      >
                        <div className="w-5 text-center">
                          {globalRank === 0
                            ? <span className="text-amber-400 text-sm font-bold">1</span>
                            : <span className="text-gray-500 text-xs font-medium">{globalRank + 1}</span>
                          }
                        </div>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-sm truncate ${isActive ? 'text-white font-semibold' : 'text-gray-200'}`}>
                              {nameFor(uid)}
                            </span>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className="text-sm font-bold text-white tabular-nums">{formatCurrency(total)}</span>
                              {globalRank === 0 && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
                              {globalRank === leaderboard.length - 1 && leaderboard.length > 1 && (
                                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                              )}
                              <ChevronRight
                                className={`w-3.5 h-3.5 transition-all duration-200 ${
                                  isActive
                                    ? 'text-white rotate-90'
                                    : 'text-gray-600 group-hover:text-gray-400'
                                }`}
                              />
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${barPct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {singleSelectedId && repDetailStats && (
              <div
                ref={detailRef}
                className="mt-5 border-t border-gray-700 pt-5 animate-fadeIn"
                style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
              >
                <style>{`
                  @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: repColor }} />
                  <div>
                    <span className="text-sm font-bold text-white">{nameFor(singleSelectedId)}</span>
                    <span className="ml-2 text-xs text-gray-500">— {periodLabel} breakdown</span>
                  </div>
                  <div className="ml-auto">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: repColor + '20', color: repColor }}
                    >
                      #{leaderboard.findIndex(l => l.uid === singleSelectedId) + 1} ranked
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
                  <StatCard
                    label="Total"
                    value={formatCurrency(repDetailStats.total)}
                    icon={Target}
                    iconColor="text-emerald-400"
                    highlight
                  />
                  <StatCard
                    label={rangeMode === 'last_90' ? 'Weekly Avg' : 'Monthly Avg'}
                    value={formatCurrency(repDetailStats.monthlyAvg)}
                    icon={Activity}
                    iconColor="text-blue-400"
                  />
                  <StatCard
                    label={rangeMode === 'last_90' ? 'Best Week' : 'Best Month'}
                    value={repDetailStats.bestMonth ? formatCurrency(repDetailStats.bestMonth.value) : '—'}
                    sub={repDetailStats.bestMonth?.label}
                    icon={TrendingUp}
                    iconColor="text-emerald-400"
                  />
                  <StatCard
                    label={rangeMode === 'last_90' ? 'Worst Week' : 'Worst Month'}
                    value={repDetailStats.worstMonth ? formatCurrency(repDetailStats.worstMonth.value) : '—'}
                    sub={repDetailStats.worstMonth?.label}
                    icon={TrendingDown}
                    iconColor="text-red-400"
                  />
                  <StatCard
                    label={rangeMode === 'last_90' ? 'Active Weeks' : 'Active Months'}
                    value={`${repDetailStats.activeMonths} / ${slots.length}`}
                    icon={Calendar}
                    iconColor="text-amber-400"
                  />
                  <StatCard
                    label="vs Team Avg"
                    value={
                      repDetailStats.vsTeamAvgPct !== null
                        ? `${repDetailStats.vsTeamAvgPct >= 0 ? '+' : ''}${repDetailStats.vsTeamAvgPct.toFixed(0)}%`
                        : '—'
                    }
                    icon={Zap}
                    iconColor={
                      repDetailStats.vsTeamAvgPct === null ? 'text-gray-400' :
                      repDetailStats.vsTeamAvgPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }
                  />
                </div>

                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={repDetailStats.barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) => formatCurrency(v)}
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={50}
                      />
                      <Tooltip content={<RepBarTooltip />} />
                      {repDetailStats.repAvg > 0 && (
                        <ReferenceLine
                          y={repDetailStats.repAvg}
                          stroke={repColor}
                          strokeDasharray="4 3"
                          strokeWidth={1.5}
                          label={{
                            value: `Avg ${formatCurrency(repDetailStats.repAvg)}`,
                            fill: repColor,
                            fontSize: 9,
                            position: 'insideTopRight',
                            dx: -4,
                            dy: -6,
                          }}
                        />
                      )}
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {repDetailStats.barData.map((entry, i) => {
                          const aboveAvg = entry.value >= repDetailStats.repAvg;
                          const nearAvg = entry.value > 0 && repDetailStats.repAvg > 0 && entry.value >= repDetailStats.repAvg * 0.9;
                          const barColor = entry.value === 0
                            ? '#374151'
                            : aboveAvg
                            ? '#10b981'
                            : nearAvg
                            ? '#f59e0b'
                            : '#ef4444';
                          return <Cell key={i} fill={barColor} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-700/60">
                  {careerLoading ? (
                    <div className="h-12 bg-gray-700/30 rounded-lg animate-pulse" />
                  ) : careerInfo ? (
                    <div className="rounded-lg bg-gray-900/60 border border-gray-700/60 p-3 flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Career Avg / Month</span>
                      </div>
                      <span className="text-base font-bold text-white tabular-nums">
                        {careerInfo.careerMonthlyAvg > 0 ? formatCurrency(careerInfo.careerMonthlyAvg) : '—'}
                      </span>
                      {careerInfo.vsCareerPct !== null && (
                        <div className={`flex items-center gap-1 ml-auto text-sm font-semibold ${
                          careerInfo.vsCareerPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {careerInfo.vsCareerPct >= 0
                            ? <TrendingUp className="w-4 h-4" />
                            : <TrendingDown className="w-4 h-4" />
                          }
                          <span>
                            {careerInfo.vsCareerPct >= 0 ? '+' : ''}{careerInfo.vsCareerPct.toFixed(0)}% vs career avg
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}
