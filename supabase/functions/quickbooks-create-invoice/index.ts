import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, getSupabaseAdmin, getConnection, qboRequest, upsertEntityMapping } from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

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

    const { data: profile } = await authClient
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.organization_id) return jsonResponse({ error: 'No organization found' }, 403);

    const body = await req.json();
    const leadId = typeof body.leadId === 'string' ? body.leadId : null;
    const amount = Number(body.amount);
    if (!leadId || !Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: 'Invalid invoice request' }, 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: lead } = await supabase
      .from('leads')
      .select('id, organization_id, qbo_customer_id, opportunity_description')
      .eq('id', leadId)
      .eq('organization_id', profile.organization_id)
      .maybeSingle();
    if (!lead?.qbo_customer_id) return jsonResponse({ error: 'Lead is not linked to QuickBooks' }, 400);

    const connection = await getConnection(supabase, profile.organization_id);
    if (!connection) return jsonResponse({ error: 'QuickBooks not connected' }, 400);

    const items = Array.isArray(body.lineItems) && body.lineItems.length > 0
      ? body.lineItems.map((item: any, index: number) => ({
          LineNum: index + 1,
          Amount: Number(item.amount),
          DetailType: 'SalesItemLineDetail',
          Description: String(item.description || 'Services'),
          SalesItemLineDetail: {
            Qty: Number(item.quantity || 1),
            UnitPrice: Number(item.unitPrice || item.amount),
          },
        }))
      : [{
          LineNum: 1,
          Amount: amount,
          DetailType: 'SalesItemLineDetail',
          Description: String(body.description || lead.opportunity_description || 'Services'),
          SalesItemLineDetail: { Qty: 1, UnitPrice: amount },
        }];

    const result = await qboRequest(supabase, connection, 'POST', 'invoice', {
      CustomerRef: { value: lead.qbo_customer_id },
      Line: items,
      TxnDate: new Date().toISOString().slice(0, 10),
    });

    const invoice = result.data?.Invoice;
    if (!result.ok || !invoice?.Id) {
      console.error('Legacy invoice creation failed:', result.status);
      return jsonResponse({ error: 'Invoice creation failed' }, 502);
    }

    await upsertEntityMapping(supabase, profile.organization_id, 'invoice', leadId, String(invoice.Id), invoice.SyncToken);
    return jsonResponse({
      success: true,
      invoiceId: invoice.Id,
      invoiceNumber: invoice.DocNumber,
      totalAmount: invoice.TotalAmt,
    });
  } catch (error) {
    console.error('Legacy invoice creation failed:', error);
    return jsonResponse({ error: 'Invoice creation failed' }, 500);
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
