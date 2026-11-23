import { useEffect, useRef, useState } from 'react';
import { Monitor } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { AssistOperatorAccess } from './AssistOperatorAccess';
import { supabase } from '../../lib/supabase';

type Status = { enabled: boolean; provisioned: boolean; windows_download_ready: boolean; activation_state?: 'off' | 'activation_pending' | 'deactivation_pending' | 'needs_attention' | 'enrollment_ready' };
export function AssistSettings() {
  const { profile } = useAuth();
  const { tenant, loading: tenantLoading, error: tenantError } = useTenant();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const statusRequest = useRef(0);
  const saving = useRef(false);
  const organizationId = profile?.organization_id;
  const allowed = Boolean(profile?.role === 'admin' && profile.is_active && !tenantLoading && !tenantError && (!tenant || tenant.organizationId === organizationId));
  useEffect(() => {
    const request = ++generation.current;
    setStatus(null); setError(''); setBusy(false); saving.current = false;
    if (!allowed || !organizationId) return;
    const load = () => {
      if (saving.current) return;
      const current = ++statusRequest.current;
      void supabase.rpc('get_assist_setup', { p_organization_id: organizationId }).then(({ data, error: failure }) => {
        if (generation.current !== request || current !== statusRequest.current) return;
        if (failure || !data) setError('Unable to load remote support settings.'); else { setStatus(data); setError(''); }
      });
    };
    load();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    return () => { generation.current++; window.clearInterval(interval); };

  }, [allowed, organizationId]);
  async function toggle() {
    if (!allowed || !organizationId || !status || busy) return;
    const request = generation.current;
    saving.current = true; statusRequest.current++;
    setBusy(true); setError('');
    try {
      const { data, error: failure } = await supabase.rpc('set_assist_enabled', {
        p_organization_id: organizationId, p_enabled: !status.enabled,
      });
      if (failure || !data) throw new Error('Save failed');
      if (generation.current === request) { setStatus(data); window.dispatchEvent(new Event('assist-settings-changed')); }
    } catch { if (generation.current === request) setError('Unable to save remote support settings. Try again.'); }
    finally { if (generation.current === request) { saving.current = false; setBusy(false); } }
  }
  if (!allowed) return <p className="text-sm text-muted">Dealer administrator access is required.</p>;
  return <section className="space-y-4 rounded-xl border border-subtle bg-surface p-5">
    <div className="flex items-center gap-3"><Monitor className="text-info" /><h4 className="text-lg font-semibold text-primary">Remote Support</h4></div>
    <p className="text-sm text-muted">Let authorized staff help customers and coworkers on Windows computers. MyJobView sets up the service for your company.</p>
    <label className="flex min-h-11 items-center gap-3 text-primary">
      <input type="checkbox" role="switch" checked={status?.enabled === true} disabled={!status || busy} onChange={() => void toggle()} />
      Enable Remote Support for this dealer
    </label>
    {!status && !error && <p role="status" className="text-sm text-muted">Loading settings…</p>}
    {status && <p role="status" className="text-sm text-muted">{status.activation_state === 'needs_attention' ? 'Remote Support setup needs attention from MyJobView.' : status.activation_state === 'deactivation_pending' ? 'MyJobView is turning off Remote Support.' : !status.enabled ? 'Remote Support is off.' : status.windows_download_ready ? 'Windows enrollment is ready. Open Remote Support to check invitation availability.' : 'MyJobView is setting up Remote Support. This status updates automatically.'}</p>}
    <a href="/assist" className="inline-flex min-h-11 items-center text-sm font-semibold text-info">Open Remote Support</a>
    <p className="text-xs text-muted">Turning this off blocks new MJV downloads immediately and requests provider access revocation.</p>
    {organizationId && <AssistOperatorAccess organizationId={organizationId} />}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
