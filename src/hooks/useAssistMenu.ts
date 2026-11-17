import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';

// Dealer enablement controls discoverability; session authorization remains server-side.
export function useAssistMenu() {
  const { profile, isPortalUser } = useAuth();
  const { tenant, loading, error } = useTenant();
  const organizationId = profile?.organization_id;
  const allowed = Boolean(organizationId && profile?.is_active && !isPortalUser && !loading && !error &&
    (!tenant || tenant.organizationId === organizationId));
  const [status, setStatus] = useState<{ organizationId: string; enabled: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    setStatus(null);
    if (!allowed || !organizationId) return;
    const refresh = async () => {
      const request = ++generation;
      try {
        const { data, error: failure } = await supabase.rpc('get_assist_setup', { p_organization_id: organizationId });
        if (!cancelled && request === generation) setStatus({ organizationId, enabled: !failure && data?.enabled === true });
      } catch {
        if (!cancelled && request === generation) setStatus(null);
      }
    };
    void refresh();
    window.addEventListener('assist-settings-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('assist-settings-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [allowed, organizationId]);
  return allowed && status?.organizationId === organizationId && status?.enabled === true;
}
