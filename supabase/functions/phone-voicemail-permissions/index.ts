import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { PHONE_DEPARTMENTS } from '../_shared/phone-voicemail-acl.ts';

/** Admin-only grant administration. Organization is resolved from verified JWT. */
Deno.serve(async (request: Request): Promise<Response> => {
  const allowed = Deno.env.get('PHONE_DISPATCHER_APP_ORIGIN');
  const origin = request.headers.get('origin');
  const cors = allowed && origin === allowed ? {
    'access-control-allow-origin': allowed, vary: 'Origin',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods': 'GET,PUT,OPTIONS',
  } : {};
  const respond = (status: number, value: unknown) => new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors },
  });
  if (request.method === 'OPTIONS') return new Response(null, {
    status: allowed && origin === allowed ? 204 : 403, headers: cors,
  });
  if (origin && origin !== allowed) return respond(403, { error: 'forbidden_origin' });
  if (!['GET', 'PUT'].includes(request.method)) return respond(405, { error: 'method_not_allowed' });
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
  if (profileError || !profile?.organization_id || profile.role !== 'admin') {
    return respond(403, { error: 'admin_required' });
  }
  const db = createClient(url, service, { auth: { persistSession: false } });
  const organizationId = profile.organization_id;
  if (request.method === 'GET') {
    const { data: people, error: peopleError } = await db.from('profiles')
      .select('id,full_name,email,role').eq('organization_id', organizationId)
      .eq('is_active', true).eq('my_job_view_enabled', true)
      .order('full_name').limit(250);
    const { data: grants, error: grantsError } = await db.from('phone_voicemail_department_access')
      .select('user_id,department').eq('organization_id', organizationId);
    if (peopleError || grantsError) return respond(503, { error: 'permissions_unavailable' });
    return respond(200, { people: people ?? [], grants: grants ?? [], departments: PHONE_DEPARTMENTS });
  }
  let targetId: string;
  let departments: string[];
  try {
    const body = await request.json() as { userId?: unknown; departments?: unknown };
    if (typeof body.userId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(body.userId) ||
        !Array.isArray(body.departments) ||
        body.departments.some(d => typeof d !== 'string' || !PHONE_DEPARTMENTS.includes(d as typeof PHONE_DEPARTMENTS[number]))) {
      return respond(400, { error: 'invalid_permissions' });
    }
    targetId = body.userId;
    departments = [...new Set(body.departments)] as string[];
  } catch { return respond(400, { error: 'invalid_json' }); }
  const { data: target, error: targetError } = await db.from('profiles')
    .select('id').eq('id', targetId).eq('organization_id', organizationId)
    .eq('is_active', true).eq('my_job_view_enabled', true).maybeSingle();
  if (targetError || !target) return respond(404, { error: 'user_not_found' });
  const { error: saveError } = await db.rpc('replace_phone_voicemail_department_grants', {
    p_organization_id: organizationId, p_user_id: targetId, p_departments: departments,
  });
  if (saveError) return respond(503, { error: 'save_failed' });
  return respond(200, { saved: true });
});
