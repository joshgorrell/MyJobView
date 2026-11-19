import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, UserPlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
type Recipient = { id: string; name: string; email: string; type: 'Customer' | 'User' };
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
type Invite = { invite_id: string; code: string; join_url: string; state: string };
export function GuestInviteConsole({ organizationId }: { organizationId: string }) {
  const [available, setAvailable] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [matches, setMatches] = useState<Recipient[]>([]);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [searching, setSearching] = useState(false);
  const [directoryError, setDirectoryError] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const current = useRef<Invite | null>(null);
  const viewer = useRef<Window | null>(null);
  const epoch = useRef(0);
  const working = useRef(false);
  useEffect(() => {
    if (recipient || recipientQuery.trim().length < 2) { setMatches([]); setSearching(false); setDirectoryError(false); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true); setDirectoryError(false);
      const term = recipientQuery.trim().replace(/[%,()\\]/g, '').slice(0,100);
      if (!term) { setMatches([]); setSearching(false); return; }
      try {
        // Contacts use MyJobView's existing RLS tenant boundary; profiles are explicitly organization-scoped.
        const [customers, users] = await Promise.all([
          supabase.from('contacts').select('id,full_name,company_name,contact_name,email,contact_type').in('contact_type', ['person', 'business']).or(`full_name.ilike.%${term}%,company_name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%`).limit(8),
          supabase.from('profiles').select('id,full_name,email').eq('organization_id', organizationId).or(`full_name.ilike.%${term}%,email.ilike.%${term}%`).limit(8),
        ]);
        if (cancelled) return;
        if (customers.error || users.error) setDirectoryError(true);
        const found: Recipient[] = [
          ...(customers.data || []).map(row => ({ id: String(row.id), name: String(row.company_name || row.full_name || row.contact_name || row.email || 'Customer'), email: String(row.email || ''), type: 'Customer' as const })),
          ...(users.data || []).map(row => ({ id: String(row.id), name: String(row.full_name || row.email || 'User'), email: String(row.email || ''), type: 'User' as const })),
        ].filter(row => validEmail(row.email));
        setMatches(found.filter((row, index, rows) => rows.findIndex(other => other.email.toLowerCase() === row.email.toLowerCase()) === index));
      } catch { if (!cancelled) { setMatches([]); setDirectoryError(true); } }
      finally { if (!cancelled) setSearching(false); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [organizationId, recipientQuery, recipient]);
  const selectedEmail = recipient?.email || (validEmail(recipientQuery) ? recipientQuery.trim() : '');
  const inviteText = invite ? `Open this link to get remote support: ${invite.join_url}\n\nClick Download Assist, open the app, and approve the support request. This link can be used once.` : '';
  async function invoke(operation: string, inviteId?: string) {
    const { data, error: failure } = await supabase.functions.invoke('assist-support', { body: { operation, organizationId, ...(inviteId ? { inviteId } : {}) } });
    if (failure || data?.error) throw new Error('Invitation unavailable'); return data;
  }
  async function end() {
    const row = current.current; if (!row || working.current) return;
    const version = epoch.current; working.current = true; setBusy(true); setError(''); viewer.current?.close();
    try { const data = await invoke('invite_end', row.invite_id); if (!data?.ended) throw new Error('Unconfirmed');
      if (version === epoch.current) { current.current = null; viewer.current = null; setInvite(null); }
    } catch { if (version === epoch.current) setError('Ending access could not be confirmed. Retry End invitation.'); }
    finally { if (version === epoch.current) { working.current = false; setBusy(false); } }
  }
  useEffect(() => {
    const version = ++epoch.current; setAvailable(false); setInvite(null); setError(''); setBusy(false); working.current = false;
    void invoke('invite_capability').then(data => { if (version === epoch.current) setAvailable(data?.available === true); }).catch(() => {});
    let polling = false;
    const timer = window.setInterval(() => {
      const row = current.current; if (!row || polling || working.current) return;
      if (viewer.current?.closed) { void end(); return; }
      polling = true;
      void invoke('invite_status', row.invite_id).then(data => {
        if (version !== epoch.current || current.current?.invite_id !== row.invite_id) return;
        const next = { ...row, state: data.state }; current.current = next; setInvite(next);
      }).catch(() => {
        if (version !== epoch.current) return;
        viewer.current?.close(); setError('The invitation is unavailable or has expired. End it and create a new one.');
      }).finally(() => { polling = false; });
    }, 15000);
    return () => {
      epoch.current++; window.clearInterval(timer); viewer.current?.close(); viewer.current = null;
      const row = current.current; current.current = null; if (row) void invoke('invite_end', row.invite_id).catch(() => {});
    };
  }, [organizationId]);
  async function recheckAvailability() {
    if (checkingAvailability || busy) return;
    setCheckingAvailability(true);
    try { const data = await invoke('invite_capability'); setAvailable(data?.available === true); }
    catch { setAvailable(false); }
    finally { setCheckingAvailability(false); }
  }
  async function create() {
    if (working.current || current.current || !available || !selectedEmail) return;
    const version = epoch.current; working.current = true; setBusy(true); setError(''); setCopied(false); setCodeCopied(false);
    try {
      const row = await invoke('invite_create');
      if (version !== epoch.current) { void invoke('invite_end', row.invite_id).catch(() => {}); return; }
      current.current = row; setInvite(row);
    } catch { if (version === epoch.current) setError('Unable to create an invitation. Check Assist availability and try again.'); }
    finally { if (version === epoch.current) { working.current = false; setBusy(false); } }
  }
  async function connect() {
    const row = current.current; if (!row || working.current || viewer.current || row.state !== 'computer_ready') return;
    const windowRef = window.open('about:blank', '_blank'); if (!windowRef) { setError('Allow pop-ups for MJV to open support.'); return; }
    windowRef.opener = null; windowRef.document.body.textContent = 'Preparing remote support…';
    const meta = windowRef.document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; windowRef.document.head.appendChild(meta);
    const version = epoch.current; working.current = true; setBusy(true); setError(''); viewer.current = windowRef;
    try {
      const data = await invoke('invite_connect', row.invite_id); const url = new URL(data.viewer_url);
      if (version !== epoch.current || url.protocol !== 'https:' || url.origin !== data.viewer_origin || url.pathname !== `/mjv-${organizationId.replace(/-/g, '')}/` || url.username || url.password) throw new Error('Invalid viewer');
      windowRef.location.replace(url.href); const next = { ...row, state: data.state }; current.current = next; setInvite(next);
    } catch {
      windowRef.close(); viewer.current = null; void invoke('invite_end', row.invite_id).catch(() => {});
      if (version === epoch.current) { current.current = null; setInvite(null); setError('Unable to open support. Create a new invitation to retry.'); }
    } finally { if (version === epoch.current) { working.current = false; setBusy(false); } }
  }
  async function copy() {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite.join_url); setCopied(true); } catch { setError('Copy the invitation link shown below.'); }
  }
  return <div className="my-5 rounded-lg border border-subtle p-4">
    <h3 className="flex items-center gap-2 font-semibold text-primary"><UserPlus size={18} />Start Support Session</h3>
    {!invite && <div className="relative mt-3">
      <label htmlFor="assist-recipient" className="block text-sm font-medium text-primary">Customer, user, or email</label>
      <input id="assist-recipient" type="search" autoComplete="off" value={recipient?.name ? `${recipient.name} (${recipient.email})` : recipientQuery} onChange={event => { setRecipient(null); setRecipientQuery(event.target.value); }} placeholder="Search customers, users, or enter an email…" className="mt-2 w-full rounded-lg border border-subtle bg-surface px-3 py-3 text-primary" />
      {!recipient && matches.length > 0 && <div role="listbox" aria-label="Matching recipients" className="mt-1 max-h-52 overflow-auto rounded-lg border border-subtle bg-surface">
        {matches.map(match => <button type="button" role="option" aria-selected={false} key={match.type + match.id} onClick={() => { setRecipient(match); setRecipientQuery(match.email); setMatches([]); }} className="flex w-full items-center justify-between gap-3 border-b border-subtle px-3 py-2 text-left text-sm text-primary hover:bg-blue-500/10"><span className="min-w-0 truncate">{match.name} · {match.email}</span><span className="shrink-0 text-xs text-muted">{match.type}</span></button>)}
      </div>}
      {!recipient && searching && <p className="mt-1 text-xs text-muted">Searching…</p>}
      {!recipient && directoryError && <p className="mt-1 text-xs text-muted">Some directory results could not be loaded. You can still enter an email address.</p>}
    </div>}
    {!available ? <div className="mt-2"><p className="text-sm text-muted">Invitation codes are not active yet. Remote support must pass the Windows pilot before sessions can be started.</p><button type="button" disabled={checkingAvailability || busy} onClick={() => void recheckAvailability()} className="mt-2 min-h-11 text-sm font-medium text-info disabled:opacity-50">{checkingAvailability ? 'Checking…' : 'Check availability again'}</button></div> : !invite ? <>
      <p className="mt-2 text-sm text-muted">Create a one-time code or link. They won’t need an MJV account.</p>
      <button type="button" disabled={busy || !selectedEmail} onClick={() => void create()} className="mt-3 min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create invitation'}</button>
    </> : <>
      <p className="mt-3 text-sm text-muted">Send this one-time link to <strong>{selectedEmail}</strong>. It opens Assist with the code already filled in.</p>
      <div className="my-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"><Copy size={16} />{copied ? 'Link copied' : 'Copy invitation link'}</button>
        <a href={`mailto:${encodeURIComponent(selectedEmail)}?subject=${encodeURIComponent('Remote support invitation')}&body=${encodeURIComponent(inviteText)}`} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-info">Open email draft</a>
      </div>
      <p className="break-all text-xs text-muted">{invite.join_url}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-info">Share a code by phone</summary>
        <p className="mt-2 text-sm text-muted">Ask them to visit <strong>{new URL(invite.join_url).origin}/assist</strong> and enter this code.</p>
      <div className="my-3 flex flex-wrap items-center gap-3"><p className="break-all font-mono text-2xl font-bold tracking-wide text-primary">{invite.code}</p><button type="button" onClick={() => void navigator.clipboard.writeText(invite.code).then(() => setCodeCopied(true)).catch(() => setError('Unable to copy code.'))} className="inline-flex min-h-11 items-center gap-2 text-sm text-info"><Copy size={16} />{codeCopied ? 'Code copied' : 'Copy code'}</button></div>
      </details>
      <button type="button" disabled={busy} onClick={() => void end()} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-info"><X size={16} />End invitation</button>
      <p className="mt-3 text-sm text-primary" role="status">{invite.state === 'waiting_for_guest' ? 'Waiting for the customer to open Assist…' : invite.state === 'waiting_for_computer' ? 'Waiting for them to download, open the app and choose Connect…' : invite.state === 'computer_ready' ? 'Their computer is ready. Open support, then ask them to approve control.' : 'Support window ready. They must approve control on their computer.'}</p>
      {invite.state === 'computer_ready' && <button type="button" disabled={busy} onClick={() => void connect()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-50"><ExternalLink size={16} />Open guest support</button>}
      <p className="mt-3 text-xs text-muted">Keep this MJV page open. Codes can be used once within 10 minutes. End the invitation when finished; sessions last up to one hour.</p>
    </>}
    {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
  </div>;
}
