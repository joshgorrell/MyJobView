import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  corsHeaders,
  getSupabaseAdmin,
  getConnection,
  qboRequest,
  createSyncRun,
  completeSyncRun,
  upsertEntityMapping,
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

    const supabase = getSupabaseAdmin();
    const connection = await getConnection(supabase, profile.organization_id);
    if (!connection) return jsonResponse({ error: 'QuickBooks not connected' }, 400);

    const body = await req.json().catch(() => ({}));
    const runId = await createSyncRun(supabase, profile.organization_id, body.runType === 'manual' ? 'manual' : 'scheduled', 'payment');
    const paymentId = body.paymentId as string | undefined;

    if (paymentId) {
      const result = await syncPayment(supabase, connection, profile.organization_id, paymentId);
      if (runId) await completeSyncRun(supabase, runId, result.success ? 'completed' : 'failed', result.success ? 1 : 0, result.error);
      return jsonResponse(result, result.success ? 200 : 500);
    }

    const result = await qboRequest(
      supabase,
      connection,
      'GET',
      'query?query=select%20*%20from%20Payment%20STARTPOSITION%201%20MAXRESULTS%201000'
    );
    if (!result.ok) {
      if (runId) await completeSyncRun(supabase, runId, 'failed', 0, 'Failed to fetch payments');
      return jsonResponse({ error: 'Failed to fetch payments from QuickBooks' }, 500);
    }

    const payments = result.data?.QueryResponse?.Payment || [];
    let synced = 0;
    let failed = 0;
    for (const payment of payments) {
      const paymentResult = await syncPaymentData(supabase, connection, profile.organization_id, payment);
      if (paymentResult.success) synced++;
      else failed++;
    }

    if (runId) await completeSyncRun(supabase, runId, failed > 0 ? 'failed' : 'completed', synced, failed > 0 ? `${failed} payment records failed` : null);
    return jsonResponse({ success: true, total: payments.length, synced, failed });
  } catch (error: any) {
    console.error('Payment sync error:', error);
    return jsonResponse({ error: 'Payment sync failed' }, 500);
  }
});

async function syncPayment(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  organizationId: string,
  paymentId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await qboRequest(supabase, connection, 'GET', `payment/${paymentId}?minorversion=40`);
  if (!result.ok || !result.data?.Payment) return { success: false, error: 'Payment not found in QuickBooks' };
  return syncPaymentData(supabase, connection, organizationId, result.data.Payment);
}

async function syncPaymentData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  organizationId: string,
  payment: any
): Promise<{ success: boolean; error?: string }> {
  const qboPaymentId = String(payment.Id);
  try {
    const { data: existingMapping } = await supabase
      .from('qbo_entity_mappings')
      .select('local_id')
      .eq('organization_id', organizationId)
      .eq('entity_type', 'payment')
      .eq('qbo_id', qboPaymentId)
      .maybeSingle();

    if (existingMapping) return { success: true };

    const customerId = payment.CustomerRef?.value;
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('qbo_customer_id', customerId)
      .maybeSingle();

    if (!contact) return { success: true };

    let linked = 0;
    for (const line of payment.Line || []) {
      for (const transaction of line.LinkedTxn || []) {
        if (transaction.TxnType !== 'Invoice') continue;
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('qbo_invoice_id', transaction.TxnId)
          .maybeSingle();
        if (!invoice) continue;

        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('invoice_id', invoice.id)
          .eq('qbo_payment_id', qboPaymentId)
          .maybeSingle();
        if (existingPayment) continue;

        await supabase.from('payments').insert({
          invoice_id: invoice.id,
          contact_id: contact.id,
          amount: Number(line.Amount || 0),
          payment_date: payment.TxnDate,
          payment_method: payment.PaymentMethodRef?.name || 'QuickBooks',
          qbo_payment_id: qboPaymentId,
          reference_number: payment.PaymentRefNum,
        });

        const invoiceResult = await qboRequest(supabase, connection, 'GET', `invoice/${transaction.TxnId}?minorversion=40`);
        if (invoiceResult.ok && invoiceResult.data?.Invoice) {
          const qboInvoice = invoiceResult.data.Invoice;
          const total = Number(qboInvoice.TotalAmt || 0);
          const amountDue = Number(qboInvoice.Balance || 0);
          const amountPaid = Math.max(0, total - amountDue);
          const status = amountDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'sent';
          await supabase.from('invoices').update({ total, amount_paid: amountPaid, amount_due: amountDue, status }).eq('id', invoice.id);
        }
        linked++;
      }
    }

    await upsertEntityMapping(supabase, organizationId, 'payment', qboPaymentId, qboPaymentId);
    await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'sync', 'payment', null, qboPaymentId, 'success', null, { linkedInvoices: linked });
    return { success: true };
  } catch (error: any) {
    await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'sync', 'payment', null, qboPaymentId, 'failed', error.message);
    return { success: false, error: error.message };
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
