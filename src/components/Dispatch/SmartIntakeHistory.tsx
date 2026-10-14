import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Inbox, Mail, MessageSquare, RefreshCw, Search, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { listIntakeHistory } from '../../lib/smart-intake/history-query';
import { loadIntakeTimeline } from '../../lib/smart-intake/history-timeline';
import { listIntakeAttachmentReviews, type IntakeAttachmentReview } from '../../lib/smart-intake/attachment-review-query';

type Row = Awaited<ReturnType<typeof listIntakeHistory>>[number];
type Timeline = Awaited<ReturnType<typeof loadIntakeTimeline>>;

const ATTENTION_STATUSES = ['received','analyzing','awaiting_customer','awaiting_employee','needs_review','failed_retryable'];

export function SmartIntakeHistory() {
  const { tenant } = useTenant();
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [channel, setChannel] = useState<'all'|'email'|'sms'|'mms'>('all');
  const [view, setView] = useState<'attention'|'all'>('attention');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Timeline | null>(null);
  const [detailError, setDetailError] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [attachments, setAttachments] = useState<IntakeAttachmentReview[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const inspectionVersion = useRef(0);
  const orgId = tenant?.organizationId && profile?.organization_id === tenant.organizationId ? tenant.organizationId : profile?.organization_id && !tenant ? profile.organization_id : null;

  const reload = useCallback(async () => {
    if (!orgId || authLoading || !profile) return;
    setBusy(true);
    setError('');
    try {
      const result = await listIntakeHistory(supabase, { organizationId: orgId, search, channel: channel === 'all' ? undefined : channel, status: status === 'all' ? undefined : status, statuses: view === 'attention' && status === 'all' ? ATTENTION_STATUSES : undefined, from: dateFrom || undefined, to: dateTo || undefined, limit: 100 });
      setRows(result);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Unable to load intake history');
    } finally { setBusy(false); }
  }, [orgId, authLoading, profile, search, channel, status, dateFrom, dateTo, view]);

  useEffect(() => { void reload(); }, [reload]);

  async function inspect(id: string) {
    if (!orgId) return;
    const version = ++inspectionVersion.current;
    setSelected(null);
    setAttachments([]);
    setAttachmentError('');
    setDetailError('');
    setLoadingDetail(true);
    try {
      const timeline = await loadIntakeTimeline(supabase, orgId, id);
      if (version !== inspectionVersion.current) return;
      setSelected(timeline);
      try {
        const files = await listIntakeAttachmentReviews(supabase, orgId, id);
        if (version === inspectionVersion.current) setAttachments(files);
      } catch {
        if (version === inspectionVersion.current) setAttachmentError('Attachment information is not available yet.');
      }
    }
    catch (e) { if (version === inspectionVersion.current) setDetailError(e instanceof Error ? e.message : 'Unable to load message history'); }
    finally { if (version === inspectionVersion.current) setLoadingDetail(false); }
  }

  const visible = rows;
  return (
    <section className="min-w-0 space-y-4" aria-label="Smart Intake history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold text-white">Smart Intake</h2><p className="text-sm text-gray-400">Investigate every message received by your dealer's intake channel.</p></div>
        <button type="button" onClick={() => void reload()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-gray-200 hover:bg-gray-800"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['attention','all'] as const).map(tab => <button key={tab} type="button" onClick={() => { setView(tab); setStatus('all'); inspectionVersion.current++; setSelected(null); setAttachments([]); }} aria-pressed={view === tab} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${view === tab ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}>{tab === 'attention' ? 'Needs Attention' : 'All Activity'}</button>)}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" /><span className="sr-only">Search intake history</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sender, recipient or subject" className="w-full min-h-11 rounded-lg border border-gray-700 bg-gray-900 pl-10 pr-3 text-white" /></label>
        <label className="flex items-center gap-2 text-sm text-gray-300">Channel <select value={channel} onChange={e => setChannel(e.target.value as typeof channel)} className="min-h-11 rounded-lg border border-gray-700 bg-gray-900 px-3 text-white"><option value="all">All</option><option value="email">Email</option><option value="sms">SMS</option><option value="mms">MMS</option></select></label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm text-gray-300">Status<select value={status} onChange={e => setStatus(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-white"><option value="all">All statuses</option>{(view === 'attention' ? ATTENTION_STATUSES : ['received','analyzing','awaiting_customer','awaiting_employee','needs_review','ready','processed','duplicate_linked','dismissed','failed_retryable']).map(value => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
        <label className="text-sm text-gray-300">From<input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-white" /></label>
        <label className="text-sm text-gray-300">Through<input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-white" /></label>
      </div>
      {!orgId && <p className="rounded-lg border border-amber-700 p-3 text-amber-200">Dealer identity is not available. History cannot be loaded.</p>}
      {error && <p role="alert" className="rounded-lg border border-red-700 p-3 text-red-200"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</p>}
      {busy && <p className="text-sm text-gray-400">Loading intake history…</p>}
      {!busy && !error && orgId && visible.length === 0 && <div className="rounded-xl border border-gray-700 p-8 text-center text-gray-400"><Inbox className="mx-auto mb-2 h-7 w-7" />No matching intake records. This does not prove a customer never sent a message.</div>}
      <div className="space-y-2">{visible.map(row => <button type="button" key={row.id} onClick={() => void inspect(row.id)} className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-gray-700 bg-gray-900 p-4 text-left hover:border-blue-500">
        {row.channel === 'email' ? <Mail className="mt-1 h-5 w-5 shrink-0 text-blue-400" /> : <MessageSquare className="mt-1 h-5 w-5 shrink-0 text-blue-400" />}
        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-white">{row.subject || '(No subject)'}</span><span className="block truncate text-sm text-gray-400">{row.source_address}</span><span className="mt-1 block text-xs text-gray-500">{new Date(row.created_at).toLocaleString()} · {row.channel.toUpperCase()} · {row.status.replaceAll('_',' ')}</span></span><ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>)}</div>
      {(loadingDetail || detailError || selected) && <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 sm:p-6" aria-label="Intake investigation">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-white">Message investigation</h3><button type="button" className="min-h-11 px-3 text-sm text-gray-300" onClick={() => {inspectionVersion.current++;setSelected(null);setAttachments([]);setDetailError('');}}>Close</button></div>
        {loadingDetail && <p className="text-gray-400">Loading timeline…</p>}
        {detailError && <p role="alert" className="text-red-300">{detailError}</p>}
        {selected && <div className="space-y-3 text-sm text-gray-200">
          <p><strong>From:</strong> {selected.item.source_address}</p><p><strong>To:</strong> {selected.item.destination_address}</p><p><strong>Subject:</strong> {selected.item.subject || '(No subject)'}</p>
          <div className="whitespace-pre-wrap break-words rounded-lg bg-gray-800 p-3">{selected.item.raw_body?.trim() ? selected.item.raw_body : '(Blank message body)'}</div>
          <p><strong>Status:</strong> {selected.item.status} · <strong>Classification:</strong> {selected.item.classification}</p>
          <p><strong>Linked service request:</strong> {selected.item.service_request_id || 'None'}</p>
          <h4 className="font-semibold">Attachments</h4>
          {attachmentError && <p role="status" className="text-amber-300">{attachmentError}</p>}
          {!attachmentError && attachments.length === 0 && <p className="text-gray-400">No attachments available for review.</p>}
          {attachments.map(file => <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3">
            <div className="min-w-0"><p className="break-all font-medium">{file.original_filename || "Unnamed attachment"}</p><p className="text-xs text-gray-400">{file.byte_size === null ? "Size unknown" : `${(file.byte_size / 1024).toFixed(1)} KB`} · {file.scan_status === "blocked" || file.scan_status === "failed" ? "Attachment unavailable" : file.disposition === "pending" ? "Awaiting review" : file.disposition.replaceAll("_", " ")}</p></div>
            <span className="text-xs text-gray-400">Expires {new Date(file.expires_at).toLocaleDateString()}</span>
          </div>)}
          <p className="text-xs text-gray-400">Attachment actions will be available once secure review is enabled.</p>
          <h4 className="font-semibold">Processing and delivery timeline</h4>
          {[...selected.messages.map(x => ({id:x.id,at:x.created_at,label:`Message: ${x.direction}`})),...selected.events.map(x => ({id:x.id,at:x.created_at,label:`${x.actor_type}: ${x.event_type}`})),...selected.attempts.map(x => ({id:x.id,at:x.created_at,label:`Attempt ${x.attempt_number}: ${x.outcome}${x.reason_code ? ' ('+x.reason_code+')' : ''}`})),...selected.delivery.map(x => ({id:x.id,at:x.occurred_at,label:`Delivery: ${x.event_kind} ${x.delivery_status ?? ''}`}))].sort((a,b) => a.at.localeCompare(b.at)).map(x => <div key={x.id} className="border-l-2 border-blue-500 py-1 pl-3"><span className="text-xs text-gray-400">{new Date(x.at).toLocaleString()}</span><p>{x.label}</p></div>)}
        </div>}
      </div>}
    </section>
  );
}
