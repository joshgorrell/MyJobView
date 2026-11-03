import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { parseCompetition, parsePerformanceReport, type CompetitionResult, type PerformanceReport, type PerformanceEvent } from '../../lib/salesPerformance';
const InvoiceDetailModal = lazy(() => import('../Invoices/InvoiceDetailModal').then(m => ({ default: m.InvoiceDetailModal })));
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
interface Props { repId?: string | null; onOrderClick?: (id: string) => void; }
export function MonthlySalesCompetition({ repId, onOrderClick }: Props) {
  const [competition, setCompetition] = useState<CompetitionResult | null>(null);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [competitionError, setCompetitionError] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [period, setPeriod] = useState('month');
  const [page, setPage] = useState(0);
  const [showEvents, setShowEvents] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [invoice, setInvoice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false; setCompetition(null); setCompetitionError(false);
    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_current_month_sales_competition');
        if (error) throw error;
        const result = parseCompetition(data); if (!cancelled) setCompetition(result);
      } catch { if (!cancelled) setCompetitionError(true); }
    }
    void load(); return () => { cancelled = true; };
  }, [refresh]);
  useEffect(() => {
    let cancelled = false; setReport(null); setReportError(false);
    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_sales_performance', { p_period: period, ...(repId === undefined ? {} : { p_rep_id: repId }), p_offset: page * 50, p_limit: 50 });
        if (error) throw error;
        const result = parsePerformanceReport(data); if (!cancelled) setReport(result);
      } catch { if (!cancelled) setReportError(true); }
    }
    void load(); return () => { cancelled = true; };
  }, [period, page, refresh, repId]);
  function open(event: PerformanceEvent) { if (event.record_kind === 'order') onOrderClick?.(event.source_id); else setInvoice(event.source_id); }
  return <section className="rounded-xl border border-gray-700 bg-gray-800 p-4 space-y-4" aria-label="Sales performance and competition">
    <div className="flex flex-wrap justify-between items-start gap-3"><div><h3 className="font-semibold text-white">Tracked Sales Performance</h3><p className="text-xs text-gray-300">Booked projects and billed service, retail, monitoring and VIP sales · before tax</p></div>
      <button onClick={() => setRefresh(n => n + 1)} className="text-sm text-blue-300 hover:underline">Refresh performance</button></div>
    <label className="flex flex-wrap items-center gap-2 text-sm text-gray-200">Performance period<select aria-label="Performance period" value={period} onChange={e => { setPeriod(e.target.value); setPage(0); }} className="rounded-lg border border-gray-600 bg-gray-900 p-2 text-white"><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option><option value="yoy">Year over year</option><option value="all">All tracked history</option></select></label>
    {reportError ? <p role="alert" className="text-sm text-red-300">Performance totals could not be loaded. Refresh to retry.</p> : !report ? <p className="text-sm text-gray-300">Loading performance…</p> : <>
      <button onClick={() => setShowEvents(v => !v)} aria-expanded={showEvents} className="w-full text-left rounded-lg border border-blue-700 bg-blue-900/20 p-3 hover:border-blue-400"><span className="block text-xs text-gray-300">{repId === null ? 'Company performance' : 'Selected salesperson performance'}</span><span className="block text-2xl font-bold text-white">{money(report.total)}</span><span className="text-sm text-blue-300">{report.count} credit events · View records</span></button>
      {period !== 'all' && <p className="text-xs text-gray-300">Same elapsed prior {period === 'month' ? 'month' : period === 'quarter' ? 'quarter' : 'year'}: {money(report.previousTotal)}</p>}
      {report.unassignedTotal !== null && <p className="text-xs text-gray-300">Included company credit without a verified salesperson: {money(report.unassignedTotal)}</p>}
      <p className="text-xs text-gray-300">Tracking from {new Date(report.trackingSince).toLocaleDateString('en-US', { timeZone: report.timezone })}. Earlier sales remain in the existing reports. Performance credit is separate from commissions.</p>
      {showEvents && <div className="space-y-2" aria-label="Performance credit records">{report.events.length === 0 && <p className="text-sm text-gray-300">No credit events in this period.</p>}{report.events.map(event => <button key={event.id} onClick={() => open(event)} className="w-full text-left rounded-lg bg-gray-900/60 p-3 flex flex-wrap items-start justify-between gap-2 hover:bg-gray-700"><span className="min-w-0 text-sm text-white break-words">{event.customer_name}<span className="block text-xs text-gray-300">{event.source_type.replace(/_/g, ' ')} · {new Date(event.effective_at).toLocaleDateString('en-US', { timeZone: report.timezone })}{event.adjustment_of_id ? ' · linked adjustment' : ''}</span></span><span className="font-semibold text-white">{money(event.net_amount)}</span></button>)}<div className="flex flex-wrap justify-between gap-3"><button disabled={page === 0} onClick={() => setPage(n => n - 1)} className="text-blue-300 disabled:opacity-40">Previous credit records</button><button disabled={(page + 1) * 50 >= report.count} onClick={() => setPage(n => n + 1)} className="text-blue-300 disabled:opacity-40">Next credit records</button></div></div>}
    </>}
    <div className="border-t border-gray-700 pt-4"><h3 className="text-sm font-semibold text-white">Monthly Sales Competition</h3><p className="text-xs text-gray-300 mb-3">Current local month only · independent of the performance period above</p>
      {competitionError ? <p role="alert" className="text-sm text-red-300">Monthly standings could not be loaded. Refresh to retry.</p> : !competition ? <p className="text-xs text-gray-300">Loading standings…</p> : <div className="space-y-2">{competition.leaderboard.length === 0 && <p className="text-xs text-gray-300">No active sales reps found.</p>}{competition.leaderboard.map((entry, i) => <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${entry.isCurrentUser ? 'bg-blue-900/40 border border-blue-600' : 'bg-gray-900/60'}`}><span className="text-sm text-gray-300">#{entry.rank}</span><span className="flex-1 min-w-0 truncate text-sm text-white">{entry.repDisplayName}</span><span className="text-sm font-semibold text-white">{money(entry.monthlyTotal)}</span></div>)}</div>}
    </div>
    {invoice && <Suspense fallback={<p className="text-sm text-gray-300">Loading invoice…</p>}><InvoiceDetailModal invoiceId={invoice} readonly onClose={() => setInvoice(null)} onPaymentRecorded={() => setInvoice(null)} /></Suspense>}
  </section>;
}
