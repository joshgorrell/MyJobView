import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { markActivitySeen } from '../../hooks/useActivityCounts';

type Kind = 'job' | 'proposal' | 'lost';
type Item = { id: string; kind: Kind; customer: string; answer: string; note: string; at: string; target: 'dashboard' | 'proposal' | 'lost'; emailId?: string; };
type Props = { onNavigate: (tab: 'dashboard' | 'proposal' | 'lost') => void; canJob: boolean; canProposal: boolean; canLost: boolean };
const kindName: Record<Kind, string> = { job: 'Job Review', proposal: 'Proposal Check', lost: 'Lost Opportunity' };
const shortDate = (date: string) => new Date(date).toLocaleString();

export default function FeedbackInbox({ onNavigate, canJob, canProposal, canLost }: Props) {
  const { profile } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const org = profile?.organization_id;
  const userId = profile?.id;
  const load = useCallback(async () => {
    if (!org || !userId) return;
    setLoading(true);
    setError('');
    try {
      // Resolve organization-scoped parent records before loading private responses.
      // RLS still applies, but explicit parent IDs prevent cross-tenant inbox aggregation.
      const [reads, baselines, jobs, emails, requests] = await Promise.all([
        supabase.from('activity_notification_reads').select('activity_id').eq('user_id', userId).eq('activity_type', 'feedback'),
        supabase.from('activity_notification_baselines').select('started_at').eq('user_id', userId).eq('activity_type', 'feedback').maybeSingle(),
        canJob ? supabase.from('customer_satisfaction').select('id,customer_name,rating,comment,responded_at').eq('organization_id', org).not('responded_at', 'is', null).order('responded_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
        canProposal ? supabase.from('proposal_check_reporting').select('id,recipient_name,recipient_email').limit(500) : Promise.resolve({ data: [], error: null }),
        canLost ? supabase.from('review_requests').select('id,recipient_name,recipient_email').eq('organization_id', org).eq('request_type', 'lost_opportunity').limit(500) : Promise.resolve({ data: [], error: null }),
      ]);
      if ([reads, baselines, jobs, emails, requests].some(result => result.error)) throw new Error('Unable to load some feedback responses.');
      const emailIds = (emails.data || []).map(row => row.id);
      const requestIds = (requests.data || []).map(row => row.id);
      const [proposals, lost] = await Promise.all([
        canProposal && emailIds.length ? supabase.from('proposal_check_events').select('id,email_id,choice,message,created_at').eq('kind', 'message').in('email_id', emailIds).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
        canLost && requestIds.length ? supabase.from('lost_review_responses').select('request_id,reasons,message,created_at').in('request_id', requestIds).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      ]);
      if (proposals.error || lost.error) throw new Error('Unable to load submitted feedback.');
      const proposalEvents = proposals.data || [];
      const emailNames = new Map((emails.data || []).map(row => [row.id, row.recipient_name || row.recipient_email || 'Customer']));
      const requestNames = new Map((requests.data || []).map(row => [row.id, row.recipient_name || row.recipient_email || 'Customer']));
      const baselineAt = baselines.data?.started_at ? Date.parse(baselines.data.started_at) : Number.POSITIVE_INFINITY;
      const all: Item[] = [
        ...(jobs.data || []).map(row => ({ id: row.id, kind: 'job' as const, customer: row.customer_name || 'Customer', answer: row.rating != null ? String(row.rating) : 'Feedback submitted', note: row.comment || '', at: row.responded_at!, target: 'dashboard' })),
        ...proposalEvents.map(row => ({ id: row.id, kind: 'proposal' as const, customer: emailNames.get(row.email_id) || 'Customer', answer: row.choice || 'Written response', note: row.message || '', at: row.created_at, target: 'proposal', emailId: row.email_id })),
        ...(lost.data || []).filter(row => requestNames.has(row.request_id)).map(row => ({ id: row.request_id, kind: 'lost' as const, customer: requestNames.get(row.request_id) || 'Customer', answer: Array.isArray(row.reasons) ? row.reasons.join(', ') : 'Feedback submitted', note: row.message || '', at: row.created_at, target: 'lost' })),
      ];
      all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      setItems(all.filter(item => Number.isFinite(Date.parse(item.at))).slice(0, 100));
      setSeen(new Set([...((reads.data || []).map(row => row.activity_id)), ...all.filter(item => Date.parse(item.at) <= baselineAt).map(item => item.id)]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load feedback.');
    } finally {
      setLoading(false);
    }
  }, [org, userId, canJob, canProposal, canLost]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener('activity:seen', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { window.removeEventListener('activity:seen', refresh); window.clearInterval(timer); };
  }, [load]);
  const visible = onlyNew ? items.filter(item => !seen.has(item.id)) : items;
  const newCount = items.filter(item => !seen.has(item.id)).length;
  const open = async (item: Item) => {
    if (userId && org && !seen.has(item.id)) {
      try {
        await markActivitySeen(userId, org, 'feedback', item.id);
        setSeen(current => new Set([...current, item.id]));
      } catch (e) { console.error('Could not mark feedback as viewed', e); }
    }
    if (item.kind === 'proposal' && item.emailId) {
      const url = new URL(window.location.href);
      url.searchParams.set('proposalCheckEmailId', item.emailId);
      url.searchParams.set('proposalCheckEventId', item.id);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    onNavigate(item.target);
  };
  return <section aria-label="Customer feedback inbox" className="space-y-3 rounded-xl border border-gray-700 bg-gray-800 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-white">Customer Feedback Inbox</h2><p className="text-sm text-gray-400">Selected answers and written comments from all three programs.</p></div>
      <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-600 px-3 text-sm text-gray-200"><RefreshCw size={16}/> Refresh</button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <span className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-white">{newCount} new</span>
      <span className="text-sm text-gray-400">{items.length} recent responses</span>
      <label className="ml-auto flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={onlyNew} onChange={event => setOnlyNew(event.target.checked)}/> New only</label>
    </div>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {loading && !items.length && <p className="text-sm text-gray-400">Loading feedback…</p>}
    {!loading && !visible.length && <p className="text-sm text-gray-400">{onlyNew ? 'No new feedback.' : 'No customer feedback received yet.'}</p>}
    <div className="space-y-2">
      {visible.map(item => <button type="button" key={item.kind + item.id} onClick={() => void open(item)} className="w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-left hover:border-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
        <div className="flex flex-wrap items-center gap-2">
          {!seen.has(item.id) && <span className="rounded bg-blue-700 px-2 py-0.5 text-xs font-semibold text-white">New</span>}
          <span className="font-semibold text-white">{item.customer}</span>
          <span className="text-xs text-blue-300">{kindName[item.kind]}</span>
          <span className="ml-auto text-xs text-gray-400">{shortDate(item.at)}</span>
        </div>
        <p className="mt-2 text-sm text-gray-200">Selected: {item.answer}</p>
        {item.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-300">{item.note}</p>}
      </button>)}
    </div>
    <p className="text-xs text-gray-500">Showing up to 100 recent responses. Open a program to see its full history, attachments and email tracking.</p>
  </section>;
}
