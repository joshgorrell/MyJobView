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

    await supabase
      .from('quickbooks_settings')
      .update({
        last_synced_at: new Date().toISOString(),
        last_payment_sync_at: new Date().toISOString(),
        payment_sync_status: failed > 0 ? 'error' : 'idle',
        sync_health: failed > 0 ? 'degraded' : 'healthy',
      })
      .eq('id', connection.id);

    if (runId) {
      await completeSyncRun(supabase, runId, failed > 0 ? 'failed' : 'completed', synced, failed > 0 ? `${failed} payment records failed` : null);
    }
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
    const customerId = payment.CustomerRef?.value;
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('qbo_customer_id', customerId)
      .maybeSingle();

    if (!contact) {
      await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'sync', 'payment', null, qboPaymentId, 'success', null, { reason: 'Contact not found' });
      return { success: true };
    }

    let linked = 0;
    for (const line of payment.Line || []) {
      for (const transaction of line.LinkedTxn || []) {
        if (transaction.TxnType !== 'Invoice') continue;
        const qboInvoiceId = String(transaction.TxnId);
        const amount = Number(line.Amount || 0);

        const { data: invoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('qbo_invoice_id', qboInvoiceId)
          .maybeSingle();

        if (!invoice) continue;

        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('invoice_id', invoice.id)
          .eq('qbo_payment_id', qboPaymentId)
          .maybeSingle();

        if (existingPayment) {
          await supabase
            .from('payments')
            .update({
              amount,
              payment_date: payment.TxnDate,
              payment_method: payment.PaymentMethodRef?.name || 'QuickBooks',
              reference_number: payment.PaymentRefNum,
            })
            .eq('id', existingPayment.id)
            .eq('invoice_id', invoice.id);
        } else {
          const { data: insertedPayment, error: paymentError } = await supabase
            .from('payments')
            .insert({
              invoice_id: invoice.id,
              contact_id: contact.id,
              amount,
              payment_date: payment.TxnDate,
              payment_method: payment.PaymentMethodRef?.name || 'QuickBooks',
              qbo_payment_id: qboPaymentId,
              reference_number: payment.PaymentRefNum,
            })
            .select('id')
            .maybeSingle();

          if (paymentError) throw paymentError;
          if (insertedPayment) {
            await upsertEntityMapping(supabase, organizationId, 'payment', insertedPayment.id, qboPaymentId, payment.SyncToken);
          }
        }

        await reconcileInvoiceBalance(supabase, connection, organizationId, invoice.id, qboInvoiceId);
        await processPendingPayment(supabase, organizationId, contact.id, qboInvoiceId, payment, amount);
        linked++;
      }
    }

    await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'sync', 'payment', null, qboPaymentId, 'success', null, { linkedInvoices: linked });
    return { success: true };
  } catch (error: any) {
    await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'sync', 'payment', null, qboPaymentId, 'failed', error.message);
    return { success: false, error: error.message };
  }
}

async function reconcileInvoiceBalance(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  organizationId: string,
  invoiceId: string,
  qboInvoiceId: string
): Promise<void> {
  const invoiceResult = await qboRequest(supabase, connection, 'GET', `invoice/${qboInvoiceId}?minorversion=40`);
  if (!invoiceResult.ok || !invoiceResult.data?.Invoice) return;

  const qboInvoice = invoiceResult.data.Invoice;
  const total = Number(qboInvoice.TotalAmt || 0);
  const amountDue = Number(qboInvoice.Balance || 0);
  const amountPaid = Math.max(0, total - amountDue);
  const status = amountDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'sent';

  await supabase
    .from('invoices')
    .update({ total, amount_paid: amountPaid, amount_due: amountDue, status })
    .eq('id', invoiceId)
    .eq('organization_id', organizationId);
}

async function processPendingPayment(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  contactId: string,
  qboInvoiceId: string,
  payment: any,
  amount: number
): Promise<void> {
  const { data: pendingPayment } = await supabase
    .from('pending_payments')
    .select('*')
    .eq('qbo_invoice_id', qboInvoiceId)
    .eq('status', 'awaiting_payment')
    .maybeSingle();

  if (!pendingPayment) return;

  if (pendingPayment.payment_type === 'vip_subscription') {
    const { data: existing } = await supabase
      .from('subscription_payments')
      .select('id')
      .eq('qbo_payment_id', payment.Id)
      .maybeSingle();

    if (!existing) {
      await supabase.from('subscription_payments').insert({
        subscription_id: pendingPayment.related_id,
        contact_id: contactId,
        amount,
        payment_date: payment.TxnDate,
        payment_type: 'vip_subscription',
        qbo_payment_id: payment.Id,
        qbo_invoice_id: qboInvoiceId,
        status: 'completed',
      });
    }

    await supabase
      .from('recurring_subscriptions')
      .update({ status: 'active' })
      .eq('id', pendingPayment.related_id)
      .eq('organization_id', organizationId)
      .eq('status', 'pending_payment');
  } else if (pendingPayment.payment_type === 'security_contract') {
    await supabase
      .from('security_contracts')
      .update({ status: 'active', activated_at: new Date().toISOString() })
      .eq('id', pendingPayment.related_id)
      .eq('organization_id', organizationId)
      .eq('status', 'pending_payment');
  }

  await supabase
    .from('pending_payments')
    .update({ status: 'paid', completed_at: new Date().toISOString() })
    .eq('id', pendingPayment.id)
    .eq('organization_id', organizationId)
    .eq('status', 'awaiting_payment');
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
