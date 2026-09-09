import { createHmac } from 'node:crypto';
import {
  corsHeaders,
  getSupabaseAdmin,
  getConnectionByRealm,
  qboRequest,
  logSyncOperation,
  upsertEntityMapping,
  getLocalIdByQboId,
} from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const verifierToken = Deno.env.get('QUICKBOOKS_WEBHOOK_TOKEN');
    if (!verifierToken) {
      console.error('QUICKBOOKS_WEBHOOK_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const intuitSignature = req.headers.get('intuit-signature');
    if (!intuitSignature) {
      console.error('Missing intuit-signature header');
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawBody = await req.text();

    const hmac = createHmac('sha256', verifierToken);
    hmac.update(rawBody);
    const hash = hmac.digest('base64');

    if (hash !== intuitSignature) {
      console.error('Invalid webhook signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.parse(rawBody);

    if (!payload.eventNotifications || payload.eventNotifications.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No events' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getSupabaseAdmin();

    for (const notification of payload.eventNotifications) {
      const realmId = notification.realmId;
      const connection = await getConnectionByRealm(supabase, realmId);

      if (!connection) {
        console.log('No connection for realm:', realmId);
        continue;
      }

      await supabase
        .from('quickbooks_settings')
        .update({ last_webhook_at: new Date().toISOString() })
        .eq('id', connection.id);

      for (const entity of notification.dataChangeEvent?.entities || []) {
        const entityType = entity.name;
        const entityId = entity.id;
        const eventId = `${realmId}-${entityType}-${entityId}-${entity.lastUpdated || Date.now()}`;

        const { data: existingEvent } = await supabase
          .from('qbo_webhook_events')
          .select('id, status')
          .eq('organization_id', connection.organization_id)
          .eq('event_id', eventId)
          .maybeSingle();

        if (existingEvent) {
          console.log('Duplicate event skipped:', eventId);
          continue;
        }

        const { error: insertError } = await supabase
          .from('qbo_webhook_events')
          .insert({
            organization_id: connection.organization_id,
            realm_id: realmId,
            entity_type: entityType,
            entity_id: entityId,
            event_id: eventId,
            payload: entity,
            status: 'pending',
          });

        if (insertError) {
          console.error('Failed to record webhook event:', insertError);
          continue;
        }

        if (entityType === 'Payment') {
          await processPaymentEvent(supabase, connection, entityId);
        } else if (entityType === 'Invoice') {
          await processInvoiceEvent(supabase, connection, entityId);
        } else if (entityType === 'Customer') {
          console.log('Customer event received (no action needed for inbound):', entityId);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processPaymentEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  paymentId: string
): Promise<void> {
  const startTime = Date.now();

  const result = await qboRequest(supabase, connection, 'GET', `payment/${paymentId}?minorversion=40`);
  if (!result.ok || !result.data?.Payment) {
    console.error('Failed to fetch payment from QBO:', result.status);
    await markEventProcessed(supabase, connection.organization_id, paymentId, 'failed', 'Failed to fetch payment');
    return;
  }

  const payment = result.data.Payment;
  const customerId = payment.CustomerRef?.value;
  if (!customerId) {
    await markEventProcessed(supabase, connection.organization_id, paymentId, 'processed', 'No customer ref');
    return;
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('qbo_customer_id', customerId)
    .eq('organization_id', connection.organization_id)
    .maybeSingle();

  if (!contact) {
    await markEventProcessed(supabase, connection.organization_id, paymentId, 'processed', 'Contact not found');
    return;
  }

  const existingPaymentId = await getLocalIdByQboId(supabase, connection.organization_id, 'payment', payment.Id);
  if (existingPaymentId) {
    console.log('Payment already processed (idempotent):', payment.Id);
    await markEventProcessed(supabase, connection.organization_id, paymentId, 'processed', 'Already processed');
    return;
  }

  for (const line of payment.Line || []) {
    if (!line.LinkedTxn) continue;

    for (const linkedTxn of line.LinkedTxn) {
      if (linkedTxn.TxnType !== 'Invoice') continue;

      const qboInvoiceId = linkedTxn.TxnId;
      const amount = line.Amount || 0;

      const { data: pendingPayment } = await supabase
        .from('pending_payments')
        .select('*')
        .eq('qbo_invoice_id', qboInvoiceId)
        .eq('status', 'awaiting_payment')
        .maybeSingle();

      if (pendingPayment) {
        if (pendingPayment.payment_type === 'vip_subscription') {
          await supabase
            .from('subscription_payments')
            .insert({
              subscription_id: pendingPayment.related_id,
              contact_id: contact.id,
              amount,
              payment_date: payment.TxnDate,
              payment_method: payment.PaymentMethodRef?.name || 'QuickBooks',
              qbo_payment_id: payment.Id,
              qbo_invoice_id: qboInvoiceId,
              reference_number: payment.PaymentRefNum,
              status: 'completed',
            });

          await supabase
            .from('recurring_subscriptions')
            .update({ status: 'active' })
            .eq('id', pendingPayment.related_id)
            .eq('status', 'pending_payment');

        } else if (pendingPayment.payment_type === 'security_contract') {
          await supabase
            .from('security_contracts')
            .update({ status: 'active', activated_at: new Date().toISOString() })
            .eq('id', pendingPayment.related_id);

        } else if (pendingPayment.payment_type === 'invoice') {
          await recordInvoicePayment(supabase, connection.organization_id, contact.id, pendingPayment.related_id, payment, amount);
        }

        await supabase
          .from('pending_payments')
          .update({ status: 'paid', completed_at: new Date().toISOString() })
          .eq('id', pendingPayment.id);

      } else {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id, total, amount_paid')
          .eq('qbo_invoice_id', qboInvoiceId)
          .eq('organization_id', connection.organization_id)
          .maybeSingle();

        if (invoice) {
          await recordInvoicePayment(supabase, connection.organization_id, contact.id, invoice.id, payment, amount);
        }
      }
    }
  }

  await upsertEntityMapping(supabase, connection.organization_id, 'payment', payment.Id, payment.Id);
  await logSyncOperation(supabase, connection.organization_id, 'from_quickbooks', 'webhook', 'payment', null, payment.Id, 'success', null, null, Date.now() - startTime);
  await markEventProcessed(supabase, connection.organization_id, paymentId, 'processed', null);
}

async function recordInvoicePayment(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  contactId: string,
  invoiceId: string,
  payment: any,
  amount: number
): Promise<void> {
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('qbo_payment_id', payment.Id)
    .eq('invoice_id', invoiceId)
    .maybeSingle();

  if (existingPayment) {
    console.log('Payment already recorded for invoice:', invoiceId);
    return;
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, total, amount_paid')
    .eq('id', invoiceId)
    .maybeSingle();

  if (!invoice) return;

  await supabase
    .from('payments')
    .insert({
      invoice_id: invoiceId,
      contact_id: contactId,
      amount,
      payment_date: payment.TxnDate,
      payment_method: payment.PaymentMethodRef?.name || 'QuickBooks',
      qbo_payment_id: payment.Id,
      reference_number: payment.PaymentRefNum,
    });

  const newAmountPaid = (invoice.amount_paid || 0) + amount;
  const newAmountDue = invoice.total - newAmountPaid;
  const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

  await supabase
    .from('invoices')
    .update({ amount_paid: newAmountPaid, amount_due: newAmountDue, status: newStatus })
    .eq('id', invoiceId);
}

async function processInvoiceEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  invoiceId: string
): Promise<void> {
  const result = await qboRequest(supabase, connection, 'GET', `invoice/${invoiceId}?minorversion=40`);
  if (!result.ok || !result.data?.Invoice) {
    console.error('Failed to fetch invoice from QBO:', result.status);
    await markEventProcessed(supabase, connection.organization_id, invoiceId, 'failed', 'Failed to fetch invoice');
    return;
  }

  const invoice = result.data.Invoice;
  const { data: localInvoice } = await supabase
    .from('invoices')
    .select('id, total, amount_paid, amount_due, status')
    .eq('qbo_invoice_id', invoice.Id)
    .eq('organization_id', connection.organization_id)
    .maybeSingle();

  if (localInvoice) {
    const balance = parseFloat(invoice.Balance || '0');
    const total = parseFloat(invoice.TotalAmt || '0');
    const amountPaid = total - balance;
    const status = balance <= 0 ? 'paid' : (amountPaid > 0 ? 'partial' : 'sent');

    await supabase
      .from('invoices')
      .update({
        total,
        amount_paid: amountPaid,
        amount_due: balance,
        status,
      })
      .eq('id', localInvoice.id);

    await logSyncOperation(supabase, connection.organization_id, 'from_quickbooks', 'webhook', 'invoice', localInvoice.id, invoice.Id, 'success');
  }

  await markEventProcessed(supabase, connection.organization_id, invoiceId, 'processed', null);
}

async function markEventProcessed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  entityId: string,
  status: string,
  errorMessage: string | null
): Promise<void> {
  const { data: event } = await supabase
    .from('qbo_webhook_events')
    .select('id')
    .eq('organization_id', orgId)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!event) return;

  await supabase
    .from('qbo_webhook_events')
    .update({
      status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', event.id);
}
