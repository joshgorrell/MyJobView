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
  async function toggle(retry = false) {
    if (!allowed || !organizationId || !status || busy) return;
    const request = generation.current;
    saving.current = true; statusRequest.current++;
    setBusy(true); setError('');
    try {
      const { data, error: failure } = await supabase.rpc(retry ? 'retry_assist_activation' : 'set_assist_enabled', retry ? { p_organization_id: organizationId } : {
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
    <p className="text-sm text-muted">Let your office engineers help technicians with their Windows laptops through MJV. No separate provider account or API keys are required.</p>
    <label className="flex min-h-11 items-center gap-3 text-primary">
      <input type="checkbox" role="switch" checked={status?.enabled === true} disabled={!status || busy} onChange={() => void toggle()} />
      Enable Remote Support for this dealer
    </label>
    {!status && !error && <p role="status" className="text-sm text-muted">Loading settings…</p>}
    {status && <p role="status" className="text-sm text-muted">{status.activation_state === 'needs_attention' ? 'Activation needs attention. MJV could not complete the setup. You can retry without entering provider credentials.' : status.activation_state === 'deactivation_pending' ? 'Turning off — new MJV downloads are blocked. Provider access revocation is pending.' : !status.enabled ? 'Remote Support is off.' : status.windows_download_ready ? 'Windows laptop enrollment is available. Check the Assist workspace for invitation availability.' : 'Remote Support is enabled, and activation is pending. The MJV Assist hosting service has not confirmed setup. Downloads and invitations remain disabled until the platform verifies the Windows pilot. No further dealer action is required; contact MJV platform support if this persists.'}</p>}
    {status?.activation_state === 'needs_attention' && <button type="button" disabled={busy} onClick={() => void toggle(true)} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Retry setup</button>}
    {status?.enabled && !status.windows_download_ready && status.activation_state !== 'needs_attention' && <p className="text-xs text-muted">This status updates automatically every 15 seconds while this page is open. Turning Remote Support off and on will not complete platform activation.</p>}
    <a href="/assist" className="inline-flex min-h-11 items-center text-sm font-semibold text-info">Open Remote Support</a>
    <p className="text-xs text-muted">Turning this off blocks new MJV downloads immediately and requests provider access revocation.</p>
    {organizationId && <AssistOperatorAccess organizationId={organizationId} />}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
