import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  corsHeaders,
  getSupabaseAdmin,
  getConnection,
  qboRequest,
  createSyncRun,
  completeSyncRun,
  logSyncOperation,
  upsertEntityMapping,
} from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return jsonResponse({ error: 'No organization found' }, 403);
    }

    const supabase = getSupabaseAdmin();
    const connection = await getConnection(supabase, profile.organization_id);

    if (!connection) {
      return jsonResponse({ error: 'QuickBooks not connected' }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const qboCustomerId = body.qboCustomerId as string | undefined;
    const runType = body.runType === 'manual' ? 'manual' : 'webhook';
    const runId = await createSyncRun(supabase, profile.organization_id, runType, 'customer');

    if (qboCustomerId) {
      const result = await syncOneCustomer(supabase, connection, profile.organization_id, qboCustomerId);
      if (runId) await completeSyncRun(supabase, runId, result.success ? 'completed' : 'failed', result.success ? 1 : 0, result.error);
      return jsonResponse(result, result.success ? 200 : 500);
    }

    const result = await qboRequest(supabase, connection, 'GET', 'query?query=select%20*%20from%20Customer%20STARTPOSITION%201%20MAXRESULTS%201000');
    if (!result.ok) {
      if (runId) await completeSyncRun(supabase, runId, 'failed', 0, 'Failed to fetch customers');
      return jsonResponse({ error: 'Failed to fetch customers from QuickBooks' }, 500);
    }

    const customers = result.data?.QueryResponse?.Customer || [];
    let synced = 0;
    let failed = 0;

    for (const customer of customers) {
      const syncResult = await syncCustomer(supabase, profile.organization_id, customer);
      if (syncResult.success) synced++;
      else failed++;
    }

    await supabase
      .from('quickbooks_settings')
      .update({
        last_synced_at: new Date().toISOString(),
        last_customer_sync_at: new Date().toISOString(),
        last_fetch_count: customers.length,
        last_fetch_completed_at: new Date().toISOString(),
        sync_health: failed > 0 ? 'degraded' : 'healthy',
      })
      .eq('id', connection.id);

    if (runId) {
      await completeSyncRun(
        supabase,
        runId,
        failed > 0 ? 'failed' : 'completed',
        synced,
        failed > 0 ? `${failed} customer records failed` : null
      );
    }

    return jsonResponse({ success: true, total: customers.length, synced, failed });
  } catch (error: any) {
    console.error('Customer sync error:', error);
    return jsonResponse({ error: error.message || 'Customer sync failed' }, 500);
  }
});

async function syncOneCustomer(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  organizationId: string,
  qboCustomerId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await qboRequest(supabase, connection, 'GET', `customer/${qboCustomerId}?minorversion=40`);
  if (!result.ok || !result.data?.Customer) {
    return { success: false, error: 'Customer not found in QuickBooks' };
  }
  return syncCustomer(supabase, organizationId, result.data.Customer);
}

async function syncCustomer(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  customer: any
): Promise<{ success: boolean; error?: string }> {
  const qboId = String(customer.Id);

  try {
    const email = customer.PrimaryEmailAddr?.Address || null;
    const phone = customer.PrimaryPhone?.FreeFormNumber || null;

    const { data: mapped } = await supabase
      .from('qbo_entity_mappings')
      .select('local_id')
      .eq('organization_id', organizationId)
      .eq('entity_type', 'customer')
      .eq('qbo_id', qboId)
      .maybeSingle();

    let contactId = mapped?.local_id || null;

    if (!contactId && email) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('email', email)
        .maybeSingle();
      contactId = contact?.id || null;
    }

    if (!contactId && phone) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone', phone)
        .maybeSingle();
      contactId = contact?.id || null;
    }

    if (contactId) {
      await supabase
        .from('contacts')
        .update({
          qbo_customer_id: qboId,
          qbo_sync_status: 'synced',
          qbo_synced_at: new Date().toISOString(),
          qbo_sync_error: null,
        })
        .eq('id', contactId)
        .eq('organization_id', organizationId);

      await upsertEntityMapping(supabase, organizationId, 'customer', contactId, qboId, customer.SyncToken);
      await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'update', 'customer', contactId, qboId, 'success');
      return { success: true };
    }

    const displayName = customer.DisplayName || `${customer.GivenName || ''} ${customer.FamilyName || ''}`.trim();
    const missingFields: string[] = [];
    if (!displayName) missingFields.push('name');
    if (!email && !phone) missingFields.push('email_or_phone');

    const completenessStatus = missingFields.length === 0 ? 'complete' : (displayName ? 'partial' : 'minimal');
    const completenessScore = Math.max(0, 100 - missingFields.length * 30);

    await supabase
      .from('quickbooks_staged_customers')
      .upsert({
        organization_id: organizationId,
        qbo_customer_id: qboId,
        qbo_sync_token: customer.SyncToken || null,
        company_name: customer.CompanyName || null,
        given_name: customer.GivenName || null,
        family_name: customer.FamilyName || null,
        display_name: customer.DisplayName || null,
        primary_email: email,
        primary_phone: phone,
        mobile_phone: customer.Mobile?.FreeFormNumber || null,
        billing_address: customer.BillAddr || null,
        shipping_address: customer.ShipAddr || null,
        notes: customer.Notes || null,
        is_active: customer.Active !== false,
        balance: customer.Balance || 0,
        raw_data: customer,
        completeness_status: completenessStatus,
        missing_fields: missingFields,
        completeness_score: completenessScore,
        import_status: 'pending',
      }, {
        onConflict: 'organization_id,qbo_customer_id',
      });

    await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'stage', 'customer', null, qboId, 'success');
    return { success: true };
  } catch (error: any) {
    await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'sync', 'customer', null, qboId, 'failed', error.message);
    return { success: false, error: error.message };
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
