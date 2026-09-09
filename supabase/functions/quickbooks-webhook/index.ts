import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  corsHeaders,
  getSupabaseAdmin,
  getConnectionByRealm,
  qboRequest,
  upsertEntityMapping,
  logSyncOperation,
} from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const verifierToken = Deno.env.get('QUICKBOOKS_WEBHOOK_TOKEN');
    const signature = req.headers.get('intuit-signature');
    if (!verifierToken || !signature) return jsonResponse({ error: 'Invalid signature' }, 401);

    const rawBody = await req.text();
    const expected = createHmac('sha256', verifierToken).update(rawBody).digest('base64');
    if (!safeEqual(expected, signature)) return jsonResponse({ error: 'Invalid signature' }, 401);

    const payload = JSON.parse(rawBody);
    const supabase = getSupabaseAdmin();
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const [notificationIndex, notification] of (payload.eventNotifications || []).entries()) {
      const realmId = String(notification.realmId || '');
      const connection = await getConnectionByRealm(supabase, realmId);
      if (!connection) {
        failed++;
        continue;
      }

      await supabase
        .from('quickbooks_settings')
        .update({ last_webhook_at: new Date().toISOString() })
        .eq('id', connection.id);

      for (const [entityIndex, entity] of (notification.dataChangeEvent?.entities || []).entries()) {
        const entityType = String(entity.name || '');
        const entityId = String(entity.id || '');
        if (!entityType || !entityId) {
          failed++;
          continue;
        }

        const eventKey = entity.lastUpdated
          ? `${realmId}:${entityType}:${entityId}:${entity.lastUpdated}`
          : `${realmId}:${notificationIndex}:${entityIndex}:${entityType}:${entityId}:${await stableHash(entity)}`;

        const { error: insertError } = await supabase
          .from('qbo_webhook_events')
          .insert({
            organization_id: connection.organization_id,
            realm_id: realmId,
            entity_type: entityType,
            entity_id: entityId,
            event_id: eventKey,
            payload: entity,
            status: 'pending',
          });

        if (insertError) {
          if (insertError.code === '23505') {
            skipped++;
            continue;
          }
          failed++;
          continue;
        }

        const result = entityType === 'Customer'
          ? await processCustomer(supabase, connection, entityId)
          : entityType === 'Invoice'
            ? await processInvoice(supabase, connection, entityId)
            : entityType === 'Payment'
              ? await processPayment(supabase, connection, entityId)
              : { success: true };

        await supabase
          .from('qbo_webhook_events')
          .update({
            status: result.success ? 'processed' : 'failed',
            processed_at: new Date().toISOString(),
            error_message: result.success ? null : result.error,
          })
          .eq('organization_id', connection.organization_id)
          .eq('event_id', eventKey);

        if (result.success) processed++;
        else failed++;
      }
    }

    return jsonResponse({ success: failed === 0, processed, skipped, failed }, failed === 0 ? 200 : 207);
  } catch (error) {
    console.error('Generic QBO webhook error:', error);
    return jsonResponse({ error: 'Webhook processing failed' }, 500);
  }
});

async function processCustomer(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  qboCustomerId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await qboRequest(supabase, connection, 'GET', `customer/${qboCustomerId}?minorversion=40`);
  if (!result.ok || !result.data?.Customer) return { success: false, error: 'Customer fetch failed' };

  const customer = result.data.Customer;
  const { data: mapping } = await supabase
    .from('qbo_entity_mappings')
    .select('local_id')
    .eq('organization_id', connection.organization_id)
    .eq('entity_type', 'customer')
    .eq('qbo_id', qboCustomerId)
    .maybeSingle();

  let contactId = mapping?.local_id || null;
  if (!contactId) {
    const email = customer.PrimaryEmailAddr?.Address || null;
    const phone = customer.PrimaryPhone?.FreeFormNumber || null;
    if (email) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', connection.organization_id)
        .eq('email', email)
        .maybeSingle();
      contactId = contact?.id || null;
    }
    if (!contactId && phone) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', connection.organization_id)
        .eq('phone', phone)
        .maybeSingle();
      contactId = contact?.id || null;
    }
  }

  if (!contactId) return { success: true };
  await supabase
    .from('contacts')
    .update({ qbo_customer_id: qboCustomerId, qbo_sync_status: 'synced', qbo_synced_at: new Date().toISOString(), qbo_sync_error: null })
    .eq('id', contactId)
    .eq('organization_id', connection.organization_id);
  await upsertEntityMapping(supabase, connection.organization_id, 'customer', contactId, qboCustomerId, customer.SyncToken);
  await logSyncOperation(supabase, connection.organization_id, 'from_quickbooks', 'webhook', 'customer', contactId, qboCustomerId, 'success');
  return { success: true };
}

