import { FormEvent, useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
const CODE_ALPHABET = /^[2-9A-HJ-NP-Z]{12}$/;
function normalizeSupportCode(input: string) {
  const compact = input.toUpperCase().replace(/[-\s]/g, '').slice(0, 12);
  return compact.match(/.{1,4}/g)?.join('-') || '';
}
function validSupportCode(input: string) {
  return CODE_ALPHABET.test(input.replace(/-/g, ''));
}
type Claim = { invite_id: string; claim_token: string; download_url: string; state: string; expires_at: string };
export default function AssistGuestPage({ initialCode = '' }: { initialCode?: string }) {
  const { tenant, loading, error: tenantError } = useTenant();
  const [code, setCode] = useState(() => normalizeSupportCode(initialCode));
  const [architecture, setArchitecture] = useState<'x64' | 'arm64'>('x64');
  const [claim, setClaim] = useState<Claim | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [ending, setEnding] = useState(false);
  const active = useRef<Claim | null>(null);
  const pending = useRef(false);
  const epoch = useRef(0);
  async function invoke(operation: string, row?: Claim) {
    const { data, error: failure } = await supabase.functions.invoke('assist-guest', { body: { operation, ...(row ? { inviteId: row.invite_id, claimToken: row.claim_token } : { code, architecture }) } });
    if (failure || data?.error) throw new Error('Unavailable'); return data;
  }
  useEffect(() => {
    const version = ++epoch.current;
    // Keep invite secrets out of subsequent navigation, copied URLs and referrers.
    if (window.location.hash.startsWith('#code=')) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    let polling = false;
    const timer = window.setInterval(() => {
      const row = active.current; if (!row || polling) return; polling = true;
      void invoke('status', row).then(data => {
        if (version !== epoch.current || active.current?.invite_id !== row.invite_id) return;
        const next = { ...row, state: data.state, expires_at: data.expires_at }; active.current = next; setClaim(next); setError('');
      }).catch(() => {
        if (version !== epoch.current) return;
        setError('This session is unavailable or has ended. Ask your support person to check it.');
        if (Date.now() >= Date.parse(row.expires_at)) { active.current = null; setClaim(null); setEnded(true); }
      }).finally(() => { polling = false; });
    }, 10000);
    return () => { epoch.current++; window.clearInterval(timer); const row = active.current; active.current = null; if (row) void invoke('end', row).catch(() => {}); };
  }, []);
  async function join(event: FormEvent) {
    event.preventDefault(); if (pending.current || !tenant || tenantError || !validSupportCode(code)) return;
    pending.current = true; setBusy(true); setError(''); const version = epoch.current;
    let issued: Claim | null = null;
    try { const data = await invoke('redeem'); issued = data;
      if (version !== epoch.current) { void invoke('end', data).catch(() => {}); return; }
      const url = new URL(data.download_url);
      if (url.protocol !== 'https:' || url.pathname !== `/mjv-${tenant.organizationId.replace(/-/g, '')}/meshagents` || url.username || url.password || url.searchParams.get('installflags') !== '1' || url.searchParams.get('id') !== (architecture === 'arm64' ? '43' : '4')) throw new Error('Invalid download');
      active.current = data; setClaim(data); setCode('');
    } catch { if (issued) void invoke('end', issued).catch(() => {}); if (version === epoch.current) setError('We couldn’t use that code. Check it with your support person, or ask for a new one.'); }
    finally { if (version === epoch.current) { pending.current = false; setBusy(false); } }
  }
  async function end() {
    const row = active.current; if (!row || pending.current) return;
    pending.current = true; setBusy(true); setEnding(true); setError('');
    try { const result = await invoke('end', row); if (!result?.ended) throw new Error('Unconfirmed'); active.current = null; setClaim(null); setEnded(true); }
    catch { setError('Please close the support app to disconnect. You can retry ending the session here.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="theme-workspace min-h-screen bg-workspace px-4 py-10 sm:py-16">
    <div className="mx-auto w-full max-w-lg rounded-xl border border-subtle bg-surface p-6 shadow-sm sm:p-8">
      <header className="mb-6 flex flex-col items-center text-center">
        {tenant?.logoUrl ? <img src={tenant.logoUrl} alt={tenant.organizationName || 'Your support provider'} className="mb-4 h-auto max-h-32 w-auto max-w-full object-contain" /> : <h1 className="mb-4 text-2xl font-bold text-primary">{tenant?.organizationName || 'Remote support'}</h1>}
        <img src="/images/myjobview-assist.png" alt="MyJobView Assist" width={2172} height={724} className="h-auto w-36 max-w-full object-contain" />
        <p className="mt-3 text-sm text-muted">Secure remote support</p>
      </header>
      {loading ? <p className="text-muted" role="status">Loading support…</p> : tenantError || !tenant ? <p className="text-primary" role="alert">Open the support address provided by your support person.</p> : ended ? <><h2 className="font-semibold text-primary">Session ended</h2><p className="mt-3 text-muted">Close the support app. If you need more help, ask your support person for a new code.</p></> : !claim ? <form onSubmit={event => void join(event)}>
        <p className="mb-5 text-primary">Enter the code your support person gave you.</p>
        <label htmlFor="assist-code" className="mb-2 block text-sm font-medium text-primary">Support code</label>
        <input id="assist-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={24} value={code} onChange={event => setCode(normalizeSupportCode(event.target.value))} className="min-h-12 w-full rounded-lg border border-subtle bg-workspace px-3 font-mono text-lg uppercase text-primary" placeholder="XXXX-XXXX-XXXX" required />
        <label htmlFor="assist-architecture" className="mb-2 mt-4 block text-sm font-medium text-primary">Computer type</label>
        <select id="assist-architecture" disabled={busy} value={architecture} onChange={event => setArchitecture(event.target.value as 'x64' | 'arm64')} className="min-h-12 w-full rounded-lg border border-subtle bg-workspace px-3 text-primary"><option value="x64">Windows — Intel / AMD (64-bit)</option><option value="arm64">Windows — ARM64 / Snapdragon (pilot)</option></select>
        <button type="submit" disabled={busy || !validSupportCode(code)} className="mt-4 min-h-12 w-full rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">{busy ? 'Checking…' : 'Continue'}</button>
        <p className="mt-4 text-xs text-muted">No MJV account or password needed. Only continue with someone you know and trust.</p>
      </form> : <>
        <h2 className="text-lg font-semibold text-primary">Let’s connect your computer</h2>
        <ol className="my-5 list-inside list-decimal space-y-4 text-primary"><li>Download the support app below.</li><li>Open the downloaded file and choose <strong>Connect</strong>.</li><li>Approve the request to let your support person help.</li></ol>
        {!ending && <a href={claim.download_url} rel="noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-semibold text-white"><Download size={18} />Download support app</a>}
        <p className="mt-3 text-xs text-muted">For Windows {architecture === 'arm64' ? 'ARM64' : 'Intel / AMD 64-bit'}. Keep this page and the support app open. You can close the app at any time to disconnect.</p>
        <p className="mt-5 text-sm text-primary" role="status">{claim.state === 'support_window_ready' ? 'Your support person has opened support. Approve the request on your computer.' : claim.state === 'computer_ready' ? 'Your computer is ready. Waiting for your support person…' : 'Waiting for you to open the app and choose Connect…'}</p>
        <button type="button" disabled={busy} onClick={() => void end()} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-info"><X size={16} />{busy ? 'Ending…' : 'End session'}</button>
      </>}
      {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
    </div>
  </main>;
}
