import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { consumeRingCentralState } from '../_shared/ringcentral-oauth-state.ts';
import { SupabaseRingCentralStateStore } from '../_shared/ringcentral-oauth-state-store.ts';
import { exchangeRingCentralCode, encryptRingCentralCodeExchange } from '../_shared/ringcentral-oauth-code-flow.ts';
import { verifyRingCentralIdentity } from '../_shared/ringcentral-account-identity.ts';

Deno.serve(async (request: Request): Promise<Response> => {
  const reply = (status: number, message: string) => new Response(message, {
    status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store',
      'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' },
  });
  if (request.method !== 'GET') return reply(405, 'Method not allowed');
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('RINGCENTRAL_CLIENT_ID');
  const clientSecret = Deno.env.get('RINGCENTRAL_CLIENT_SECRET');
  const redirectUri = Deno.env.get('RINGCENTRAL_REDIRECT_URI');
  const key = Deno.env.get('PHONE_DISPATCHER_TOKEN_ENCRYPTION_KEY');
  const origin = Deno.env.get('RINGCENTRAL_API_ORIGIN') ?? 'https://platform.ringcentral.com';
  if (!url || !service || !clientId || !clientSecret || !redirectUri || !key) {
    return reply(503, 'RingCentral authorization is not configured');
  }
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get('state');
  const code = incoming.searchParams.get('code');
  if (!state) return reply(400, 'Missing authorization state');
  const db = createClient(url, service, { auth: { persistSession: false } });
  let pending;
  try {
    pending = await consumeRingCentralState(new SupabaseRingCentralStateStore(db), state);
  } catch {
    return reply(400, 'Authorization session expired or already used');
  }
  if (pending.redirect_uri !== redirectUri) return reply(400, 'Authorization configuration changed');
  if (!code || incoming.searchParams.has('error')) return reply(400, 'RingCentral authorization declined');
  try {
    const tokens = await exchangeRingCentralCode({
      origin, clientId, clientSecret, redirectUri, code,
    });
    const identity = await verifyRingCentralIdentity(tokens.accessToken, fetch, origin);
    // A RingCentral account can belong to only one MJV organization.
    // Never overwrite another tenant's connection on conflict.
    const { data: existing, error: lookupError } = await db.from('ringcentral_oauth_connections')
      .select('id,organization_id,token_version')
      .eq('ringcentral_account_id', identity.accountId).maybeSingle();
    if (lookupError) throw Error('connection_lookup_failed');
    if (existing && existing.organization_id !== pending.organization_id) {
      return reply(409, 'This RingCentral account is already linked to another organization');
    }
    const encrypted = await encryptRingCentralCodeExchange(
      tokens, key, pending.organization_id, identity.accountId,
    );
    if (existing) {
      const { data, error } = await db.from('ringcentral_oauth_connections')
        .update({ ...encrypted, token_version: existing.token_version + 1,
          updated_at: new Date().toISOString() })
        .eq('id', existing.id).eq('organization_id', pending.organization_id)
        .eq('token_version', existing.token_version).select('id');
      if (error || data?.length !== 1) throw Error('connection_update_failed');
    } else {
      const { error } = await db.from('ringcentral_oauth_connections').insert(encrypted);
      if (error) throw Error('connection_insert_failed');
    }
    // Mailbox registration stays disabled pending explicit administrator approval.
    const { error: mailboxError } = await db.from('ringcentral_mailboxes').upsert({
      organization_id: pending.organization_id,
      ringcentral_account_id: identity.accountId,
      ringcentral_extension_id: identity.extensionId,
      enabled: false,
    }, { onConflict: 'ringcentral_account_id,ringcentral_extension_id', ignoreDuplicates: true });
    if (mailboxError) throw Error('mailbox_registration_failed');
    return reply(200, 'RingCentral account connected. Voicemail processing remains disabled until mailbox approval.');
  } catch {
    return reply(503, 'RingCentral authorization could not be completed. Please try again.');
  }
});
