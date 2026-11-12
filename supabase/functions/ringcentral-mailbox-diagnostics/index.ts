import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { RingCentralOAuthClient } from '../_shared/ringcentral-oauth.ts';
import { SupabaseRingCentralOAuthStore } from '../_shared/ringcentral-oauth-store.ts';
import { getRingCentralAccessToken } from '../_shared/ringcentral-token-provider.ts';

/** Read-only admin diagnostics. Never returns tokens or changes call routing. */
Deno.serve(async (request: Request) => {
  const allowed = Deno.env.get('PHONE_DISPATCHER_APP_ORIGIN');
  const origin = request.headers.get('origin');
  const cors = allowed && origin === allowed ? {
    'access-control-allow-origin': allowed, vary: 'Origin',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods': 'GET,OPTIONS',
  } : {};
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors },
  });
  if (request.method === 'OPTIONS') return new Response(null, { status: allowed && origin === allowed ? 204 : 403, headers: cors });
  if (origin && origin !== allowed) return reply(403, { error: 'forbidden_origin' });
  if (request.method !== 'GET') return reply(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('RINGCENTRAL_CLIENT_ID');
  const clientSecret = Deno.env.get('RINGCENTRAL_CLIENT_SECRET');
  const key = Deno.env.get('PHONE_DISPATCHER_TOKEN_ENCRYPTION_KEY');
  const bearer = request.headers.get('authorization');
  if (!url || !anon || !service || !clientId || !clientSecret || !key) return reply(503, { error: 'not_configured' });
  if (!bearer?.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });
  const auth = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: bearer } } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return reply(401, { error: 'unauthorized' });
  const { data: profile } = await auth.from('profiles').select('organization_id,role').eq('id', user.id).maybeSingle();
  if (!profile?.organization_id || profile.role !== 'admin') return reply(403, { error: 'admin_required' });
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: connections, error: connectionError } = await db.from('ringcentral_oauth_connections')
    .select('ringcentral_account_id,status').eq('organization_id', profile.organization_id).limit(5);
  const { data: mailboxes, error: mailboxError } = await db.from('ringcentral_mailboxes')
    .select('ringcentral_account_id,ringcentral_extension_id,display_name,enabled')
    .eq('organization_id', profile.organization_id).limit(100);
  if (connectionError || mailboxError) return reply(503, { error: 'connection_lookup_failed' });
  const results = [];
  for (const connection of connections ?? []) {
    if (connection.status !== 'connected') { results.push({ status: 'disconnected' }); continue; }
    try {
      const token = await getRingCentralAccessToken(
        new SupabaseRingCentralOAuthStore(db),
        new RingCentralOAuthClient(clientId, clientSecret), key,
        profile.organization_id, connection.ringcentral_account_id,
      );
      const response = await fetch('https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~', {
        headers: { authorization: 'Bearer ' + token, accept: 'application/json' }, redirect: 'error',
      });
      if (!response.ok) { results.push({ status: 'identity_lookup_failed', http_status: response.status }); continue; }
      const identity = await response.json();
      // Read-only provider inspection; never expose callback URLs or event payloads.
      let subscription_check: 'active' | 'missing' | 'unavailable' = 'unavailable';
      let subscription_expiration: string | null = null;
      try {
        const subscriptionsResponse = await fetch(
          'https://platform.ringcentral.com/restapi/v1.0/subscription', {
            headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
            redirect: 'error',
          },
        );
        if (subscriptionsResponse.ok) {
          const payload = await subscriptionsResponse.json();
          const subscriptions = Array.isArray(payload.records) ? payload.records : [];
          const relevant = subscriptions.filter((subscription: Record<string, unknown>) => {
            const filters = Array.isArray(subscription.eventFilters) ? subscription.eventFilters : [];
            return subscription.status === 'Active' &&
              filters.some((filter: unknown) => typeof filter === 'string' &&
                (filter.includes('/voicemail') || filter.includes('/message-store')));
          });
          subscription_check = relevant.length ? 'active' : 'missing';
          subscription_expiration = relevant.length && typeof relevant[0].expirationTime === 'string'
            ? relevant[0].expirationTime : null;
        }
      } catch { /* Provider inspection unavailable: never claim no subscription. */ }
      const extensionId = String(identity.id ?? '');
      results.push({
        status: 'connected', subscription_check, subscription_expiration,
        extension_number: identity.extensionNumber ?? null,
        extension_name: identity.name ?? null,
        registered_mailbox: (mailboxes ?? []).some(m =>
          m.ringcentral_account_id === connection.ringcentral_account_id && m.ringcentral_extension_id === extensionId),
        mailbox_enabled: (mailboxes ?? []).some(m =>
          m.ringcentral_account_id === connection.ringcentral_account_id && m.ringcentral_extension_id === extensionId && m.enabled),
      });
    } catch { results.push({ status: 'token_refresh_or_identity_failed' }); }
  }
  return reply(200, { connections: results, mailboxes: (mailboxes ?? []).map(m => ({
    extension_id: m.ringcentral_extension_id, display_name: m.display_name, enabled: m.enabled,
  })) });
});