async function processInvoice(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  qboInvoiceId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await qboRequest(supabase, connection, 'GET', `invoice/${qboInvoiceId}?minorversion=40`);
  if (!result.ok || !result.data?.Invoice) return { success: false, error: 'Invoice fetch failed' };

  const invoice = result.data.Invoice;
  const { data: localInvoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('organization_id', connection.organization_id)
    .eq('qbo_invoice_id', qboInvoiceId)
    .maybeSingle();
  if (!localInvoice) return { success: true };

  await updateInvoiceBalance(supabase, connection, localInvoice.id, qboInvoiceId, invoice);
  await upsertEntityMapping(supabase, connection.organization_id, 'invoice', localInvoice.id, qboInvoiceId, invoice.SyncToken);
  await logSyncOperation(supabase, connection.organization_id, 'from_quickbooks', 'webhook', 'invoice', localInvoice.id, qboInvoiceId, 'success');
  return { success: true };
}

async function processPayment(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  qboPaymentId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await qboRequest(supabase, connection, 'GET', `payment/${qboPaymentId}?minorversion=40`);
  if (!result.ok || !result.data?.Payment) return { success: false, error: 'Payment fetch failed' };

  const payment = result.data.Payment;
  const customerId = payment.CustomerRef?.value;
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', connection.organization_id)
    .eq('qbo_customer_id', customerId)
    .maybeSingle();
  if (!contact) return { success: true };

  for (const line of payment.Line || []) {
    for (const linkedTxn of line.LinkedTxn || []) {
      if (linkedTxn.TxnType !== 'Invoice') continue;
      const qboInvoiceId = String(linkedTxn.TxnId);
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('organization_id', connection.organization_id)
        .eq('qbo_invoice_id', qboInvoiceId)
        .maybeSingle();
      if (!invoice) continue;

      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('invoice_id', invoice.id)
        .eq('qbo_payment_id', qboPaymentId)
        .maybeSingle();
      const paymentData = {
        amount: Number(line.Amount || 0),
        payment_date: payment.TxnDate,
        payment_method: payment.PaymentMethodRef?.name || 'QuickBooks',
        reference_number: payment.PaymentRefNum,
      };
      if (existingPayment) {
        await supabase.from('payments').update(paymentData).eq('id', existingPayment.id).eq('invoice_id', invoice.id);
      } else {
        const { data: inserted } = await supabase.from('payments').insert({
          invoice_id: invoice.id,
          contact_id: contact.id,
          qbo_payment_id: qboPaymentId,
          ...paymentData,
        }).select('id').maybeSingle();
        if (inserted) await upsertEntityMapping(supabase, connection.organization_id, 'payment', inserted.id, qboPaymentId, payment.SyncToken);
      }
      const invoiceResult = await qboRequest(supabase, connection, 'GET', `invoice/${qboInvoiceId}?minorversion=40`);
      if (invoiceResult.ok && invoiceResult.data?.Invoice) {
        await updateInvoiceBalance(supabase, connection, invoice.id, qboInvoiceId, invoiceResult.data.Invoice);
      }
    }
  }
  await logSyncOperation(supabase, connection.organization_id, 'from_quickbooks', 'webhook', 'payment', null, qboPaymentId, 'success');
  return { success: true };
}

async function updateInvoiceBalance(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  invoiceId: string,
  qboInvoiceId: string,
  qboInvoice: any
): Promise<void> {
  const total = Number(qboInvoice.TotalAmt || 0);
  const amountDue = Number(qboInvoice.Balance || 0);
  const amountPaid = Math.max(0, total - amountDue);
  const status = amountDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'sent';
  await supabase
    .from('invoices')
    .update({ total, amount_paid: amountPaid, amount_due: amountDue, status })
    .eq('id', invoiceId)
    .eq('organization_id', connection.organization_id);
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function stableHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
