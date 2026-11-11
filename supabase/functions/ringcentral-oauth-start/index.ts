import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createRingCentralOAuthState, ringCentralAuthorizeUrl } from '../_shared/ringcentral-oauth-code-flow.ts';
import { registerRingCentralState } from '../_shared/ringcentral-oauth-state.ts';
import { SupabaseRingCentralStateStore } from '../_shared/ringcentral-oauth-state-store.ts';

Deno.serve(async (request: Request): Promise<Response> => {
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('RINGCENTRAL_CLIENT_ID');
  const redirectUri = Deno.env.get('RINGCENTRAL_REDIRECT_URI');
  const origin = Deno.env.get('RINGCENTRAL_API_ORIGIN') ?? 'https://platform.ringcentral.com';
  const authorization = request.headers.get('authorization');
  if (!url || !anon || !service || !clientId || !redirectUri) return reply(503, { error: 'not_configured' });
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });
  const auth = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return reply(401, { error: 'unauthorized' });
  const { data: profile, error: profileError } = await auth.from('profiles')
    .select('organization_id,role').eq('id', user.id).maybeSingle();
  if (profileError || !profile?.organization_id || profile.role !== 'admin') {
    return reply(403, { error: 'admin_required' });
  }
  try {
    const state = createRingCentralOAuthState();
    const admin = createClient(url, service, { auth: { persistSession: false } });
    await registerRingCentralState(new SupabaseRingCentralStateStore(admin), state, {
      organization_id: profile.organization_id, initiated_by: user.id, redirect_uri: redirectUri,
    });
    const authorizationUrl = ringCentralAuthorizeUrl({ origin, clientId, redirectUri, state });
    return reply(200, { authorizationUrl });
  } catch {
    return reply(503, { error: 'authorization_unavailable' });
  }
});
