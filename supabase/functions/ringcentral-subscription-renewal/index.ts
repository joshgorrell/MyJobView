import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { RingCentralOAuthClient } from '../_shared/ringcentral-oauth.ts';
import { SupabaseRingCentralOAuthStore } from '../_shared/ringcentral-oauth-store.ts';
import { getRingCentralAccessToken } from '../_shared/ringcentral-token-provider.ts';

// Invoked only by Supabase cron with the service-role bearer token.
// Never creates subscriptions, changes mailbox enablement, or alters call routing.
Deno.serve(async (request: Request) => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('RINGCENTRAL_CLIENT_ID');
  const clientSecret = Deno.env.get('RINGCENTRAL_CLIENT_SECRET');
  const encryptionKey = Deno.env.get('PHONE_DISPATCHER_TOKEN_ENCRYPTION_KEY');
  if (!url || !service || !clientId || !clientSecret || !encryptionKey) return reply(503, { error: 'not_configured' });
  if (request.headers.get('authorization') !== 'Bearer ' + service) return reply(401, { error: 'unauthorized' });
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: connections, error } = await db.from('ringcentral_oauth_connections')
    .select('organization_id,ringcentral_account_id').eq('status', 'connected');
  if (error || !connections) return reply(503, { error: 'connection_lookup_failed' });
  const results: Array<{ organization_id: string; status: string }> = [];
  for (const connection of connections) {
    const organizationId = connection.organization_id;
    try {
      const { data: mailboxes, error: mailboxError } = await db.from('ringcentral_mailboxes')
        .select('ringcentral_extension_id').eq('organization_id', organizationId)
        .eq('ringcentral_account_id', connection.ringcentral_account_id).eq('enabled', true);
      if (mailboxError) throw Error('mailbox_lookup_failed');
      if (mailboxes?.length !== 1) {
        results.push({ organization_id: organizationId, status: 'skipped_mailbox_count' });
        continue;
      }
      const token = await getRingCentralAccessToken(
        new SupabaseRingCentralOAuthStore(db),
        new RingCentralOAuthClient(clientId, clientSecret),
        encryptionKey, organizationId, connection.ringcentral_account_id,
      );
      const api = 'https://platform.ringcentral.com/restapi/v1.0/subscription';
      const headers = { authorization: 'Bearer ' + token, accept: 'application/json' };
      const response = await fetch(api, { headers, redirect: 'error' });
      if (!response.ok) throw Error('subscription_lookup_failed');
      const body = await response.json();
      const records = Array.isArray(body.records) ? body.records : [];
      const filter = '/restapi/v1.0/account/~/extension/~/voicemail';
      const explicit = '/restapi/v1.0/account/' + connection.ringcentral_account_id +
        '/extension/' + mailboxes[0].ringcentral_extension_id + '/voicemail';
      const address = url.replace(/\/$/, '') + '/functions/v1/ringcentral-voicemail-webhook';
      const matches = records.filter((record: Record<string, unknown>) => {
        const delivery = record.deliveryMode as Record<string, unknown> | undefined;
        const filters = Array.isArray(record.eventFilters) ? record.eventFilters : [];
        return record.status === 'Active' && delivery?.transportType === 'WebHook' &&
          delivery.address === address && (filters.includes(filter) || filters.includes(explicit));
      });
      if (matches.length !== 1) {
        results.push({ organization_id: organizationId, status: 'requires_review' });
        continue;
      }
      const subscription = matches[0];
      const expires = Date.parse(subscription.expirationTime);
      if (!Number.isFinite(expires)) throw Error('invalid_expiration');
      if (expires - Date.now() > 72 * 60 * 60 * 1000) {
        results.push({ organization_id: organizationId, status: 'healthy' });
        continue;
      }
      if (typeof subscription.id !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(subscription.id)) {
        throw Error('invalid_subscription_id');
      }
      const renewed = await fetch(api + '/' + subscription.id + '/renew', {
        method: 'POST', headers, redirect: 'error',
      });
      if (!renewed.ok) throw Error('renewal_failed');
      results.push({ organization_id: organizationId, status: 'renewed' });
    } catch (cause) {
      console.error('RingCentral renewal failed for organization', organizationId,
        cause instanceof Error ? cause.message : 'unknown');
      results.push({ organization_id: organizationId, status: 'error' });
    }
  }
  return reply(results.some(r => r.status === 'error') ? 503 : 200, { results });
});
