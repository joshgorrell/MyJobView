import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { permittedVoicemailDepartments, PHONE_DEPARTMENTS } from '../_shared/phone-voicemail-acl.ts';

const statuses = ['new', 'assigned', 'in_progress', 'completed'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (request: Request) => {
  const allowed = Deno.env.get('PHONE_DISPATCHER_APP_ORIGIN');
  const origin = request.headers.get('origin');
  const cors = allowed && origin === allowed ? {
    'access-control-allow-origin': allowed, vary: 'Origin',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  } : {};
  const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), {
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
  const org = profile.organization_id;
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: grants, error: grantError } = await db.from('phone_voicemail_department_access')
    .select('department').eq('organization_id', org).eq('user_id', user.id);
  if (grantError) return respond(503, { error: 'permissions_unavailable' });
  const allowedDepartments = permittedVoicemailDepartments(profile.role, (grants ?? []).map(g => g.department));
  if (!allowedDepartments.length) return respond(403, { error: 'access_denied' });
  if (request.method === 'GET') {
    const { data: people, error } = await db.from('profiles').select('id,full_name')
      .eq('organization_id', org).eq('is_active', true).order('full_name').limit(250);
    if (error) return respond(503, { error: 'people_unavailable' });
    return respond(200, { people: people ?? [], departments: allowedDepartments });
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return respond(400, { error: 'invalid_json' }); }
  if (typeof body.id !== 'string' || !uuid.test(body.id)) return respond(400, { error: 'invalid_id' });
  const department = body.department;
  const assignee = body.assigned_user_id;
  const status = body.workflow_status;
  const note = body.note;
  if (department !== undefined && department !== null &&
      (typeof department !== 'string' || !PHONE_DEPARTMENTS.includes(department as typeof PHONE_DEPARTMENTS[number]))) {
    return respond(400, { error: 'invalid_department' });
  }
  if (assignee !== undefined && assignee !== null && (typeof assignee !== 'string' || !uuid.test(assignee))) {
    return respond(400, { error: 'invalid_assignee' });
  }
  if (status !== undefined && (typeof status !== 'string' || !statuses.includes(status as typeof statuses[number]))) {
    return respond(400, { error: 'invalid_status' });
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) return respond(400, { error: 'invalid_note' });
  if (department === undefined && assignee === undefined && status === undefined && note === undefined) {
    return respond(400, { error: 'no_changes' });
  }
  const { data: message, error: lookupError } = await db.from('voicemail_messages')
    .select('id,department,assigned_user_id,workflow_status,state')
    .eq('organization_id', org).eq('id', body.id).maybeSingle();
  if (lookupError) return respond(503, { error: 'voicemail_unavailable' });
  if (!message || !['ready', 'review'].includes(message.state) ||
      (profile.role !== 'admin' && !allowedDepartments.includes(message.department))) {
    return respond(404, { error: 'not_found' });
  }
  const nextDepartment = department === undefined ? message.department : department;
  if (profile.role !== 'admin' && (!nextDepartment || !allowedDepartments.includes(nextDepartment))) {
    return respond(403, { error: 'department_forbidden' });
  }
  if (assignee) {
    const { data: target, error: targetError } = await db.from('profiles')
      .select('id,role').eq('id', assignee).eq('organization_id', org)
      .eq('is_active', true).maybeSingle();
    if (targetError) return respond(503, { error: 'assignee_unavailable' });
    if (!target) return respond(400, { error: 'assignee_not_found' });
    if (target.role !== 'admin') {
      const { data: targetGrants, error: targetGrantError } = await db.from('phone_voicemail_department_access')
        .select('department').eq('organization_id', org).eq('user_id', assignee);
      if (targetGrantError) return respond(503, { error: 'assignee_permissions_unavailable' });
      if (!nextDepartment || !(targetGrants ?? []).some(g => g.department === nextDepartment)) {
        return respond(400, { error: 'assignee_department_mismatch' });
      }
    }
  }
  const nextAssignee = assignee === undefined ? message.assigned_user_id : assignee;
  // Re-routing must clear a previous assignee unless the new department explicitly permits them.
  if (nextAssignee && department !== undefined && department !== message.department && assignee === undefined) {
    return respond(400, { error: 'reassignment_required' });
  }
  const nextStatus = status ?? message.workflow_status;
  const { data: committed, error: commitError } = await db.rpc('commit_phone_voicemail_assignment', {
    p_organization_id: org, p_voicemail_id: message.id, p_actor_user_id: user.id,
    p_expected_department: message.department, p_expected_assignee: message.assigned_user_id,
    p_expected_status: message.workflow_status, p_department: nextDepartment,
    p_assignee: nextAssignee, p_status: nextStatus, p_note: note ?? null,
  });
  if (commitError) return respond(503, { error: 'assignment_save_failed' });
  if (!committed) return respond(409, { error: 'voicemail_changed_reload' });
  return respond(200, { ok: true, department: nextDepartment, assigned_user_id: nextAssignee,
    workflow_status: nextStatus });
});
