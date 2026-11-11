import { canReadVoicemail } from '../_shared/phone-voicemail-acl.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/** Issues a short-lived URL for an authorized voicemail, never a public recording. */
Deno.serve(async (request: Request): Promise<Response> => {
  const allowed = Deno.env.get('PHONE_DISPATCHER_APP_ORIGIN');
  const origin = request.headers.get('origin');
  const cors = allowed && origin === allowed ? {
    'access-control-allow-origin': allowed, vary: 'Origin',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods': 'POST,OPTIONS',
  } : {};
  const respond = (status: number, value: unknown) => new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store',
      'referrer-policy': 'no-referrer', ...cors },
  });
  if (request.method === 'OPTIONS') return new Response(null, {
    status: allowed && origin === allowed ? 204 : 403, headers: cors,
  });
  if (origin && origin !== allowed) return respond(403, { error: 'forbidden_origin' });
  if (request.method !== 'POST') return respond(405, { error: 'method_not_allowed' });
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
  let id: string;
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.id)) {
      return respond(400, { error: 'invalid_id' });
    }
    id = body.id;
  } catch { return respond(400, { error: 'invalid_json' }); }
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: grants, error: grantError } = await db.from('phone_voicemail_department_access')
    .select('department').eq('organization_id', profile.organization_id).eq('user_id', user.id);
  if (grantError) return respond(503, { error: 'permissions_unavailable' });
  const { data: item, error } = await db.from('voicemail_messages')
    .select('recording_path,state,department,organization_id,ringcentral_account_id,ringcentral_extension_id')
    .eq('id', id).eq('organization_id', profile.organization_id)
    .in('state', ['ready', 'review']).maybeSingle();
  if (error) return respond(503, { error: 'recording_unavailable' });
  if (!item?.recording_path ||
      !canReadVoicemail(profile.role, (grants ?? []).map(g => g.department), item.department, item.state)) {
    return respond(404, { error: 'recording_not_found' });
  }
  // Ensure the stored object is scoped to the same organization and mailbox.
  const prefix = [profile.organization_id, item.ringcentral_account_id,
    item.ringcentral_extension_id].join('/') + '/';
  if (!item.recording_path.startsWith(prefix) ||
      item.recording_path.includes('..')) return respond(404, { error: 'recording_not_found' });
  const { data, error: signedError } = await db.storage.from('phone-voicemail-recordings')
    .createSignedUrl(item.recording_path, 60);
  if (signedError || !data?.signedUrl) return respond(503, { error: 'recording_unavailable' });
  return respond(200, { url: data.signedUrl, expiresInSeconds: 60 });
});
