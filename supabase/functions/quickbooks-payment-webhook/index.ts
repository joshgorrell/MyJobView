import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createHmac } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, intuit-signature, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const intuitSignature = req.headers.get('intuit-signature');
    const rawBody = await req.text();

    const webhookToken = Deno.env.get('QUICKBOOKS_WEBHOOK_TOKEN');
    if (webhookToken && intuitSignature) {
      const hmac = createHmac('sha256', webhookToken);
      hmac.update(rawBody);
      const hash = hmac.digest('base64');

      if (hash !== intuitSignature) {
        console.error('Invalid webhook signature');
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const payload = JSON.parse(rawBody);
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    if (!payload.eventNotifications || payload.eventNotifications.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No events to process' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: settings } = await supabaseClient
      .from('company_settings')
      .select('*')
      .maybeSingle();

    if (!settings || !settings.qbo_connected) {
      console.error('QuickBooks not connected');
      return new Response(
        JSON.stringify({ error: 'QuickBooks not connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';
    const baseUrl = environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    for (const notification of payload.eventNotifications) {
      const realmId = notification.realmId;
      
      if (realmId !== settings.qbo_realm_id) {
        console.log('Skipping event for different realm:', realmId);
        continue;
      }

      for (const entity of notification.dataChangeEvent?.entities || []) {
        if (entity.name === 'Payment') {
          const paymentId = entity.id;
          console.log('Processing payment:', paymentId);

          const paymentResponse = await fetch(
            `${baseUrl}/v3/company/${realmId}/payment/${paymentId}`,
            {
              headers: {
                'Authorization': `Bearer ${settings.qbo_access_token}`,
                'Accept': 'application/json',
              },
            }
          );

          if (!paymentResponse.ok) {
            console.error('Failed to fetch payment from QBO');
            continue;
          }

          const paymentData = await paymentResponse.json();
          const payment = paymentData.Payment;

          const customerId = payment.CustomerRef?.value;
          if (!customerId) {
            console.log('No customer reference in payment');
            continue;
          }

          const { data: contact } = await supabaseClient
            .from('contacts')
            .select('id')
            .eq('qbo_customer_id', customerId)
            .maybeSingle();

          if (!contact) {
            console.log('Contact not found for QBO customer:', customerId);
            continue;
          }

          for (const line of payment.Line || []) {
            if (line.LinkedTxn) {
              for (const linkedTxn of line.LinkedTxn) {
                if (linkedTxn.TxnType === 'Invoice') {
                  const qboInvoiceId = linkedTxn.TxnId;
                  const amount = line.Amount || 0;

                  // Check if this is a pending payment (VIP subscription, security contract, or invoice)
                  const { data: pendingPayment } = await supabaseClient
                    .from('pending_payments')
                    .select('*')
                    .eq('qbo_invoice_id', qboInvoiceId)
                    .eq('status', 'awaiting_payment')
                    .maybeSingle();

                  if (pendingPayment) {
                    // Handle different payment types
                    if (pendingPayment.payment_type === 'vip_subscription') {
                      // Record subscription payment
                      await supabaseClient
                        .from('subscription_payments')
                        .insert({
                          subscription_id: pendingPayment.related_id,
                          contact_id: contact.id,
                          amount: amount,
                          payment_date: payment.TxnDate,
                          payment_method: payment.PaymentMethodRef?.name || 'QuickBooks',
                          qbo_payment_id: payment.Id,
                          qbo_invoice_id: qboInvoiceId,
                          reference_number: payment.PaymentRefNum,
                          status: 'completed',
                        });

                      // Activate subscription if it's pending payment
                      await supabaseClient
                        .from('recurring_subscriptions')
                        .update({ status: 'active' })
                        .eq('id', pendingPayment.related_id)
                        .eq('status', 'pending_payment');

                      console.log('VIP subscription payment completed:', pendingPayment.related_id);

                    } else if (pendingPayment.payment_type === 'security_contract') {
                      // Activate security contract
                      await supabaseClient
                        .from('security_contracts')
                        .update({
                          status: 'active',
                          activated_at: new Date().toISOString()
                        })
                        .eq('id', pendingPayment.related_id);

                      console.log('Security contract activated:', pendingPayment.related_id);

                    } else if (pendingPayment.payment_type === 'invoice') {
                      // Handle regular invoice payment (existing logic)
                      const { data: invoice } = await supabaseClient
                        .from('invoices')
                        .select('id, total, amount_paid')
                        .eq('id', pendingPayment.related_id)
                        .maybeSingle();

                      if (invoice) {
                        await supabaseClient
                          .from('payments')
                          .insert({
                            invoice_id: invoice.id,
                            contact_id: contact.id,
                            amount: amount,
                            payment_date: payment.TxnDate,
                            payment_method: payment.PaymentMethodRef?.name || 'QuickBooks',
                            qbo_payment_id: payment.Id,
                            reference_number: payment.PaymentRefNum,
                          });

                        const newAmountPaid = (invoice.amount_paid || 0) + amount;
                        const newAmountDue = invoice.total - newAmountPaid;
                        const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

                        await supabaseClient
                          .from('invoices')
                          .update({
                            amount_paid: newAmountPaid,
                            amount_due: newAmountDue,
                            status: newStatus,
                          })
                          .eq('id', invoice.id);

                        console.log('Invoice payment recorded:', invoice.id);
                      }
                    }

                    // Mark pending payment as completed
                    await supabaseClient
                      .from('pending_payments')
                      .update({
                        status: 'paid',
                        completed_at: new Date().toISOString(),
                      })
                      .eq('id', pendingPayment.id);

                  } else {
                    // Legacy invoice payment (not initiated through pending_payments)
                    const { data: invoice } = await supabaseClient
                      .from('invoices')
                      .select('id, total, amount_paid')
                      .eq('qbo_invoice_id', qboInvoiceId)
                      .maybeSingle();

                    if (invoice) {
                      const { error: paymentError } = await supabaseClient
                        .from('payments')
                        .insert({
                          invoice_id: invoice.id,
                          contact_id: contact.id,
                          amount: amount,
                          payment_date: payment.TxnDate,
                          payment_method: payment.PaymentMethodRef?.name || 'QuickBooks',
                          qbo_payment_id: payment.Id,
                          reference_number: payment.PaymentRefNum,
                        });

                      if (paymentError) {
                        console.error('Failed to insert payment:', paymentError);
                        continue;
                      }

                      const newAmountPaid = (invoice.amount_paid || 0) + amount;
                      const newAmountDue = invoice.total - newAmountPaid;
                      const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

                      await supabaseClient
                        .from('invoices')
                        .update({
                          amount_paid: newAmountPaid,
                          amount_due: newAmountDue,
                          status: newStatus,
                        })
                        .eq('id', invoice.id);

                      console.log('Payment recorded for invoice:', invoice.id);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});