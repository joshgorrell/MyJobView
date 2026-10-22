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
      .select('id,organization_id,proposal_number,title,status,total,current_portal_version,expires_at,sent_at,contact_id')
      .eq('id', link.proposal_id).eq('organization_id', link.organization_id).maybeSingle();
    if (proposalError || !proposal || !['sent', 'portal', 'approved', 'accepted'].includes(proposal.status)) return json({ error: 'This proposal link is no longer valid' }, 410);
    // A newly published portal revision invalidates an older shared document link.
    // The sender must explicitly issue a link for the current revision.
    if (Number(link.portal_version) !== Number(proposal.current_portal_version ?? 1)) {
      return json({ error: 'This proposal has been revised. Please request the latest link.' }, 410);
    }
    // Approval and link viewing use the same stored submission expiration. Resubmission resets expires_at.
    if (!proposal.sent_at || !Number.isFinite(Date.parse(proposal.sent_at)) ||
      (!proposal.expires_at || !Number.isFinite(Date.parse(proposal.expires_at)) || Date.now() >= Date.parse(proposal.expires_at))) {
      return json({ error: 'This proposal viewing period has expired. Please request a resubmission.' }, 410);
    }
    // Read-only scope preview: explicitly select customer-facing fields, never internal
    // costs, labor rates, hidden items, contact details, or staff-only notes.
    const [roomsResult, itemsResult] = await Promise.all([
      db.from('proposal_rooms').select('id,name,description,show_scope,sort_order')
        .eq('proposal_id', proposal.id).order('sort_order'),
      db.from('proposal_line_items').select('id,room_id,description,quantity,sort_order')
        .eq('proposal_id', proposal.id).eq('is_hidden', false).order('sort_order'),
    ]);
    if (roomsResult.error || itemsResult.error) return json({ error: 'Unable to load proposal scope' }, 500);
    const rooms = (roomsResult.data ?? []).map(room => ({
      id: room.id, name: room.name,
      description: room.show_scope ? room.description : null,
    }));
    const items = (itemsResult.data ?? []).map(item => ({
      id: item.id, roomId: item.room_id, description: item.description, quantity: item.quantity,
    }));
    // Return only the assigned proposal representative's public business contact details.
    // Do not expose profile identifiers, internal roles, or customer contact records.
    const { data: owner } = proposal.contact_id ? await db.from('contacts')
      .select('assigned_to').eq('id', proposal.contact_id)
      .eq('organization_id', link.organization_id).maybeSingle() : { data: null };
    const repId = owner?.assigned_to;
    // A proposal without an assigned customer owner must not silently fall back
    // to the author or a different employee. Staff must repair the assignment.
    let representative: { name: string; email: string | null; phone: string | null } | null = null;
    if (repId) {
      const { data: profile } = await db.from('profiles')
        .select('full_name,email,phone,organization_id')
        .eq('id', repId).eq('organization_id', link.organization_id).maybeSingle();
      if (profile) representative = {
        name: profile.full_name || 'Your representative',
        email: profile.email || null, phone: profile.phone || null,
      };
    }
    // Deliberately limited projection: never return contacts, internal notes, pricing details or other tenant data.
    return json({ proposal: { id: proposal.id, number: proposal.proposal_number, title: proposal.title, status: proposal.status, total: proposal.total, expiresAt: proposal.expires_at }, scope: { rooms, items }, representative, actionsAvailable: false });
  } catch (error) {
    console.error('Proposal share validation failed', error);
    return json({ error: 'Unable to validate link' }, 500);
  }
});
