import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { validateRingCentralWebhook } from '../_shared/ringcentral-webhook-ingress.ts';
import { RingCentralMailboxResolver } from '../_shared/ringcentral-mailbox-resolver.ts';

/**
 * RingCentral notification receiver. Does NOT process audio or alter call
 * routing. Processing must be performed by a separate authenticated worker.
 *
 * Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * RINGCENTRAL_WEBHOOK_VERIFICATION_TOKEN in server-side function secrets.
 * RingCentral subscription validation and notification delivery are separate
 * paths; neither may accept an organization ID from the incoming payload.
 */
Deno.serve(async (request: Request): Promise<Response> => {
  const reply = (status: number, data: unknown, extra: HeadersInit = {}) =>
    new Response(JSON.stringify(data), {
      status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
    });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret = Deno.env.get('RINGCENTRAL_WEBHOOK_VERIFICATION_TOKEN');
  if (!url || !key || !secret) return reply(503, { error: 'not_configured' });
  if (Number(request.headers.get('content-length') ?? 0) > 65536) {
    return reply(413, { error: 'payload_too_large' });
  }

  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const resolver = new RingCentralMailboxResolver(db as never);
    const decision = await validateRingCentralWebhook(request, secret, resolver);
    if (decision.validationToken) {
      return reply(200, { ok: true }, { 'validation-token': decision.validationToken });
    }
    if (!decision.voicemail) {
      return reply(decision.status, { status: decision.reason ?? 'ignored' });
    }
    const v = decision.voicemail;
    // Atomic ON CONFLICT DO NOTHING via PostgREST upsert, as in #699.
    // No caller-supplied organization or routing is ever trusted.
    const { data, error } = await db.from('voicemail_messages').upsert({
      organization_id: v.organizationId,
      ringcentral_account_id: v.accountId,
      ringcentral_extension_id: v.extensionId,
      ringcentral_message_id: v.messageId,
      state: 'received',
    }, {
      onConflict: 'organization_id,ringcentral_account_id,ringcentral_extension_id,ringcentral_message_id',
      ignoreDuplicates: true,
    }).select('id');
    if (error) {
      console.error('Phone dispatcher voicemail claim failed', error.code);
      return reply(503, { error: 'temporary_failure' });
    }
    return reply(202, { status: Array.isArray(data) && data.length ? 'queued' : 'duplicate' });
  } catch (error) {
    console.error('Phone dispatcher ingress failure', error instanceof Error ? error.name : 'unknown');
    return reply(503, { error: 'temporary_failure' });
  }
});
