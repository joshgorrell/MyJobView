import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const hash = async (token: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return json({ error: 'Authentication required' }, 401);
    const { proposalId, action } = await req.json();
    if (typeof proposalId !== 'string' || !/^[0-9a-f-]{36}$/i.test(proposalId)) return json({ error: 'Invalid proposal ID' }, 400);
    if (action !== 'create' && action !== 'revoke') return json({ error: 'Invalid action' }, 400);
    const { data: profile } = await client.from('profiles').select('organization_id').eq('id', auth.user.id).single();
    if (!profile?.organization_id) return json({ error: 'Organization access required' }, 403);
    const { data: proposal } = await client.from('proposals').select('id,organization_id,current_portal_version,status').eq('id', proposalId).eq('organization_id', profile.organization_id).maybeSingle();
    if (!proposal) return json({ error: 'Proposal not found or access denied' }, 404);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    if (action === 'revoke') {
      const { error } = await admin.from('proposal_share_links').update({ revoked_at: new Date().toISOString() }).eq('proposal_id', proposal.id).eq('organization_id', profile.organization_id).is('revoked_at', null);
      if (error) throw error;
      return json({ revoked: true });
    }
    if (!['sent', 'portal', 'approved', 'accepted'].includes(proposal.status)) return json({ error: 'Submit the proposal before sharing' }, 409);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await hash(token);
    const { error } = await admin.from('proposal_share_links').insert({
      proposal_id: proposal.id,
      organization_id: profile.organization_id,
      token_hash: tokenHash,
      created_by: auth.user.id,
      portal_version: proposal.current_portal_version ?? 1,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    if (error) throw error;
    return json({ token, expiresInDays: 30 });
  } catch (error) {
    console.error('Proposal share link operation failed', error);
    return json({ error: 'Unable to manage proposal share link' }, 500);
  }
});
