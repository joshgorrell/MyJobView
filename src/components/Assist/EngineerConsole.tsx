import { GuestInviteConsole } from './GuestInviteConsole';
import { useEffect, useRef, useState } from 'react';
import { Monitor, RefreshCw, ExternalLink, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Device = { id: string; name: string; os: string; online: boolean };
type Session = { id: string; name: string; viewer: Window; expiresAt: string; ending: boolean };
export function EngineerConsole({ organizationId }: { organizationId: string }) {
  const [canOperate, setCanOperate] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const session = useRef<Session | null>(null);
  const starting = useRef(false);
  const endingRequest = useRef(false);
  const refreshRequest = useRef(0);
  async function invoke(operation: string, extra: Record<string, string> = {}) {
    const { data, error: failure } = await supabase.functions.invoke('assist-support', { body: { operation, organizationId, ...extra } });
    if (failure || data?.error) throw new Error('Support unavailable');
    return data;
  }
  async function end() {
    const current = session.current;
    if (!current || endingRequest.current) return;
    const version = epoch.current;
    endingRequest.current = true; current.ending = true; current.viewer.close(); setEnding(true); setError('');
    try {
      const result = await invoke('end', { sessionId: current.id });
      if (result?.ended !== true) throw new Error('End unconfirmed');
      if (epoch.current === version && session.current?.id === current.id) { session.current = null; setSessionName(''); setEnding(false); }
    } catch { if (epoch.current === version) setError('The window is closed, but ending access could not be confirmed. Retry ending the session.'); }
    finally { if (epoch.current === version) endingRequest.current = false; }
  }
  async function refresh() {
    const version = epoch.current; const request = ++refreshRequest.current;
    try {
      const { data: access, error: failure } = await supabase.rpc('get_assist_access', { p_organization_id: organizationId });
      if (failure) throw failure;
      if (epoch.current !== version || refreshRequest.current !== request) return;
      setCanOperate(access?.can_operate === true); setReady(access?.windows_download_ready === true);
      if (!access?.can_operate || !access?.windows_download_ready) { setDevices([]); return; }
      const data = await invoke('devices');
      if (epoch.current === version && refreshRequest.current === request) { setDevices(data.devices || []); if (!session.current?.ending) setError(''); }
    } catch { if (epoch.current === version && refreshRequest.current === request) { setDevices([]); setError('Unable to load technician laptops. Refresh to try again.'); } }
    finally { if (epoch.current === version) setLoading(false); }
  }
  useEffect(() => {
    epoch.current++; setLoading(true); setDevices([]); setError(''); setSessionName(''); setEnding(false); starting.current = false; endingRequest.current = false;
    void refresh();
    const polling = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    const heartbeat = window.setInterval(() => {
      const current = session.current; if (!current) return;
      if (current.ending || current.viewer.closed) { void end(); return; }
      const version = epoch.current;
      void invoke('touch', { sessionId: current.id }).then(data => {
        if (epoch.current !== version || session.current?.id !== current.id) return;
        if (data?.active !== true) throw new Error('Session expired');
        current.expiresAt = data.expires_at;
      }).catch(() => {
        if (epoch.current !== version) return;
        if (Date.now() >= Date.parse(current.expiresAt)) { current.viewer.close(); session.current = null; setSessionName(''); setEnding(false); }
        setError('Support access could not be renewed. Reconnect if the support window stops working.');
      });
    }, 60000);
    return () => {
      epoch.current++; window.clearInterval(polling); window.clearInterval(heartbeat);
      const current = session.current; session.current = null;
      if (current) { current.viewer.close(); void invoke('end', { sessionId: current.id }).catch(() => {}); }
    };
  }, [organizationId]);
  async function connect(device: Device) {
    if (starting.current || session.current || !ready || !canOperate || !device.online) return;
    const version = epoch.current;
    const viewer = window.open('about:blank', '_blank');
    if (!viewer) { setError('Allow pop-up windows for MJV to open remote support.'); return; }
    viewer.opener = null; viewer.document.title = 'Connecting to remote support'; viewer.document.body.textContent = 'Preparing remote support…';
    const meta = viewer.document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; viewer.document.head.appendChild(meta);
    starting.current = true; setBusy(device.id); setError('');
    let issuedId: string | null = null;
    try {
      const data = await invoke('connect', { deviceId: device.id }); issuedId = data.session_id;
      const url = new URL(data.viewer_url);
      const expectedPath = `/mjv-${organizationId.replace(/-/g, '')}/`;
      if (url.protocol !== 'https:' || url.origin !== data.viewer_origin || url.pathname !== expectedPath || url.username || url.password) throw new Error('Invalid viewer');
      if (epoch.current !== version) throw new Error('Workspace changed');
      session.current = { id: data.session_id, name: device.name, viewer, expiresAt: data.expires_at, ending: false };
      viewer.location.replace(url.href); setSessionName(device.name); setEnding(false);
    } catch {
      viewer.close(); if (issuedId) void invoke('end', { sessionId: issuedId }).catch(() => {});
      if (epoch.current === version) { session.current = null; setError('Unable to open remote support. The laptop may be offline or access may have changed.'); }
    } finally { if (epoch.current === version) { starting.current = false; setBusy(''); } }
  }
  return <section className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold text-primary"><Monitor size={20} />Support workspace</h2>
      <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 text-sm text-info"><RefreshCw size={16} />Refresh laptops</button></div>
    {loading ? <p className="mt-3 text-sm text-muted" role="status">Checking remote support access…</p> : !canOperate ? <p className="mt-3 text-sm text-muted">Your dealer administrator can give you permission to support technician laptops.</p> : !ready ? <p className="mt-3 text-sm text-muted">Remote support is not ready for connections. Continue using your current support tool until activation and the pilot are complete.</p> : <>
      <p className="mt-2 text-sm text-muted">Select an online laptop. Remote support opens in a separate browser window, and the technician must approve access. Keep this MJV page open during support.</p>
      <GuestInviteConsole organizationId={organizationId} />
      {sessionName && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-500/10 p-3"><p className="min-w-0 break-words text-sm text-primary">{ending ? 'Ending support access' : 'Support window ready'}: <strong>{sessionName}</strong></p><button type="button" onClick={() => void end()} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-info"><X size={16} />{ending ? 'Retry ending' : 'End session'}</button></div>}
      <div className="mt-4 divide-y divide-gray-200">
        {devices.map(device => <div key={device.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-medium text-primary">{device.name}</p><p className="break-words text-xs text-muted">{device.online ? 'Online' : 'Offline'}{device.os ? ` · ${device.os}` : ''}</p></div><button type="button" onClick={() => void connect(device)} disabled={!device.online || !!busy || !!sessionName} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><ExternalLink size={16} />{busy === device.id ? 'Opening…' : 'Connect'}</button></div>)}
        {!devices.length && !error && <p className="py-4 text-sm text-muted">No laptops are enrolled yet. Install the Windows support app to get started.</p>}
      </div>
    </>}
    {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
  </section>;
}
