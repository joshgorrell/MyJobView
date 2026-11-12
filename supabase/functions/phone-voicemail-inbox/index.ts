import { permittedVoicemailDepartments } from '../_shared/phone-voicemail-acl.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/** Read-only, tenant-isolated voicemail review feed. No recordings or secrets exposed. */
Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin');
  const allowed = Deno.env.get('PHONE_DISPATCHER_APP_ORIGIN');
  const cors = allowed && origin === allowed ? {
    'access-control-allow-origin': allowed, vary: 'Origin',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  } : {};
  const respond = (status: number, value: unknown) => new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors },
  });
  if (request.method === 'OPTIONS') return new Response(null, {
    status: allowed && origin === allowed ? 204 : 403, headers: cors,
  });
  if (origin && origin !== allowed) return respond(403, { error: 'forbidden_origin' });
  if (!['GET', 'POST'].includes(request.method)) return respond(405, { error: 'method_not_allowed' });
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
  if (profileError || !profile?.organization_id) return respond(403, { error: 'access_denied' });
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: grants, error: grantError } = await db.from('phone_voicemail_department_access')
    .select('department').eq('organization_id', profile.organization_id).eq('user_id', user.id);
  if (grantError) return respond(503, { error: 'permissions_unavailable' });
  const permittedDepartments = permittedVoicemailDepartments(profile.role, (grants ?? []).map(g => g.department));
  if (permittedDepartments.length === 0) return respond(403, { error: 'access_denied' });
  if (request.method === 'POST') {
    let payload: { id?: unknown };
    try { payload = await request.json(); } catch { return respond(400, { error: 'invalid_body' }); }
    if (typeof payload.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.id)) return respond(400, { error: 'invalid_id' });
    const { data: target, error: targetError } = await db.from('voicemail_messages')
      .select('id,department,state').eq('organization_id', profile.organization_id).eq('id', payload.id).maybeSingle();
    if (targetError) return respond(503, { error: 'voicemail_unavailable' });
    if (!target || !['ready','review'].includes(target.state) ||
        (profile.role !== 'admin' && !permittedDepartments.includes(target.department))) return respond(404, { error: 'not_found' });
    const { error: markError } = await db.from('phone_voicemail_views').upsert({
      organization_id: profile.organization_id, voicemail_id: target.id, user_id: user.id,
      viewed_at: new Date().toISOString(),
    }, { onConflict: 'voicemail_id,user_id' });
    if (markError) return respond(503, { error: 'read_state_unavailable' });
    return respond(200, { ok: true });
  }
  let query = db.from('voicemail_messages')
    .select('id,received_at,caller_number,contact_id,state,summary,transcript,department,urgent,callback_requested')
    .eq('organization_id', profile.organization_id)
    .in('state', ['ready', 'review']);
  if (profile.role !== 'admin') query = query.in('department', permittedDepartments);
  const { data, error } = await query.order('received_at', { ascending: false }).limit(50);
  if (error) return respond(503, { error: 'voicemail_unavailable' });
  const ids = (data ?? []).map(message => message.id);
  if (!ids.length) return respond(200, { messages: [], unread_count: 0 });
  const { data: views, error: viewError } = await db.from('phone_voicemail_views')
    .select('voicemail_id').eq('organization_id', profile.organization_id)
    .eq('user_id', user.id).in('voicemail_id', ids);
  if (viewError) return respond(503, { error: 'read_state_unavailable' });
  const viewed = new Set((views ?? []).map(view => view.voicemail_id));
  const messages = (data ?? []).map(message => ({ ...message, is_read: viewed.has(message.id) }));
  return respond(200, { messages, unread_count: messages.filter(message => !message.is_read).length });
});
