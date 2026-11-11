import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { MAX_VOICEMAIL_ATTEMPTS, nextVoicemailRetry } from '../_shared/phone-voicemail-retry.ts';

/**
 * Internal queue drainer for verified, already-persisted voicemail events.
 * A scheduler must call this with PHONE_DISPATCHER_SCHEDULER_SECRET.
 * This endpoint is NOT intended for browser access.
 */
Deno.serve(async (request: Request) => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const schedulerSecret = Deno.env.get('PHONE_DISPATCHER_SCHEDULER_SECRET');
  if (!schedulerSecret || request.headers.get('authorization') !== 'Bearer ' + schedulerSecret) {
    return json(401, { error: 'unauthorized' });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const workerSecret = Deno.env.get('PHONE_DISPATCHER_WORKER_SECRET');
  if (!url || !serviceKey || !workerSecret) return json(503, { error: 'not_configured' });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  // Recover abandoned claims after 15 minutes; do not overwrite completed rows.
  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: stale, error: staleError } = await db.from('voicemail_messages')
    .select('id,retry_count,updated_at').eq('state', 'processing')
    .lt('updated_at', staleBefore).order('updated_at', { ascending: true }).limit(10);
  if (staleError) return json(503, { error: 'stale_claim_lookup_failed' });
  for (const item of stale ?? []) {
    const attempt = Math.min(MAX_VOICEMAIL_ATTEMPTS, (item.retry_count ?? 0) + 1);
    await db.from('voicemail_messages').update({
      state: 'failed', retry_count: attempt,
      next_retry_at: nextVoicemailRetry(attempt),
      last_error: 'processing_timeout', updated_at: new Date().toISOString(),
    }).eq('id', item.id).eq('state', 'processing').eq('updated_at', item.updated_at);
  }
  // Requeue only failed records whose backoff has expired. Exhausted records
  // remain failed for manual review; never retry indefinitely.
  const { data: retryable, error: retryError } = await db.from('voicemail_messages')
    .select('id,next_retry_at').eq('state', 'failed')
    .lt('retry_count', MAX_VOICEMAIL_ATTEMPTS)
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true }).limit(10);
  if (retryError) return json(503, { error: 'retry_lookup_failed' });
  for (const item of retryable ?? []) {
    await db.from('voicemail_messages').update({
      state: 'received', next_retry_at: null, updated_at: new Date().toISOString(),
    }).eq('id', item.id).eq('state', 'failed').eq('next_retry_at', item.next_retry_at);
  }
  // Bound work per request; workers atomically claim rows before downloading.
  // Oldest first prevents newly arriving voicemails from starving earlier ones.
  const { data, error } = await db.from('voicemail_messages')
    .select('id').eq('state', 'received').order('received_at', { ascending: true }).limit(10);
  if (error) return json(503, { error: 'queue_read_failed' });
  let dispatched = 0;
  let failed = 0;
  for (const item of data ?? []) {
    try {
      const response = await fetch(url + '/functions/v1/process-phone-voicemail', {
        method: 'POST', redirect: 'error',
        headers: { 'authorization': 'Bearer ' + workerSecret, 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
        signal: AbortSignal.timeout(25000),
      });
      if (response.ok) dispatched++;
      else failed++;
    } catch { failed++; }
  }
  return json(failed ? 503 : 200, { checked: (data ?? []).length, dispatched, failed });
});
