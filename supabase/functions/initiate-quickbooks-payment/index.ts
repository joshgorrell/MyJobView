import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface PaymentRequest {
  paymentType: 'vip_subscription' | 'security_contract' | 'invoice';
  relatedId: string;
  contactId: string;
  amount: number;
  description: string;
  dueDate?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { paymentType, relatedId, contactId, amount, description, dueDate }: PaymentRequest = await req.json();

    // Get QuickBooks settings
    const { data: settings } = await supabaseClient
      .from('company_settings')
      .select('*')
      .maybeSingle();

    if (!settings || !settings.qbo_connected) {
      throw new Error('QuickBooks not connected');
    }

    // Get contact information
    const { data: contact } = await supabaseClient
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (!contact) {
      throw new Error('Contact not found');
    }

    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';
    const baseUrl = environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    const realmId = settings.qbo_realm_id;

    // Ensure customer exists in QuickBooks
    let qboCustomerId = contact.qbo_customer_id;

    if (!qboCustomerId) {
      // Create customer in QuickBooks
      const customerPayload = {
        DisplayName: contact.full_name || contact.contact_name,
        PrimaryEmailAddr: contact.email ? { Address: contact.email } : undefined,
        PrimaryPhone: contact.phone ? { FreeFormNumber: contact.phone } : undefined,
        BillAddr: {
          Line1: contact.address_line1 || contact.address,
          City: contact.city,
          CountrySubDivisionCode: contact.state,
          PostalCode: contact.zip_code || contact.zip,
        },
      };

      const customerResponse = await fetch(
        `${baseUrl}/v3/company/${realmId}/customer`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.qbo_access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(customerPayload),
        }
      );

      if (!customerResponse.ok) {
        const errorText = await customerResponse.text();
        console.error('Failed to create customer:', errorText);
        throw new Error('Failed to create customer in QuickBooks');
      }

      const customerData = await customerResponse.json();
      qboCustomerId = customerData.Customer.Id;

      // Update contact with QBO customer ID
      await supabaseClient
        .from('contacts')
        .update({ qbo_customer_id: qboCustomerId })
        .eq('id', contactId);
    }

    // Create invoice in QuickBooks
    const invoicePayload = {
      CustomerRef: { value: qboCustomerId },
      Line: [
        {
          Amount: amount,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: { value: '1' }, // Use default item - adjust as needed
            Qty: 1,
            UnitPrice: amount,
          },
          Description: description,
        },
      ],
      DueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      BillEmail: contact.email ? { Address: contact.email } : undefined,
      CustomerMemo: { value: description },
    };

    const invoiceResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/invoice`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.qbo_access_token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(invoicePayload),
      }
    );

    if (!invoiceResponse.ok) {
      const errorText = await invoiceResponse.text();
      console.error('Failed to create invoice:', errorText);
      throw new Error('Failed to create invoice in QuickBooks');
    }

    const invoiceData = await invoiceResponse.json();
    const qboInvoiceId = invoiceData.Invoice.Id;

    // Create pending payment record
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 day expiration

    const { data: pendingPayment, error: pendingError } = await supabaseClient
      .from('pending_payments')
      .insert({
        payment_type: paymentType,
        related_id: relatedId,
        contact_id: contactId,
        amount,
        qbo_invoice_id: qboInvoiceId,
        expires_at: expiresAt.toISOString(),
        metadata: { description },
      })
      .select()
      .single();

    if (pendingError) throw pendingError;

    // Generate QuickBooks hosted payment page URL
    const paymentUrl = `https://app.qbo.intuit.com/app/paynow?invoiceId=${qboInvoiceId}`;

    return new Response(
      JSON.stringify({
        success: true,
        paymentUrl,
        pendingPaymentId: pendingPayment.id,
        qboInvoiceId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Payment initiation error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to initiate payment' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
