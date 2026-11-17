import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { EngineerConsole } from './EngineerConsole';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';

export default function AssistPage() {
  const { profile, isPortalUser } = useAuth();
  const { tenant, loading: tenantLoading, error: tenantError } = useTenant();
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const organizationId = profile?.organization_id;
  const allowed = Boolean(organizationId && profile?.is_active && !isPortalUser &&
    !tenantLoading && !tenantError &&
    (!tenant || tenant.organizationId === organizationId));

  useEffect(() => {
    const request = ++generation.current;
    setReady(false); setEnabled(false); setError(''); setMessage(''); setLoading(true); setBusy(false);
    if (!allowed || !organizationId) { setLoading(false); return; }
    void (async () => {
      try {
        const { data, error: failure } = await supabase.rpc('get_assist_setup', { p_organization_id: organizationId });
        if (failure) throw failure;
        if (generation.current === request) { setReady(data?.windows_download_ready === true); setEnabled(data?.enabled === true); }
      } catch {
        if (generation.current === request) setError('Unable to load remote support. Try again.');
      } finally {
        if (generation.current === request) setLoading(false);
      }
    })();
    return () => { generation.current++; };
  }, [allowed, organizationId, refresh]);

  async function download() {
    if (!allowed || !organizationId || !ready || busy) return;
    const request = generation.current;
    setBusy(true); setError(''); setMessage('');
    try {
      // Resolve again on every click: disabling enrollment takes effect without a page refresh.
      const { data, error: failure } = await supabase.rpc('get_assist_windows_download', { p_organization_id: organizationId });
      if (failure) throw failure;
      if (generation.current !== request) return;
      const url = new URL(data?.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid download');
      const link = document.createElement('a');
      link.href = url.href; link.rel = 'noreferrer'; link.referrerPolicy = 'no-referrer';
      document.body.appendChild(link); link.click(); link.remove();
      setMessage('Download requested. Open the file, choose Install, and approve the Windows prompt.');
    } catch {
      if (generation.current === request) { setReady(false); setError('Download unavailable. Refresh or contact your administrator.'); }
    } finally {
      if (generation.current === request) setBusy(false);
    }
  }

  if (tenantLoading) return <div className="p-6 text-muted" role="status">Loading dealer…</div>;
  if (!allowed) return <div className="p-6 text-primary" role="alert">Remote support is available only to active employees in their own dealer workspace.</div>;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 lg:px-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h1 className="sr-only">MyJobView Assist — Remote Support</h1>
        <div className="w-60 max-w-full shrink-0">
          <img
            src="/images/myjobview-assist.png"
            alt="MyJobView Assist"
            width={2172}
            height={724}
            className="block h-auto w-full"
          />
        </div>
        <p className="text-sm text-muted">{tenant?.organizationName || 'Your dealer'} · Help for your on-site laptop</p>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-subtle bg-surface p-4">
        <h2 className="text-lg font-semibold text-primary">Set up this Windows laptop</h2>
        <p className="mt-1 text-sm text-muted">Install the support app once so your office engineers can help with your computer.</p>
        <ol className="my-3 list-inside list-decimal space-y-2 text-sm text-primary">
          <li>Download the Windows support app.</li>
          <li>Open the file and choose <strong>Install</strong>.</li>
          <li>Approve the Windows administrator prompt. Contact your office if credentials are required.</li>
        </ol>
        <button type="button" onClick={() => void download()} disabled={loading || busy || !ready}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
          <Download size={18} />{loading ? 'Checking availability…' : busy ? 'Preparing download…' : 'Download for Windows (64-bit)'}
        </button>
        {!loading && !ready && !error && <p className="mt-3 text-sm text-muted" role="status">{enabled ? 'Remote support is being set up for your dealer. Downloads will be available when setup is complete.' : 'Remote Support is off. Your dealer administrator can enable it in Integrations.'}</p>}
        <p className="mt-3 text-xs text-muted">Administrator access and a working internet connection are required. First-time setup may take longer if Windows requests additional approval.</p>
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        {message && <p className="mt-3 text-sm text-primary" role="status">{message}</p>}
        <button type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading || busy}
          className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-info disabled:opacity-50"><RefreshCw size={16} />Refresh availability</button>
      </section>
      <EngineerConsole organizationId={organizationId!} />
      </div>
    </div>
  );
}
