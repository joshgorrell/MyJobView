import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/**
 * Admin-only status and disconnect endpoint. Never exposes OAuth credentials.
 * Disconnect disables mailboxes before deleting the stored credentials.
 * RingCentral-side revocation remains a separate provider operation.
 */
Deno.serve(async (request: Request): Promise<Response> => {
  const allowedOrigin = Deno.env.get('PHONE_DISPATCHER_APP_ORIGIN');
  const origin = request.headers.get('origin');
  const cors = allowedOrigin && origin === allowedOrigin
    ? { 'access-control-allow-origin': allowedOrigin, vary: 'Origin',
        'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
        'access-control-allow-methods': 'GET,DELETE,OPTIONS' } : {};
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors },
  });
  if (request.method === 'OPTIONS') return new Response(null, {
    status: origin === allowedOrigin && !!allowedOrigin ? 204 : 403, headers: cors,
  });
  if (origin && origin !== allowedOrigin) return reply(403, { error: 'forbidden_origin' });
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    return reply(405, { error: 'method_not_allowed' });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization');
  if (!url || !anon || !service) return reply(503, { error: 'not_configured' });
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });
  const auth = createClient(url, anon, {
    auth: { persistSession: false }, global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return reply(401, { error: 'unauthorized' });
  const { data: profile, error: profileError } = await auth.from('profiles')
    .select('organization_id,role').eq('id', user.id).maybeSingle();
  if (profileError || !profile?.organization_id || profile.role !== 'admin') {
    return reply(403, { error: 'admin_required' });
  }
  const db = createClient(url, service, { auth: { persistSession: false } });
  const org = profile.organization_id;
  if (request.method === 'GET') {
    const { data: connections, error } = await db.from('ringcentral_oauth_connections')
      .select('ringcentral_account_id,status,updated_at')
      .eq('organization_id', org).order('updated_at', { ascending: false });
    if (error) return reply(503, { error: 'status_unavailable' });
    const { data: mailboxes, error: mailboxError } = await db.from('ringcentral_mailboxes')
      .select('ringcentral_account_id,ringcentral_extension_id,enabled')
      .eq('organization_id', org);
    if (mailboxError) return reply(503, { error: 'status_unavailable' });
    return reply(200, {
      connections: (connections ?? []).map(c => ({
        accountId: c.ringcentral_account_id, status: c.status, updatedAt: c.updated_at,
        mailboxes: (mailboxes ?? []).filter(m => m.ringcentral_account_id === c.ringcentral_account_id)
          .map(m => ({ extensionId: m.ringcentral_extension_id, enabled: m.enabled })),
      })),
    });
  }
  let accountId: string;
  try {
    const payload = await request.json() as { accountId?: unknown; confirm?: unknown };
    if (typeof payload.accountId !== 'string' || !/^[0-9]{1,32}$/.test(payload.accountId) ||
        payload.confirm !== true) return reply(400, { error: 'invalid_confirmation' });
    accountId = payload.accountId;
  } catch { return reply(400, { error: 'invalid_json' }); }
  // Disable ingestion before credential deletion, preserving existing message history.
  const { error: disableError } = await db.from('ringcentral_mailboxes')
    .update({ enabled: false }).eq('organization_id', org)
    .eq('ringcentral_account_id', accountId);
  if (disableError) return reply(503, { error: 'disconnect_failed' });
  const { error: deleteError } = await db.from('ringcentral_oauth_connections')
    .delete().eq('organization_id', org).eq('ringcentral_account_id', accountId);
  if (deleteError) return reply(503, { error: 'disconnect_failed' });
  return reply(200, { disconnected: true });
});
