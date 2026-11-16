import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { RingCentralOAuthClient } from '../_shared/ringcentral-oauth.ts';
import { SupabaseRingCentralOAuthStore } from '../_shared/ringcentral-oauth-store.ts';
import { getRingCentralAccessToken } from '../_shared/ringcentral-token-provider.ts';
import { syncVoicemailSubscription } from '../_shared/ringcentral-subscriptions.ts';

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
      if (!mailboxes?.length) {
        results.push({ organization_id: organizationId, status: 'skipped_mailbox_count' });
        continue;
      }
      const token = await getRingCentralAccessToken(
        new SupabaseRingCentralOAuthStore(db),
        new RingCentralOAuthClient(clientId, clientSecret),
        encryptionKey, organizationId, connection.ringcentral_account_id,
      );
      const verificationToken=Deno.env.get('RINGCENTRAL_WEBHOOK_VERIFICATION_TOKEN');
      if(!verificationToken)throw Error('not_configured');
      const provider=(path:string,init:RequestInit={})=>fetch('https://platform.ringcentral.com/restapi/v1.0/'+path,{
        ...init,redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,accept:'application/json','content-type':'application/json',...init.headers},
      });
      await syncVoicemailSubscription(provider,connection.ringcentral_account_id,
        mailboxes.map(m=>m.ringcentral_extension_id),url.replace(/\/$/,'')+'/functions/v1/ringcentral-voicemail-webhook',verificationToken,false);
      results.push({ organization_id: organizationId, status: 'renewed' });
    } catch (cause) {
      console.error('RingCentral renewal failed for organization', organizationId,
        cause instanceof Error ? cause.message : 'unknown');
      results.push({ organization_id: organizationId, status: 'error' });
    }
  }
  return reply(results.some(r => r.status === 'error') ? 503 : 200, { results });
});

