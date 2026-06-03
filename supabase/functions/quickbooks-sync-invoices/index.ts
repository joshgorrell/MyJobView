import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user } } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, invoiceId } = await req.json();

    // Get company settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('company_settings')
      .select('*')
      .maybeSingle();

    if (settingsError || !settings || !settings.qbo_connected) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks not connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token needs refresh
    const expiresAt = new Date(settings.qbo_token_expires_at);
    if (expiresAt < new Date()) {
      // Token expired, refresh it
      const refreshed = await refreshQBOToken(settings);
      if (!refreshed) {
        return new Response(
          JSON.stringify({ error: 'Failed to refresh QuickBooks token' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Reload settings
      const { data: newSettings } = await supabaseClient
        .from('company_settings')
        .select('*')
        .maybeSingle();
      if (newSettings) {
        settings.qbo_access_token = newSettings.qbo_access_token;
      }
    }

    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';
    const baseUrl = environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    if (action === 'push') {
      // Push invoice to QuickBooks
      const { data: invoice, error: invoiceError } = await supabaseClient
        .from('invoices')
        .select(`
          *,
          contacts(*),
          invoice_line_items(*)
        `)
        .eq('id', invoiceId)
        .maybeSingle();

      if (invoiceError || !invoice) {
        return new Response(
          JSON.stringify({ error: 'Invoice not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if contact has QBO customer ID
      let qboCustomerId = invoice.contacts.qbo_customer_id;
      if (!qboCustomerId) {
        // Create customer in QBO first
        const customerData = {
          DisplayName: invoice.contacts.contact_name,
          PrimaryEmailAddr: invoice.contacts.email ? { Address: invoice.contacts.email } : undefined,
          PrimaryPhone: invoice.contacts.phone ? { FreeFormNumber: invoice.contacts.phone } : undefined,
        };

        const customerResponse = await fetch(
          `${baseUrl}/v3/company/${settings.qbo_realm_id}/customer`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.qbo_access_token}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(customerData),
          }
        );

        if (!customerResponse.ok) {
          const errorText = await customerResponse.text();
          console.error('Failed to create QBO customer:', errorText);
          return new Response(
            JSON.stringify({ error: 'Failed to create customer in QuickBooks' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const customerResult = await customerResponse.json();
        qboCustomerId = customerResult.Customer.Id;

        // Update contact with QBO customer ID
        await supabaseClient
          .from('contacts')
          .update({ qbo_customer_id: qboCustomerId })
          .eq('id', invoice.contact_id);
      }

      // Create invoice in QBO
      const qboInvoice = {
        CustomerRef: { value: qboCustomerId },
        TxnDate: invoice.invoice_date,
        DueDate: invoice.due_date,
        Line: invoice.invoice_line_items.map((item: any, index: number) => ({
          DetailType: 'SalesItemLineDetail',
          Description: item.description,
          Amount: item.amount,
          SalesItemLineDetail: {
            Qty: item.quantity,
            UnitPrice: item.unit_price,
          },
          LineNum: index + 1,
        })),
      };

      const invoiceResponse = await fetch(
        `${baseUrl}/v3/company/${settings.qbo_realm_id}/invoice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.qbo_access_token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(qboInvoice),
        }
      );

      if (!invoiceResponse.ok) {
        const errorText = await invoiceResponse.text();
        console.error('Failed to create QBO invoice:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to create invoice in QuickBooks', details: errorText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const invoiceResult = await invoiceResponse.json();

      // Update local invoice with QBO ID
      await supabaseClient
        .from('invoices')
        .update({
          qbo_invoice_id: invoiceResult.Invoice.Id,
          synced_at: new Date().toISOString(),
          status: 'sent',
        })
        .eq('id', invoiceId);

      return new Response(
        JSON.stringify({ success: true, qbo_invoice_id: invoiceResult.Invoice.Id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function refreshQBOToken(settings: any): Promise<boolean> {
  try {
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';

    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const authString = btoa(`${clientId}:${clientSecret}`);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: settings.qbo_refresh_token,
      }),
    });

    if (!response.ok) return false;

    const tokens = await response.json();
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await supabaseClient
      .from('company_settings')
      .update({
        qbo_access_token: tokens.access_token,
        qbo_refresh_token: tokens.refresh_token,
        qbo_token_expires_at: expiresAt.toISOString(),
      })
      .eq('id', settings.id);

    return true;
  } catch (error) {
    console.error('Token refresh error:', error);
    return false;
  }
}