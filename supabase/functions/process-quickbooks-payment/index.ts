import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface PaymentRequest {
  contactId: string;
  amount: number;
  convenienceFee: number;
  paymentData: {
    paymentType: 'card' | 'ach';
    cardNumber?: string;
    cardExpMonth?: string;
    cardExpYear?: string;
    cardCvv?: string;
    cardName?: string;
    achRouting?: string;
    achAccount?: string;
    achAccountType?: 'checking' | 'savings';
    achAccountName?: string;
  };
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

    const { contactId, amount, convenienceFee, paymentData }: PaymentRequest = await req.json();

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
    const totalAmount = amount + convenienceFee;

    // Ensure customer exists in QuickBooks
    let qboCustomerId = contact.qbo_customer_id;

    if (!qboCustomerId) {
      // Create customer in QuickBooks
      const customerPayload = {
        DisplayName: contact.full_name || contact.contact_name,
        PrimaryEmailAddr: { Address: contact.email },
        PrimaryPhone: { FreeFormNumber: contact.phone },
        BillAddr: {
          Line1: contact.address,
          City: contact.city,
          CountrySubDivisionCode: contact.state,
          PostalCode: contact.zip,
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
        console.error('Failed to create QBO customer:', errorText);
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

    // Create payment method token (for future recurring payments)
    let paymentMethodToken = null;
    let displayLast4 = null;
    let displayBrand = null;

    if (paymentData.paymentType === 'card') {
      // In production, you would tokenize the card with QuickBooks Payments API
      // For now, we'll store a reference
      displayLast4 = paymentData.cardNumber?.slice(-4);
      displayBrand = 'Visa'; // Would be determined by card BIN
      paymentMethodToken = `qbo_card_${Math.random().toString(36).substr(2, 24)}`;
    } else {
      // ACH payment
      displayLast4 = paymentData.achAccount?.slice(-4);
      paymentMethodToken = `qbo_ach_${Math.random().toString(36).substr(2, 24)}`;
    }

    // Process payment through QuickBooks
    // Note: In production, you would use QuickBooks Payments API to charge the card/bank
    // This requires additional QuickBooks Payments setup and credentials
    const paymentPayload = {
      TotalAmt: totalAmount,
      CustomerRef: {
        value: qboCustomerId,
      },
      PaymentMethodRef: {
        name: paymentData.paymentType === 'card' ? 'Credit Card' : 'Bank Transfer',
      },
      TxnDate: new Date().toISOString().split('T')[0],
      PaymentRefNum: `VIP-${Date.now()}`,
    };

    const paymentResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/payment`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.qbo_access_token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(paymentPayload),
      }
    );

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      console.error('Failed to process QBO payment:', errorText);
      throw new Error('Payment processing failed in QuickBooks');
    }

    const qboPaymentData = await paymentResponse.json();
    const qboPaymentId = qboPaymentData.Payment.Id;

    return new Response(
      JSON.stringify({
        success: true,
        qboCustomerId,
        qboPaymentId,
        paymentMethodToken,
        displayLast4,
        displayBrand,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error: any) {
    console.error('Payment processing error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Payment processing failed',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});