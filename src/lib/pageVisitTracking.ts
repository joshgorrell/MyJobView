import { supabase } from './supabase';

// Only logical route labels are stored. Never persist raw paths or query strings.
export function pageKeyFromPath(pathname: string): string | null {
  const segments = pathname.toLowerCase().split('/').filter(Boolean);
  if (!segments.length) return 'home';
  if (['login', 'signup', 'auth', 'auth-bridge', 'reset-password', 'portal', 'public'].includes(segments[0])) return null;
  return segments.slice(0, 2).map((part, index) => index === 0 ? part.replace(/[^a-z0-9_-]/g, '') : (/^[a-z][a-z0-9_-]*$/.test(part) ? part : 'detail')).join('/').slice(0, 100) || null;
}

export async function recordPageVisit(userId: string, organizationId: string, pathname: string): Promise<void> {
  const page_key = pageKeyFromPath(pathname);
  if (!page_key) return;
  const { error } = await supabase.from('user_page_visits').insert({ user_id: userId, organization_id: organizationId, page_key });
  if (error && import.meta.env.DEV) console.warn('Page visit tracking unavailable:', error.message);
}
