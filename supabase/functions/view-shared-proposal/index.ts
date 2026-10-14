import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { token } = await req.json();
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return json({ error: 'Invalid or expired link' }, 404);
    const hash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: link, error: linkError } = await db.from('proposal_share_links')
      .select('proposal_id,organization_id,portal_version,expires_at,revoked_at')
      .eq('token_hash', hash).maybeSingle();
    if (linkError || !link || link.revoked_at || (link.expires_at && Date.parse(link.expires_at) <= Date.now())) return json({ error: 'Invalid or expired link' }, 404);
    const { data: proposal, error: proposalError } = await db.from('proposals')
      .select('id,organization_id,proposal_number,title,status,total,current_portal_version,expires_at,sent_at')
      .eq('id', link.proposal_id).eq('organization_id', link.organization_id).maybeSingle();
    if (proposalError || !proposal || !['sent', 'portal', 'approved', 'accepted'].includes(proposal.status)) return json({ error: 'This proposal link is no longer valid' }, 410);
    // Approval and link viewing use the same stored submission expiration. Resubmission resets expires_at.
    if (!proposal.sent_at || !Number.isFinite(Date.parse(proposal.sent_at)) ||
      (proposal.expires_at && Date.now() >= Date.parse(proposal.expires_at))) {
      return json({ error: 'This proposal viewing period has expired. Please request a resubmission.' }, 410);
    }
    // Deliberately limited projection: never return contacts, internal notes, pricing details or other tenant data.
    return json({ proposal: { id: proposal.id, number: proposal.proposal_number, title: proposal.title, status: proposal.status, total: proposal.total, expiresAt: proposal.expires_at } });
  } catch (error) {
    console.error('Proposal share validation failed', error);
    return json({ error: 'Unable to validate link' }, 500);
  }
});
