import { readAllSalesRows } from '../../hooks/useSalesDashboardRecords';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileUp, RefreshCw, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface DailySalesTotalsPanelProps {
  repId: string | null;
  allSales?: boolean;
  onUpdateReport?: () => void;
}

interface DailyTotalRow {
  sales_date: string;
  invoice_total: number;
  invoice_count: number;
}

interface ReportRow {
  report_period_start: string;
  report_period_end: string;
  source_file_name: string;
  created_at: string;
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function DailySalesTotalsPanel({ repId, onUpdateReport, allSales = false }: DailySalesTotalsPanelProps) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<DailyTotalRow[]>([]);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadTotals = useCallback(async () => {
    if (!profile?.organization_id || (!repId && !allSales)) return;
    setLoading(true);
    setError(false);
    try {
      const { data: reportData, error: reportError } = await supabase.from('sales_daily_reports').select('report_period_start, report_period_end, source_file_name, created_at').eq('organization_id', profile.organization_id).eq('review_status', 'approved').order('report_period_end', { ascending: false }).limit(1).maybeSingle();
      if (reportError) throw reportError;
      setReport(reportData);
      if (!reportData) {
        setRows([]);
        return;
      }
      let totalsQuery = supabase.from('sales_daily_totals').select('sales_date, invoice_total, invoice_count').eq('organization_id', profile.organization_id).gte('sales_date', reportData.report_period_start).lte('sales_date', reportData.report_period_end).order('sales_date', { ascending: false });
      if (!allSales) totalsQuery = totalsQuery.eq('sales_rep_id', repId);
      const totalData = await readAllSalesRows(() => totalsQuery);
      const byDay = new Map<string, DailyTotalRow>();
      for (const row of totalData || []) { const prior = byDay.get(row.sales_date); byDay.set(row.sales_date, { sales_date: row.sales_date, invoice_total: Number(row.invoice_total) + Number(prior?.invoice_total || 0), invoice_count: Number(row.invoice_count) + Number(prior?.invoice_count || 0) }); }
      setRows([...byDay.values()].sort((a, b) => b.sales_date.localeCompare(a.sales_date)));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile?.organization_id, repId, allSales]);

  useEffect(() => { void loadTotals(); }, [loadTotals]);

  const currentThrough = useMemo(() => rows.reduce((sum, row) => sum + Number(row.invoice_total), 0), [rows]);
  const latest = rows[0];

  const daysOld = report ? Math.floor((Date.now() - new Date(report.report_period_end + 'T23:59:59').getTime()) / 86400000) : 0;
  return (
    <section className="rounded-xl border border-gray-700 bg-gray-800/90 p-3 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TrendingUp className="w-4 h-4 shrink-0 text-blue-400" />
          <h2 className="text-sm sm:text-base font-semibold text-white">Daily reported sales</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onUpdateReport && <button onClick={onUpdateReport} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-2 text-xs font-medium text-white hover:bg-blue-700"><FileUp className="w-3.5 h-3.5" /><span className="hidden sm:inline">Update report</span><span className="sm:hidden">Update</span></button>}
          <button onClick={() => void loadTotals()} className="rounded-lg border border-gray-600 p-2 text-gray-200 hover:bg-gray-700" title="Refresh daily totals" aria-label="Refresh daily totals"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      {loading ? <p className="mt-3 text-sm text-gray-400">Loading daily totals…</p>
        : error ? <p className="mt-3 text-sm text-red-300">Daily totals could not be loaded. Try refreshing.</p>
        : !report ? <p className="mt-3 text-sm text-gray-400">No approved daily report is available yet.</p>
        : <>
          {daysOld > 7 && <p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Latest approved report ends {report.report_period_end}. Figures may be outdated.</p>}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="col-span-2 sm:col-span-1 rounded-lg border border-gray-600 bg-gray-900/70 p-3">
              <p className="text-xs text-gray-400">Reported total</p>
              <p className="mt-1 text-xl sm:text-2xl font-bold text-white tabular-nums">{money(currentThrough)}</p>
              <p className="mt-1 text-xs text-gray-400">Through {report.report_period_end}</p>
            </div>
            <div className="rounded-lg border border-gray-600 bg-gray-900/70 p-3">
              <p className="text-xs text-gray-400">Latest day</p>
              <p className="mt-1 text-lg sm:text-xl font-bold text-white tabular-nums">{latest ? money(Number(latest.invoice_total)) : '$0.00'}</p>
              <p className="mt-1 text-xs text-gray-400">{latest?.sales_date ?? 'No entries'}</p>
            </div>
            <div className="rounded-lg border border-gray-600 bg-gray-900/70 p-3">
              <p className="text-xs text-gray-400">Days reported</p>
              <p className="mt-1 text-lg sm:text-xl font-bold text-white tabular-nums">{rows.length}</p>
              <p className="mt-1 text-xs text-gray-400">{report.report_period_start} – {report.report_period_end}</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400"><CalendarDays className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Source: {report.source_file_name || 'Daily sales report'} · Approved {new Date(report.created_at).toLocaleDateString()}</span></p>
        </>}
    </section>
  );
}
