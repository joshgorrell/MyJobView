import { useEffect, useState } from 'react';
import { Eye, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
interface EmailRecord { id: string; recipient_name: string; recipient_email: string; sender_name: string; reply_to: string; subject: string; variant: string; created_at: string; sent_at: string | null; opened_at: string | null; status: string; proposal_id: string | null; }
const displayDate = (date: string | null) => date ? new Date(date).toLocaleString() : '—';
export default function ProposalCheckHistory({ refreshKey }: { refreshKey: number }) {
  const [records, setRecords] = useState<EmailRecord[]>([]);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  useEffect(() => { const timer = setTimeout(() => { setPage(0); setQuery(search); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    let request = supabase.from('proposal_check_emails').select('id,recipient_name,recipient_email,sender_name,reply_to,subject,variant,created_at,sent_at,opened_at,status,proposal_id').order('created_at', { ascending: false }).range(page * 50, page * 50 + 49);
    const term = query.replace(/[^a-zA-Z0-9@. +\-]/g, '').slice(0, 100).trim();
    if (term) request = request.or(`recipient_name.ilike.%${term}%,recipient_email.ilike.%${term}%`);
    void request.then(({ data, error }) => {
      if (!current) return;
      if (error) { setError('Send history could not load. Please try refreshing.'); setRecords([]); }
      else setRecords((data || []) as EmailRecord[]);
      setLoading(false);
    });
    return () => { current = false; };
  }, [page, query, refresh, refreshKey]);
  useEffect(() => {
    if (!preview) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [preview]);
  async function showEmail(row: EmailRecord) {
    const { data, error } = await supabase.from('proposal_check_emails').select('email_html').eq('id', row.id).single();
    if (error) setError('The saved email could not be loaded.');
    else setPreview({ subject: row.subject, html: data.email_html });
  }
  return <section aria-label="Proposal Check Send History" className="rounded-xl border border-gray-700 bg-gray-800 p-4 sm:p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">Send History</h2><p className="mt-1 text-sm text-gray-400">Proposal check-ins, including emails sent without a linked proposal.</p></div><button type="button" onClick={() => setRefresh(v => v + 1)} disabled={loading} className="min-h-11 flex items-center gap-2 rounded-lg border border-gray-600 px-3 text-gray-200"><RefreshCw className="h-4 w-4" />Refresh</button></div>
    <label className="block"><span className="text-sm text-gray-300">Search customer or email</span><div className="relative mt-2"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-600 bg-gray-900 py-2 pl-10 pr-3 text-white" /></div></label>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {loading ? <p role="status" className="text-gray-400">Loading history…</p> : !records.length ? <p className="text-gray-400">No emails found.</p> : <div className="space-y-3">{records.map(row => <article key={row.id} className="rounded-lg border border-gray-700 bg-gray-900 p-4"><div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-white break-words">{row.recipient_name}</h3><p className="text-sm text-gray-400 break-all">{row.recipient_email}</p></div><div className="flex flex-wrap items-start gap-2"><span className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-200">{row.status === 'sent' ? 'Sent' : row.status === 'failed' ? 'Send failed' : 'Send pending'}</span><span className={`rounded px-2 py-1 text-xs ${row.opened_at ? 'bg-emerald-950 text-emerald-300' : 'bg-gray-800 text-gray-300'}`}>{row.opened_at ? 'Open detected' : 'No open detected'}</span></div></div><p className="mt-3 font-medium text-gray-200 break-words">{row.subject}</p><dl className="mt-3 grid gap-2 text-sm text-gray-400 sm:grid-cols-2"><div><dt className="inline">Sender: </dt><dd className="inline text-gray-200">{row.sender_name} · {row.variant === 'owner' ? 'Owner' : 'Salesperson'}</dd></div><div><dt className="inline">{row.sent_at ? 'Sent: ' : 'Attempted: '}</dt><dd className="inline">{displayDate(row.sent_at || row.created_at)}</dd></div><div><dt className="inline">Replies to: </dt><dd className="inline break-all">{row.reply_to}</dd></div><div><dt className="inline">First open detected: </dt><dd className="inline">{displayDate(row.opened_at)}</dd></div></dl><div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => void showEmail(row)} className="min-h-11 flex items-center gap-2 text-sm text-cyan-300"><Eye className="h-4 w-4" />View Sent Email</button>{row.proposal_id && <a href={`/?tab=proposals&proposalId=${row.proposal_id}`} className="flex min-h-11 items-center text-sm text-cyan-300">Linked Proposal</a>}</div></article>)}</div>}
    <div className="flex items-center justify-between text-sm text-gray-300"><button type="button" disabled={!page || loading} onClick={() => setPage(p => p - 1)} className="min-h-11 disabled:opacity-40">Previous</button><span>Page {page + 1}</span><button type="button" disabled={records.length < 50 || loading} onClick={() => setPage(p => p + 1)} className="min-h-11 disabled:opacity-40">Next</button></div>
    <p className="text-xs text-gray-400">Sent means the email service accepted the message. Open detected means its tracking image loaded; privacy tools may load it automatically, and image blocking may hide an open. Saved previews do not trigger open tracking. History begins with emails sent after this feature is enabled.</p>
    {preview && <div role="dialog" aria-modal="true" aria-label="Saved proposal check email" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"><div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-600 bg-gray-900"><div className="flex items-center justify-between gap-3 p-4"><h3 className="font-semibold text-white">{preview.subject}</h3><button autoFocus type="button" onClick={() => setPreview(null)} className="min-h-11 px-3 text-gray-200">Close</button></div><iframe title="Saved sent email" sandbox="" srcDoc={preview.html} className="h-[650px] max-h-[75vh] w-full bg-white" /></div></div>}
  </section>;
}
