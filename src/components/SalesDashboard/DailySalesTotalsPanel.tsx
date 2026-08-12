import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileUp, RefreshCw, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface DailySalesTotalsPanelProps {
  repId: string | null;
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

export function DailySalesTotalsPanel({ repId, onUpdateReport }: DailySalesTotalsPanelProps) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<DailyTotalRow[]>([]);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadTotals = useCallback(async () => {
    if (!profile?.organization_id || !repId) return;
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
      const { data: totalData, error: totalError } = await supabase.from('sales_daily_totals').select('sales_date, invoice_total, invoice_count').eq('organization_id', profile.organization_id).eq('sales_rep_id', repId).gte('sales_date', reportData.report_period_start).lte('sales_date', reportData.report_period_end).order('sales_date', { ascending: false });
      if (totalError) throw totalError;
      setRows((totalData ?? []) as DailyTotalRow[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile?.organization_id, repId]);

  useEffect(() => { void loadTotals(); }, [loadTotals]);

  const currentThrough = useMemo(() => rows.reduce((sum, row) => sum + Number(row.invoice_total), 0), [rows]);
  const latest = rows[0];

  return <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"><div><div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-700" /><h2 className="text-base font-semibold text-gray-900">Current sales from daily reports</h2></div><p className="text-sm text-gray-600 mt-1">See reported sales now instead of waiting for month-end totals.</p></div><div className="flex items-center gap-2">{onUpdateReport && <button onClick={onUpdateReport} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"><FileUp className="w-3.5 h-3.5" /> Update report</button>}<button onClick={() => void loadTotals()} className="rounded-lg border border-blue-200 bg-white p-2 text-blue-700 hover:bg-blue-100" title="Refresh daily totals"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div></div>{loading ? <p className="mt-5 text-sm text-gray-500">Loading daily totals…</p> : error ? <p className="mt-5 text-sm text-red-700">Daily totals could not be loaded. Try refreshing.</p> : !report ? <p className="mt-5 text-sm text-gray-600">No approved daily report is available yet.</p> : <><div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5"><div className="rounded-xl bg-white border border-blue-100 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Current through</p><p className="mt-1 text-2xl font-bold text-gray-900">{money(currentThrough)}</p><p className="text-xs text-gray-500 mt-1">{report.report_period_end}</p></div><div className="rounded-xl bg-white border border-blue-100 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Latest reported day</p><p className="mt-1 text-2xl font-bold text-gray-900">{latest ? money(Number(latest.invoice_total)) : '$0.00'}</p><p className="text-xs text-gray-500 mt-1">{latest?.sales_date ?? 'No daily entries'}</p></div><div className="rounded-xl bg-white border border-blue-100 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Days reported</p><p className="mt-1 text-2xl font-bold text-gray-900">{rows.length}</p><p className="text-xs text-gray-500 mt-1">{report.report_period_start} to {report.report_period_end}</p></div></div><div className="mt-4 flex items-center gap-2 text-xs text-gray-500"><CalendarDays className="w-3.5 h-3.5" /> Source: {report.source_file_name || 'Daily sales report'} · Approved {new Date(report.created_at).toLocaleDateString()}</div></>}</section>;
}
