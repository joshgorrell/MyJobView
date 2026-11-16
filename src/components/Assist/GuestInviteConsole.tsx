import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, UserPlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
type Invite = { invite_id: string; code: string; join_url: string; state: string };
export function GuestInviteConsole({ organizationId }: { organizationId: string }) {
  const [available, setAvailable] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const current = useRef<Invite | null>(null);
  const viewer = useRef<Window | null>(null);
  const epoch = useRef(0);
  const working = useRef(false);
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
  async function create() {
    if (working.current || current.current || !available) return;
    const version = epoch.current; working.current = true; setBusy(true); setError(''); setCopied(false);
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
    <h3 className="flex items-center gap-2 font-semibold text-primary"><UserPlus size={18} />Invite a customer or technician</h3>
    {!available ? <p className="mt-2 text-sm text-muted">Guest invitations will be available after the temporary Windows connection passes its pilot.</p> : !invite ? <>
      <p className="mt-2 text-sm text-muted">Create a one-time code or link. They won’t need an MJV account.</p>
      <button type="button" disabled={busy} onClick={() => void create()} className="mt-3 min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create invitation'}</button>
    </> : <>
      <p className="mt-3 text-sm text-muted">Ask them to visit <strong>{new URL(invite.join_url).origin}/assist</strong> and enter:</p>
      <p className="my-3 break-all font-mono text-2xl font-bold tracking-wide text-primary">{invite.code}</p>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center gap-2 text-sm text-info"><Copy size={16} />{copied ? 'Link copied' : 'Copy invitation link'}</button>
        <button type="button" disabled={busy} onClick={() => void end()} className="inline-flex min-h-11 items-center gap-2 text-sm text-info"><X size={16} />End invitation</button></div>
      <p className="break-all text-xs text-muted">{invite.join_url}</p>
      <p className="mt-3 text-sm text-primary" role="status">{invite.state === 'waiting_for_guest' ? 'Waiting for them to enter the code…' : invite.state === 'waiting_for_computer' ? 'Waiting for them to download, open the app and choose Connect…' : invite.state === 'computer_ready' ? 'Their computer is ready. Open support, then ask them to approve control.' : 'Support window ready. They must approve control on their computer.'}</p>
      {invite.state === 'computer_ready' && <button type="button" disabled={busy} onClick={() => void connect()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-50"><ExternalLink size={16} />Open guest support</button>}
      <p className="mt-3 text-xs text-muted">Keep this MJV page open. Codes can be used once within 10 minutes. End the invitation when finished; sessions last up to one hour.</p>
    </>}
    {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
  </div>;
}
