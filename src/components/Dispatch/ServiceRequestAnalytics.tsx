import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Clock,
  Phone,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  BarChart2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface AnalyticsRow {
  sr_id: string;
  sr_created_at: string;
  sr_priority: string;
  sr_source_type: string;
  customer_name: string;
  contact_name: string | null;
  wo_id: string | null;
  wo_created_at: string | null;
  wo_status: string | null;
  wo_actual_completion_date: string | null;
  customer_contact_confirmed_at: string | null;
  time_to_schedule_hours: number | null;
  time_to_contact_hours: number | null;
  time_to_completion_hours: number | null;
}

interface KPISummary {
  avg_hours: number | null;
  median_hours: number | null;
  min_hours: number | null;
  max_hours: number | null;
  count: number;
  count_with_data: number;
}

type DateRange = '7d' | '30d' | '90d' | '6m' | '1y' | 'custom';
type SortField = 'sr_created_at' | 'time_to_schedule_hours' | 'time_to_contact_hours' | 'time_to_completion_hours';
type SortDir = 'asc' | 'desc';

function formatHours(hours: number | null): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  if (days < 7) return `${days.toFixed(1)}d`;
  return `${(days / 7).toFixed(1)}w`;
}

function formatHoursLong(hours: number | null): string {
  if (hours === null || hours === undefined) return 'No data';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours % 24);
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function calcKPI(rows: AnalyticsRow[], field: 'time_to_schedule_hours' | 'time_to_contact_hours' | 'time_to_completion_hours'): KPISummary {
  const values = rows.map(r => r[field]).filter((v): v is number => v !== null && v >= 0);
  if (values.length === 0) {
    return { avg_hours: null, median_hours: null, min_hours: null, max_hours: null, count: rows.length, count_with_data: 0 };
  }
  values.sort((a, b) => a - b);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return {
    avg_hours: avg,
    median_hours: median,
    min_hours: values[0],
    max_hours: values[values.length - 1],
    count: rows.length,
    count_with_data: values.length,
  };
}

function getSpeedColor(hours: number | null, thresholds: [number, number]): string {
  if (hours === null) return 'text-gray-500';
  if (hours <= thresholds[0]) return 'text-emerald-600';
  if (hours <= thresholds[1]) return 'text-amber-600';
  return 'text-red-600';
}

