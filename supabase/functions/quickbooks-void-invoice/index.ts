import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  corsHeaders,
  getSupabaseAdmin,
  getConnection,
  qboRequest,
  logSyncOperation,
} from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: profile } = await authClient
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.organization_id) return jsonResponse({ error: 'No organization found' }, 403);

    const body = await req.json().catch(() => ({}));
    const { invoiceId } = body;

    if (!invoiceId) {
      return jsonResponse({ error: 'invoiceId is required' }, 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('id, qbo_invoice_id, status, organization_id, invoice_number')
      .eq('id', invoiceId)
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    if (invError || !invoice) {
      return jsonResponse({ error: 'Invoice not found' }, 404);
    }

    if (!invoice.qbo_invoice_id) {
      return jsonResponse({ success: true, message: 'No QBO mapping — nothing to void' });
    }

    const connection = await getConnection(supabase, profile.organization_id);
    if (!connection) {
      return jsonResponse({ error: 'QuickBooks not connected' }, 400);
    }

    const fetchResult = await qboRequest(
      supabase,
      connection,
      'GET',
      `invoice/${invoice.qbo_invoice_id}?minorversion=40`
    );

    if (!fetchResult.ok || !fetchResult.data?.Invoice) {
      console.warn('Could not fetch QBO invoice for void — may already be void/deleted');
      return jsonResponse({ success: true, message: 'QBO invoice not found — may already be void' });
    }

    const syncToken = fetchResult.data.Invoice.SyncToken;

    const voidResult = await qboRequest(
      supabase,
      connection,
      'POST',
      `invoice?operation=void&minorversion=40`,
      {
        Id: invoice.qbo_invoice_id,
        SyncToken: syncToken,
      }
    );

    if (!voidResult.ok) {
      console.error('QBO void failed:', voidResult.data);
      await logSyncOperation(
        supabase,
        profile.organization_id,
        'to_quickbooks',
        'void',
        'invoice',
        invoiceId,
        invoice.qbo_invoice_id,
        'failed',
        'QBO void operation failed'
      );
      return jsonResponse(
        {
          success: false,
          error: 'QBO void failed — MJV invoice is still voided. Sync will retry.',
          qbo_error: voidResult.data,
        },
        502
      );
    }

    await logSyncOperation(
      supabase,
      profile.organization_id,
      'to_quickbooks',
      'void',
      'invoice',
      invoiceId,
      invoice.qbo_invoice_id,
      'success'
    );

    return jsonResponse({ success: true, qbo_invoice_id: invoice.qbo_invoice_id });
  } catch (error: any) {
    console.error('Void invoice error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
