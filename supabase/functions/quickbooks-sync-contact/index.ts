import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, getSupabaseAdmin, getConnection, qboRequest, upsertEntityMapping, logSyncOperation } from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return jsonResponse({ error: 'Unauthorized' }, 401);

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: profile } = await authClient.from('profiles').select('organization_id').eq('id', user.id).maybeSingle();
    if (!profile?.organization_id) return jsonResponse({ error: 'No organization found' }, 403);

    const body = await req.json();
    const contactIds = Array.isArray(body.contactIds) ? body.contactIds : [body.contactId];
    const ids = contactIds.filter((id: unknown): id is string => typeof id === 'string');
    if (ids.length === 0) return jsonResponse({ error: 'contactId or contactIds required' }, 400);

    const supabase = getSupabaseAdmin();
    const connection = await getConnection(supabase, profile.organization_id);
    if (!connection) return jsonResponse({ error: 'QuickBooks not connected' }, 400);

    const results: Array<Record<string, unknown>> = [];
    for (const contactId of ids) {
      const result = await syncContact(supabase, connection, profile.organization_id, contactId);
      results.push({ contactId, ...result });
    }

    return jsonResponse({ success: results.every(result => result.success), results });
  } catch (error) {
    console.error('Contact sync failed:', error);
    return jsonResponse({ error: 'Contact sync failed' }, 500);
  }
});

async function syncContact(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  organizationId: string,
  contactId: string
): Promise<Record<string, unknown>> {
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!contact) return { success: false, error: 'Contact not found' };
  if (contact.qbo_customer_id) return { success: true, qbo_customer_id: contact.qbo_customer_id };
  if (!contact.contact_name || (!contact.email && !contact.phone)) return { success: false, error: 'Contact requires a name and email or phone' };

  const customer: Record<string, unknown> = { DisplayName: contact.contact_name };
  if (contact.company_name) customer.CompanyName = contact.company_name;
  if (contact.first_name) customer.GivenName = contact.first_name;
  if (contact.last_name) customer.FamilyName = contact.last_name;
  if (contact.email) customer.PrimaryEmailAddr = { Address: contact.email };
  if (contact.phone) customer.PrimaryPhone = { FreeFormNumber: contact.phone };
  if (contact.business_phone) customer.Mobile = { FreeFormNumber: contact.business_phone };
  if (contact.notes) customer.Notes = contact.notes;

  const result = await qboRequest(supabase, connection, 'POST', 'customer', customer);
  const qboCustomer = result.data?.Customer;
  if (!result.ok || !qboCustomer?.Id) {
    await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'create', 'customer', contactId, null, 'failed');
    return { success: false, error: 'QuickBooks customer creation failed' };
  }

  await supabase.from('contacts').update({
    qbo_customer_id: qboCustomer.Id,
    qbo_sync_status: 'synced',
    qbo_synced_at: new Date().toISOString(),
    qbo_sync_error: null,
  }).eq('id', contactId).eq('organization_id', organizationId);
  await upsertEntityMapping(supabase, organizationId, 'customer', contactId, String(qboCustomer.Id), qboCustomer.SyncToken);
  await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'create', 'customer', contactId, String(qboCustomer.Id), 'success');

  return { success: true, qbo_customer_id: qboCustomer.Id };
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
