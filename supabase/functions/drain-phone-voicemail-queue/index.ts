import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

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