function getSpeedBg(hours: number | null, thresholds: [number, number]): string {
  if (hours === null) return 'bg-gray-50 border-gray-200';
  if (hours <= thresholds[0]) return 'bg-emerald-50 border-emerald-200';
  if (hours <= thresholds[1]) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function TrendIcon({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return <Minus className="w-4 h-4 text-gray-400" />;
  const delta = ((current - previous) / previous) * 100;
  if (Math.abs(delta) < 5) return <Minus className="w-4 h-4 text-gray-400" />;
  if (delta > 0) return <TrendingUp className="w-4 h-4 text-red-500" title={`+${delta.toFixed(0)}% vs prior period`} />;
  return <TrendingDown className="w-4 h-4 text-emerald-500" title={`${delta.toFixed(0)}% vs prior period`} />;
}

interface KPICardProps {
  title: string;
  icon: React.ReactNode;
  kpi: KPISummary;
  prevKpi?: KPISummary;
  thresholds: [number, number];
  accent: string;
}

function KPICard({ title, icon, kpi, prevKpi, thresholds, accent }: KPICardProps) {
  return (
    <div className={`bg-white rounded-xl border-2 ${getSpeedBg(kpi.avg_hours, thresholds)} p-5 shadow-sm`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${accent}`}>
          {icon}
        </div>
        <div className="flex items-center gap-1">
          <TrendIcon current={kpi.avg_hours} previous={prevKpi?.avg_hours ?? null} />
          <span className="text-xs text-gray-500">{kpi.count_with_data}/{kpi.count} records</span>
        </div>
      </div>
      <h3 className="text-sm font-semibold text-gray-600 mb-1">{title}</h3>
      <div className={`text-3xl font-bold mb-1 ${getSpeedColor(kpi.avg_hours, thresholds)}`}>
        {formatHoursLong(kpi.avg_hours)}
      </div>
      <p className="text-xs text-gray-500 mb-3">average response time</p>
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-200">
        <div>
          <p className="text-xs text-gray-400">Median</p>
          <p className="text-sm font-semibold text-gray-700">{formatHours(kpi.median_hours)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Fastest</p>
          <p className="text-sm font-semibold text-emerald-600">{formatHours(kpi.min_hours)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Slowest</p>
          <p className="text-sm font-semibold text-red-500">{formatHours(kpi.max_hours)}</p>
        </div>
      </div>
    </div>
  );
}

function buildMonthlyChartData(rows: AnalyticsRow[]) {
  const buckets: Record<string, { label: string; scheduleVals: number[]; contactVals: number[]; completionVals: number[] }> = {};
  for (const row of rows) {
    const d = new Date(row.sr_created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    if (!buckets[key]) buckets[key] = { label, scheduleVals: [], contactVals: [], completionVals: [] };
    if (row.time_to_schedule_hours !== null && row.time_to_schedule_hours >= 0) buckets[key].scheduleVals.push(row.time_to_schedule_hours);
    if (row.time_to_contact_hours !== null && row.time_to_contact_hours >= 0) buckets[key].contactVals.push(row.time_to_contact_hours);
    if (row.time_to_completion_hours !== null && row.time_to_completion_hours >= 0) buckets[key].completionVals.push(row.time_to_completion_hours);
  }
  const avg = (arr: number[]) => arr.length === 0 ? null : arr.reduce((s, v) => s + v, 0) / arr.length;
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      month: v.label,
      'Avg Time to Schedule (h)': avg(v.scheduleVals) !== null ? +avg(v.scheduleVals)!.toFixed(1) : null,
      'Avg Time to Contact (h)': avg(v.contactVals) !== null ? +avg(v.contactVals)!.toFixed(1) : null,
      'Avg Time to Completion (h)': avg(v.completionVals) !== null ? +avg(v.completionVals)!.toFixed(1) : null,
    }));
}

const PRIORITY_COLORS: Record<string, string> = {
  emergency: 'bg-red-100 text-red-800',
  urgent: 'bg-orange-100 text-orange-800',
  normal: 'bg-blue-100 text-blue-800',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800',
  in_progress: 'bg-blue-100 text-blue-800',
  assigned: 'bg-sky-100 text-sky-800',
  pending: 'bg-gray-100 text-gray-700',
  on_hold: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-700',
};

export function ServiceRequestAnalytics() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [prevRows, setPrevRows] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterSource, setFilterSource] = useState('all');

  const [sortField, setSortField] = useState<SortField>('sr_created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  function getDateBounds(range: DateRange): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);
    let start = new Date(now);
    switch (range) {
      case '7d': start.setDate(now.getDate() - 7); break;
      case '30d': start.setDate(now.getDate() - 30); break;
      case '90d': start.setDate(now.getDate() - 90); break;
      case '6m': start.setMonth(now.getMonth() - 6); break;
      case '1y': start.setFullYear(now.getFullYear() - 1); break;
      case 'custom':
        return {
          start: customStart ? new Date(customStart) : new Date(now.setDate(now.getDate() - 30)),
          end: customEnd ? new Date(customEnd + 'T23:59:59') : end,
        };
    }
    return { start, end };
  }

  const fetchData = useCallback(async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setRefreshing(true);
    else setLoading(true);

    const { start, end } = getDateBounds(dateRange);
    const periodMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);

    try {
      let query = supabase
        .from('service_requests')
        .select(`
          id,
          created_at,
          priority,
          source_type,
          customer_name,
          contact_id,
          contacts ( full_name ),
          work_order_id,
          work_orders (
            id,
            created_at,
            status,
            actual_completion_date,
            customer_contact_confirmed_at
          )
        `)
        .neq('status', 'cancelled')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (filterPriority !== 'all') query = query.eq('priority', filterPriority);
      if (filterSource !== 'all') query = query.eq('source_type', filterSource);

      const { data, error } = await query;
      if (error) throw error;

      const mapped = (data || []).map((r: any): AnalyticsRow => {
        const wo = r.work_orders;
        const srCreated = new Date(r.created_at).getTime();
        const woCreated = wo?.created_at ? new Date(wo.created_at).getTime() : null;
        const woCompleted = wo?.actual_completion_date ? new Date(wo.actual_completion_date).getTime() : null;
        const contacted = wo?.customer_contact_confirmed_at ? new Date(wo.customer_contact_confirmed_at).getTime() : null;

        const msToHours = (ms: number) => +(ms / 3600000).toFixed(2);

        return {
          sr_id: r.id,
          sr_created_at: r.created_at,
          sr_priority: r.priority,
          sr_source_type: r.source_type,
          customer_name: r.customer_name,
          contact_name: r.contacts?.full_name ?? null,
          wo_id: wo?.id ?? null,
          wo_created_at: wo?.created_at ?? null,
          wo_status: wo?.status ?? null,
          wo_actual_completion_date: wo?.actual_completion_date ?? null,
          customer_contact_confirmed_at: wo?.customer_contact_confirmed_at ?? null,
          time_to_schedule_hours: woCreated !== null ? msToHours(woCreated - srCreated) : null,
          time_to_contact_hours: (woCreated !== null && contacted !== null) ? msToHours(contacted - woCreated) : null,
          time_to_completion_hours: woCompleted !== null ? msToHours(woCompleted - srCreated) : null,
        };
      });

      setRows(mapped);

      let prevQuery = supabase
        .from('service_requests')
        .select(`
          id, created_at, priority, source_type,
          work_order_id,
          work_orders ( id, created_at, status, actual_completion_date, customer_contact_confirmed_at )
        `)
        .neq('status', 'cancelled')
        .gte('created_at', prevStart.toISOString())
        .lte('created_at', prevEnd.toISOString());
      if (filterPriority !== 'all') prevQuery = prevQuery.eq('priority', filterPriority);
      if (filterSource !== 'all') prevQuery = prevQuery.eq('source_type', filterSource);
      const { data: prevData } = await prevQuery;

      const prevMapped = (prevData || []).map((r: any): AnalyticsRow => {
        const wo = r.work_orders;
        const srCreated = new Date(r.created_at).getTime();
        const woCreated = wo?.created_at ? new Date(wo.created_at).getTime() : null;
        const woCompleted = wo?.actual_completion_date ? new Date(wo.actual_completion_date).getTime() : null;
        const contacted = wo?.customer_contact_confirmed_at ? new Date(wo.customer_contact_confirmed_at).getTime() : null;
        const msToHours = (ms: number) => +(ms / 3600000).toFixed(2);
        return {
          sr_id: r.id, sr_created_at: r.created_at, sr_priority: r.priority, sr_source_type: r.source_type,
          customer_name: '', contact_name: null,
          wo_id: wo?.id ?? null, wo_created_at: wo?.created_at ?? null, wo_status: wo?.status ?? null,
          wo_actual_completion_date: wo?.actual_completion_date ?? null,
          customer_contact_confirmed_at: wo?.customer_contact_confirmed_at ?? null,
          time_to_schedule_hours: woCreated !== null ? msToHours(woCreated - srCreated) : null,
          time_to_contact_hours: (woCreated !== null && contacted !== null) ? msToHours(contacted - woCreated) : null,
          time_to_completion_hours: woCompleted !== null ? msToHours(woCompleted - srCreated) : null,
        };
      });

      setPrevRows(prevMapped);
    } catch (err) {
      console.error('Error loading SR analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, customStart, customEnd, filterPriority, filterSource]);

  useEffect(() => {
    fetchData();
    setPage(0);
  }, [fetchData]);

  const kpiSchedule = calcKPI(rows, 'time_to_schedule_hours');
  const kpiContact = calcKPI(rows, 'time_to_contact_hours');
  const kpiCompletion = calcKPI(rows, 'time_to_completion_hours');

  const prevKpiSchedule = calcKPI(prevRows, 'time_to_schedule_hours');
  const prevKpiContact = calcKPI(prevRows, 'time_to_contact_hours');
  const prevKpiCompletion = calcKPI(prevRows, 'time_to_completion_hours');

  const chartData = buildMonthlyChartData(rows);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />;
  }

  function exportCSV() {
    const headers = [
      'SR Created', 'Customer', 'Priority', 'Source', 'WO Status',
      'Time to Schedule', 'Time to Customer Contact', 'Time to Completion'
    ];
    const csvRows = rows.map(r => [
      new Date(r.sr_created_at).toLocaleString(),
      r.contact_name || r.customer_name || '',
      r.sr_priority,
      r.sr_source_type,
      r.wo_status || 'no work order',
      r.time_to_schedule_hours !== null ? r.time_to_schedule_hours.toFixed(2) : '',
      r.time_to_contact_hours !== null ? r.time_to_contact_hours.toFixed(2) : '',
      r.time_to_completion_hours !== null ? r.time_to_completion_hours.toFixed(2) : '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const content = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sr-response-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pendingContact = rows.filter(r => r.wo_id && !r.customer_contact_confirmed_at && r.wo_status !== 'cancelled').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">SR Response Analytics</h1>
          </div>
          <p className="text-sm text-gray-400">
            Track service request response times: scheduling, customer contact, and completion
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date Range</label>
            <div className="flex items-center gap-1">
              {(['7d', '30d', '90d', '6m', '1y'] as DateRange[]).map(r => (
                <button
                  key={r}
                  onClick={() => { setDateRange(r); setPage(0); }}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                    dateRange === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {r}
                </button>
              ))}
              <button
                onClick={() => { setDateRange('custom'); setPage(0); }}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1 ${
                  dateRange === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Custom
              </button>
            </div>
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <Filter className="w-3 h-3 inline mr-1" />Priority
            </label>
            <select value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(0); }}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="all">All Priorities</option>
              <option value="emergency">Emergency</option>
              <option value="urgent">Urgent</option>
              <option value="normal">Normal</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <Filter className="w-3 h-3 inline mr-1" />Source
            </label>
            <select value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(0); }}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="all">All Sources</option>
              <option value="punchlist">Punchlist</option>
              <option value="staff_form">Staff Form</option>
              <option value="customer_portal">Customer Portal</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="text-sm text-gray-500 self-end pb-1.5">
            <span className="font-semibold text-gray-900">{rows.length}</span> service requests
          </div>
        </div>
      </div>

      {/* Pending Contact Alert */}
      {pendingContact > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {pendingContact} work order{pendingContact !== 1 ? 's' : ''} in this period still need customer contact confirmation
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Open the work order and click "Mark Customer Contacted" after speaking with the customer to confirm their appointment.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Time to Schedule (SR → Work Order)"
          icon={<Clock className="w-5 h-5 text-blue-600" />}
          kpi={kpiSchedule}
          prevKpi={prevKpiSchedule}
          thresholds={[4, 24]}
          accent="bg-blue-50"
        />
        <KPICard
          title="Time to Customer Contact (WO Created → Confirmed)"
          icon={<Phone className="w-5 h-5 text-amber-600" />}
          kpi={kpiContact}
          prevKpi={prevKpiContact}
          thresholds={[2, 8]}
          accent="bg-amber-50"
        />
        <KPICard
          title="Total Cycle Time (SR → WO Completion)"
          icon={<CheckCircle className="w-5 h-5 text-emerald-600" />}
          kpi={kpiCompletion}
          prevKpi={prevKpiCompletion}
          thresholds={[48, 168]}
          accent="bg-emerald-50"
        />
      </div>

      {/* Monthly Trend Chart */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Monthly Averages (hours)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${value}h`, name]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Avg Time to Schedule (h)" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Avg Time to Contact (h)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Avg Time to Completion (h)" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Completion times are in hours. Use median on the KPI cards above for a more representative view.
          </p>
        </div>
      )}

      {/* Detail Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Individual Records</h2>
          <span className="text-sm text-gray-500">{sorted.length} total</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <button onClick={() => toggleSort('sr_created_at')} className="flex items-center gap-1 hover:text-gray-700">
                    SR Created <SortIcon field="sr_created_at" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">WO Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <button onClick={() => toggleSort('time_to_schedule_hours')} className="flex items-center gap-1 hover:text-gray-700">
                    To Schedule <SortIcon field="time_to_schedule_hours" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <button onClick={() => toggleSort('time_to_contact_hours')} className="flex items-center gap-1 hover:text-gray-700">
                    To Contact <SortIcon field="time_to_contact_hours" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <button onClick={() => toggleSort('time_to_completion_hours')} className="flex items-center gap-1 hover:text-gray-700">
                    To Completion <SortIcon field="time_to_completion_hours" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No service requests found for the selected filters.
                  </td>
                </tr>
              ) : paginated.map(row => (
                <tr key={row.sr_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {new Date(row.sr_created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    <div className="text-xs text-gray-400">
                      {new Date(row.sr_created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 truncate max-w-[160px]">
                      {row.contact_name || row.customer_name || '—'}
                    </div>
                    {row.sr_source_type && (
                      <div className="text-xs text-gray-400 capitalize">{row.sr_source_type.replace('_', ' ')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORITY_COLORS[row.sr_priority] || 'bg-gray-100 text-gray-700'}`}>
                      {row.sr_priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.wo_status ? (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[row.wo_status] || 'bg-gray-100 text-gray-700'}`}>
                        {row.wo_status.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No WO yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${getSpeedColor(row.time_to_schedule_hours, [4, 24])}`}>
                      {formatHours(row.time_to_schedule_hours)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.wo_id ? (
                      row.customer_contact_confirmed_at ? (
                        <span className={`font-semibold ${getSpeedColor(row.time_to_contact_hours, [2, 8])}`}>
                          {formatHours(row.time_to_contact_hours)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                          <AlertCircle className="w-3 h-3" />
                          Not confirmed
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${getSpeedColor(row.time_to_completion_hours, [48, 168])}`}>
                      {formatHours(row.time_to_completion_hours)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Methodology note */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 mb-1">How these metrics are calculated</p>
        <p><span className="font-medium text-blue-600">Time to Schedule:</span> From service request creation to work order creation. Green ≤4h, Amber ≤24h, Red &gt;24h.</p>
        <p><span className="font-medium text-amber-600">Time to Customer Contact:</span> From work order creation to when dispatch marks "Customer Contacted" on the work order. Green ≤2h, Amber ≤8h, Red &gt;8h.</p>
        <p><span className="font-medium text-emerald-600">Total Cycle Time:</span> From service request creation to work order actual completion date. Green ≤2d, Amber ≤7d, Red &gt;7d.</p>
        <p className="pt-1 border-t border-gray-200">Trend arrows compare average to the prior period of equal length. Only records with the relevant timestamps contribute to each metric's average.</p>
      </div>
    </div>
  );
}
