import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { RingCentralOAuthClient } from '../_shared/ringcentral-oauth.ts';
import { SupabaseRingCentralOAuthStore } from '../_shared/ringcentral-oauth-store.ts';
import { getRingCentralAccessToken } from '../_shared/ringcentral-token-provider.ts';

// Explicit administrator action only. Never changes RingCentral call routing
// or enables a mailbox. Subscription renewal is idempotent for this endpoint.
Deno.serve(async (request: Request) => {
  const allowed = Deno.env.get('PHONE_DISPATCHER_APP_ORIGIN');
  const origin = request.headers.get('origin');
  const cors = allowed && origin === allowed ? {
    'access-control-allow-origin': allowed, vary: 'Origin',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods': 'POST,OPTIONS',
  } : {};
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors },
  });
  if (request.method === 'OPTIONS') return new Response(null, {
    status: allowed && origin === allowed ? 204 : 403, headers: cors,
  });
  if (origin && origin !== allowed) return reply(403, { error: 'forbidden_origin' });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('RINGCENTRAL_CLIENT_ID');
  const clientSecret = Deno.env.get('RINGCENTRAL_CLIENT_SECRET');
  const encryptionKey = Deno.env.get('PHONE_DISPATCHER_TOKEN_ENCRYPTION_KEY');
  const verificationToken = Deno.env.get('RINGCENTRAL_WEBHOOK_VERIFICATION_TOKEN');
  if (!url || !anon || !service || !clientId || !clientSecret || !encryptionKey || !verificationToken) {
    return reply(503, { error: 'not_configured' });
  }
  // Surface only a bounded provider error code/message for troubleshooting.
  // Never return raw response bodies, callback URLs, headers, or secrets.
  async function providerFailure(response: Response, code: string) {
    let provider_code: string | null = null;
    let provider_message: string | null = null;
    let invalid_parameter: string | null = null;
    try {
      const body = await response.json() as {
        errorCode?: unknown; message?: unknown;
        errors?: Array<{ errorCode?: unknown; message?: unknown }>;
      };
      const issue = Array.isArray(body.errors) ? body.errors[0] : undefined;
      const rawCode = issue?.errorCode ?? body.errorCode;
      if (typeof rawCode === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(rawCode)) {
        provider_code = rawCode;
      }
      const rawMessage = issue?.message ?? body.message;
      if (typeof rawMessage === 'string') {
        const match = rawMessage.match(/^Parameter \[([A-Za-z][A-Za-z0-9_.-]{0,63})\] value is invalid\.?$/);
        if (match) invalid_parameter = match[1];
      }
      if (typeof rawMessage === 'string' && rawMessage.length <= 240 &&
          !/https?:|token|secret|authorization|bearer|password|key/i.test(rawMessage)) {
        provider_message = rawMessage;
      }
    } catch { /* A non-JSON provider response is not exposed. */ }
    return reply(502, { error: code, http_status: response.status, provider_code, provider_message, invalid_parameter });
  }
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });
  const auth = createClient(url, anon, {
    auth: { persistSession: false }, global: { headers: { Authorization: bearer } },
  });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return reply(401, { error: 'unauthorized' });
  const { data: profile, error: profileError } = await auth.from('profiles')
    .select('organization_id,role').eq('id', user.id).maybeSingle();
  if (profileError || !profile?.organization_id || profile.role !== 'admin') {
    return reply(403, { error: 'admin_required' });
  }
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: connections, error: connectionError } = await db.from('ringcentral_oauth_connections')
    .select('ringcentral_account_id,status').eq('organization_id', profile.organization_id);
  if (connectionError || !connections || connections.filter(c => c.status === 'connected').length !== 1) {
    return reply(409, { error: 'expected_one_connected_account' });
  }
  const accountId = connections.find(c => c.status === 'connected')!.ringcentral_account_id;
  const { data: mailboxes, error: mailboxError } = await db.from('ringcentral_mailboxes')
    .select('ringcentral_extension_id').eq('organization_id', profile.organization_id)
    .eq('ringcentral_account_id', accountId);
  if (mailboxError || !mailboxes || mailboxes.length !== 1) {
    return reply(409, { error: 'expected_one_registered_mailbox' });
  }
  const extensionId = mailboxes[0].ringcentral_extension_id;
  try {
    const token = await getRingCentralAccessToken(
      new SupabaseRingCentralOAuthStore(db),
      new RingCentralOAuthClient(clientId, clientSecret),
      encryptionKey, profile.organization_id, accountId,
    );
    const api = 'https://platform.ringcentral.com/restapi/v1.0/subscription';
    const headers = { authorization: 'Bearer ' + token, accept: 'application/json' };
    const listResponse = await fetch(api, { headers, redirect: 'error' });
    if (!listResponse.ok) return reply(502, { error: 'subscription_lookup_failed', http_status: listResponse.status });
    const list = await listResponse.json();
    const records = Array.isArray(list.records) ? list.records : [];
    // The OAuth token is scoped to the connected extension. RingCentral supports
    // ~ aliases for the authenticated account and extension, avoiding a stale or
    // incorrectly persisted account ID being interpreted as an extension ID.
    const filter = '/restapi/v1.0/account/~/extension/~/voicemail';
    const explicitFilter = '/restapi/v1.0/account/' + accountId + '/extension/' + extensionId + '/voicemail';
    const address = url.replace(/\/$/, '') + '/functions/v1/ringcentral-voicemail-webhook';
    const matches = records.filter((record: Record<string, unknown>) => {
      const mode = record.deliveryMode as Record<string, unknown> | undefined;
      const filters = Array.isArray(record.eventFilters) ? record.eventFilters : [];
      return record.status === 'Active' && mode?.transportType === 'WebHook' &&
        mode.address === address && (filters.includes(filter) || filters.includes(explicitFilter));
    });
    if (matches.length > 1) return reply(409, { error: 'multiple_matching_subscriptions' });
    if (matches.length === 1) {
      const id = matches[0].id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(id)) {
        return reply(502, { error: 'invalid_subscription_id' });
      }
      const renewal = await fetch(api + '/' + id + '/renew', {
        method: 'POST', headers, redirect: 'error',
      });
      if (!renewal.ok) return await providerFailure(renewal, 'subscription_renewal_failed');
      const renewed = await renewal.json();
      return reply(200, { status: 'renewed', expiration_time: renewed.expirationTime ?? null });
    }
    // Never create another subscription if an active voicemail subscription
    // exists for this extension but points elsewhere; require investigation.
    const conflicting = records.some((record: Record<string, unknown>) =>
      record.status === 'Active' && Array.isArray(record.eventFilters) &&
      (record.eventFilters.includes(filter) || record.eventFilters.includes(explicitFilter)));
    if (conflicting) return reply(409, { error: 'existing_voicemail_subscription_requires_review' });
    const created = await fetch(api, {
      method: 'POST', redirect: 'error',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        eventFilters: [filter],
        expiresIn: 604800,
        deliveryMode: { transportType: 'WebHook', address, verificationToken },
      }),
    });
    if (!created.ok) return await providerFailure(created, 'subscription_creation_failed');
    const result = await created.json();
    return reply(200, { status: 'created', expiration_time: result.expirationTime ?? null });
  } catch {
    return reply(503, { error: 'subscription_management_unavailable' });
  }
});
