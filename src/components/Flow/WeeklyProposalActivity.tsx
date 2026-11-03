import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { proposalActivityPath } from '../../lib/proposalActivityLinks';
import { ENGAGEMENT_ACTIONS } from '../../lib/proposalEngagement';

interface ProposalRow {
  proposal_id: string; proposal_number: string; title: string; customer: string;
  bucket: 'engaged' | 'unopened'; visits: number; last_viewed_at: string | null; active_seconds: number;
  sections: { key: string; label: string; seconds: number }[]; clicks: Record<string, number>;
}
interface WeeklyReport {
  period_start: string; period_end: string; timezone: string; report_data: ProposalRow[];
}
function duration(seconds: number) { return seconds >= 60 ? `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}` : `${seconds}s`; }
export function WeeklyProposalActivity({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false); setReport(null);
    void (async () => {
      try {
        const { data, error: failure } = await supabase.rpc('get_weekly_proposal_activity', { p_report_id: reportId });
        if (failure) throw failure;
        if (!cancelled) setReport(data as WeeklyReport | null);
      } catch { if (!cancelled) setError(true); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [reportId, retry]);
  if (loading) return <div className="flex items-center gap-2 py-3 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />Loading Activity…</div>;
  if (error) return <div role="alert" className="py-3 text-sm text-muted">Activity could not be loaded. <button className="underline" onClick={() => setRetry(value => value + 1)}>Retry</button></div>;
  if (!report) return <p className="py-3 text-sm text-muted">This Activity report is unavailable.</p>;
  const date = (value: string, time = false) => new Date(value).toLocaleString('en-US', { timeZone: report.timezone, month: 'short', day: 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}) });
  const groups = [
    { title: 'Engaged proposals', rows: report.report_data.filter(row => row.bucket === 'engaged') },
    { title: 'Sent but not opened', rows: report.report_data.filter(row => row.bucket === 'unopened') },
  ];
  return (
    <div className="min-w-0 space-y-4 border-t border-subtle pt-3" aria-label="Weekly proposal Activity">
      <p className="text-xs text-muted">{date(report.period_start)}–{date(new Date(Date.parse(report.period_end) - 1).toISOString())} · {report.timezone}</p>
      {groups.map(group => group.rows.length > 0 && (
        <section key={group.title} className="min-w-0 space-y-2">
          <h4 className="text-sm font-semibold text-primary">{group.title} ({group.rows.length})</h4>
          {group.rows.map(row => (
            <div key={row.proposal_id} className="min-w-0 space-y-1 rounded-lg border border-subtle bg-elevated p-3">
              <div className="break-words text-sm font-semibold text-primary">{row.customer}</div>
              <div className="break-words text-sm text-muted">{row.proposal_number} · {row.title || 'Proposal'}</div>
              {row.bucket === 'engaged' ? <>
                <div className="text-xs text-muted">{row.visits} visit{row.visits === 1 ? '' : 's'} · {row.active_seconds ? `${duration(row.active_seconds)} approximate active viewing` : 'Active time not reported'}</div>
                {row.last_viewed_at && <div className="text-xs text-muted">Last visit: {date(row.last_viewed_at, true)}</div>}
                {row.sections[0] && <div className="break-words text-xs text-muted">Most viewed: {row.sections[0].label}</div>}
                <div className="flex flex-wrap gap-2 text-xs text-muted">{Object.entries(row.clicks || {}).filter(([key, count]) => Object.prototype.hasOwnProperty.call(ENGAGEMENT_ACTIONS, key) && count > 0).map(([key, count]) => <span key={key}>{ENGAGEMENT_ACTIONS[key as keyof typeof ENGAGEMENT_ACTIONS]} · {count}</span>)}</div>
              </> : <div className="text-xs text-muted">Sent; no recorded opens.</div>}
              <a href={proposalActivityPath(row.proposal_id)} className="inline-block pt-1 text-sm font-medium text-blue-500 underline">View Activity</a>
            </div>
          ))}
        </section>
      ))}
      {!report.report_data.length && <p className="text-sm text-muted">No proposals in this report are currently assigned to you.</p>}
      <p className="text-xs text-muted">Visits are separate sessions. Active time is approximate for visits started that week. Clicks do not mean approval or payment was completed.</p>
    </div>
  );
}
