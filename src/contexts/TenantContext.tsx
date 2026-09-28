import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getSubdomainFromHostname } from '../lib/subdomainConfig';

export interface TenantInfo {
  organizationId: string;
  organizationName: string;
  logoUrl: string | null;
  subdomain: string;
}

interface TenantContextValue {
  tenant: TenantInfo | null;
  loading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function resolveTenant() {
      const hostname = window.location.hostname;
      const subdomain = getSubdomainFromHostname(hostname);

      if (!subdomain) {
        setLoading(false);
        return;
      }

      try {
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('id, name, logo_url, subdomain')
          .eq('subdomain', subdomain)
          .maybeSingle();

        if (orgError) throw orgError;

        if (org) {
          setTenant({
            organizationId: org.id,
            organizationName: org.name,
            logoUrl: org.logo_url,
            subdomain: org.subdomain,
          });
          setLoading(false);
          return;
        }

        const { data: redirect } = await supabase
          .from('subdomain_changes')
          .select('new_subdomain')
          .eq('old_subdomain', subdomain)
          .order('changed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (redirect?.new_subdomain) {
          const newHost = `${redirect.new_subdomain}.${hostname.split('.').slice(-2).join('.')}`;
          window.location.replace(`https://${newHost}${window.location.pathname}${window.location.search}`);
          return;
        }

        setError('Dealer not found');
        setLoading(false);
      } catch (err) {
        console.error('Error resolving tenant subdomain:', err);
        setError('Failed to resolve dealer');
        setLoading(false);
      }
    }

    resolveTenant();
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    return { tenant: null, loading: false, error: null };
  }
  return ctx;
}
