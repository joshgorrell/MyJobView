import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/** Read-only, tenant-isolated voicemail review feed. No recordings or secrets exposed. */
Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin');
  const allowed = Deno.env.get('PHONE_DISPATCHER_APP_ORIGIN');
  const cors = allowed && origin === allowed ? {
    'access-control-allow-origin': allowed, vary: 'Origin',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods': 'GET,OPTIONS',
  } : {};
  const respond = (status: number, value: unknown) => new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors },
  });
  if (request.method === 'OPTIONS') return new Response(null, {
    status: allowed && origin === allowed ? 204 : 403, headers: cors,
  });
  if (origin && origin !== allowed) return respond(403, { error: 'forbidden_origin' });
  if (request.method !== 'GET') return respond(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const bearer = request.headers.get('authorization');
  if (!url || !anon || !service) return respond(503, { error: 'not_configured' });
  if (!bearer?.startsWith('Bearer ')) return respond(401, { error: 'unauthorized' });
  const auth = createClient(url, anon, { auth: { persistSession: false },
    global: { headers: { Authorization: bearer } } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return respond(401, { error: 'unauthorized' });
  const { data: profile, error: profileError } = await auth.from('profiles')
    .select('organization_id,role').eq('id', user.id).maybeSingle();
  // Until department ACL integration is complete, only tenant admins can read transcripts.
  if (profileError || !profile?.organization_id || profile.role !== 'admin') {
    return respond(403, { error: 'admin_required' });
  }
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await db.from('voicemail_messages')
    .select('id,received_at,caller_number,contact_id,state,summary,transcript,department,urgent,callback_requested')
    .eq('organization_id', profile.organization_id)
    .in('state', ['ready', 'review'])
    .order('received_at', { ascending: false }).limit(50);
  if (error) return respond(503, { error: 'voicemail_unavailable' });
  return respond(200, { messages: data ?? [] });
});
