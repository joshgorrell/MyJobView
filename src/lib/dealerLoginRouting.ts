import { supabase } from './supabase';
import { isValidReturnHost } from './crossDomainAuth';

/** Resolve the authenticated staff member's organization, never from a user-supplied hostname. */
export async function resolveAuthenticatedDealerHost(userId: string): Promise<string | null> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('organization_id, is_active').eq('id', userId).maybeSingle();
  if (profileError || !profile?.organization_id || profile.is_active !== true) return null;

  const { data: organization, error: organizationError } = await supabase
    .from('organizations').select('subdomain').eq('id', profile.organization_id).maybeSingle();
  if (organizationError || !organization?.subdomain) return null;

  const host = `${organization.subdomain}.myjobview.com`;
  return isValidReturnHost(host) ? host : null;
}

export function isRootDealerLogin(): boolean {
  return ['myjobview.com', 'www.myjobview.com'].includes(window.location.hostname.toLowerCase())
    && window.location.pathname === '/dealer-login';
}

export function navigateToDealerBridge(host: string): void {
  const bridgeUrl = new URL('/auth-bridge', window.location.origin);
  bridgeUrl.searchParams.set('return_to', host);
  bridgeUrl.searchParams.set('path', '/');
  window.location.replace(bridgeUrl.toString());
}
