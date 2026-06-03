import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface QuickBooksTokens {
  access_token: string;
  refresh_token: string;
  realm_id: string;
}

async function refreshAccessToken(supabase: any, tokens: QuickBooksTokens) {
  const { data: settings } = await supabase
    .from('quickbooks_settings')
    .select('client_id, client_secret')
    .single();

  if (!settings) {
    throw new Error('QuickBooks settings not found');
  }

  const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${settings.client_id}:${settings.client_secret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to refresh access token');
  }

  const newTokens = await tokenResponse.json();

  await supabase
    .from('quickbooks_settings')
    .update({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
    })
    .eq('id', (await supabase.from('quickbooks_settings').select('id').single()).data.id);

  return newTokens.access_token;
}

async function syncContactToQuickBooks(supabase: any, contactId: string) {
  const startTime = Date.now();

  try {
    // Fetch contact data
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      throw new Error(`Contact not found: ${contactError?.message || 'Unknown error'}`);
    }

    // Check if already synced
    if (contact.qbo_customer_id) {
      return {
        success: true,
        message: 'Contact already synced to QuickBooks',
        qbo_customer_id: contact.qbo_customer_id,
      };
    }

    // Validate contact has required data
    if (!contact.contact_name) {
      throw new Error('Contact name is required');
    }

    if (!contact.email && !contact.phone) {
      throw new Error('Either email or phone is required');
    }

    // Get QuickBooks tokens
    const { data: qbSettings, error: qbError } = await supabase
      .from('quickbooks_settings')
      .select('*')
      .single();

    if (qbError || !qbSettings || !qbSettings.access_token) {
      throw new Error('QuickBooks not connected');
    }

    let accessToken = qbSettings.access_token;

    // Check if token needs refresh
    if (qbSettings.token_expires_at && new Date(qbSettings.token_expires_at) < new Date()) {
      accessToken = await refreshAccessToken(supabase, {
        access_token: qbSettings.access_token,
        refresh_token: qbSettings.refresh_token,
        realm_id: qbSettings.realm_id,
      });
    }

    // Build QuickBooks customer object
    const customerData: any = {
      DisplayName: contact.contact_name,
    };

    // Add company name if available
    if (contact.company_name) {
      customerData.CompanyName = contact.company_name;
    }

    // Add name components
    if (contact.first_name) {
      customerData.GivenName = contact.first_name;
    }
    if (contact.last_name) {
      customerData.FamilyName = contact.last_name;
    }

    // Add email if available
    if (contact.email) {
      customerData.PrimaryEmailAddr = {
        Address: contact.email,
      };
    }

    // Add phone numbers
    if (contact.phone) {
      customerData.PrimaryPhone = {
        FreeFormNumber: contact.phone,
      };
    }
    if (contact.business_phone) {
      customerData.Mobile = {
        FreeFormNumber: contact.business_phone,
      };
    }

    // Add billing address if available
    if (contact.street_address || contact.city || contact.state || contact.zip_code) {
      customerData.BillAddr = {};
      if (contact.street_address) customerData.BillAddr.Line1 = contact.street_address;
      if (contact.city) customerData.BillAddr.City = contact.city;
      if (contact.state) customerData.BillAddr.CountrySubDivisionCode = contact.state;
      if (contact.zip_code) customerData.BillAddr.PostalCode = contact.zip_code;
      if (contact.country) customerData.BillAddr.Country = contact.country;
    }

    // Add notes if available
    if (contact.notes) {
      customerData.Notes = contact.notes;
    }

    // Create customer in QuickBooks
    const qbResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}/customer`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(customerData),
      }
    );

    if (!qbResponse.ok) {
      const errorText = await qbResponse.text();
      throw new Error(`QuickBooks API error: ${errorText}`);
    }

    const qbResult = await qbResponse.json();
    const qboCustomerId = qbResult.Customer.Id;

    // Update contact with QB customer ID
    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        qbo_customer_id: qboCustomerId,
        qbo_sync_status: 'synced',
        qbo_synced_at: new Date().toISOString(),
        qbo_sync_error: null,
      })
      .eq('id', contactId);

    if (updateError) {
      throw new Error(`Failed to update contact: ${updateError.message}`);
    }

    // Log successful sync
    await supabase.from('quickbooks_sync_logs').insert({
      direction: 'to_quickbooks',
      operation: 'create',
      entity_type: 'customer',
      entity_id: contactId,
      qbo_id: qboCustomerId,
      status: 'success',
      duration_ms: Date.now() - startTime,
      details: {
        contact_name: contact.contact_name,
        qbo_customer_id: qboCustomerId,
      },
    });

    return {
      success: true,
      message: 'Contact successfully synced to QuickBooks',
      qbo_customer_id: qboCustomerId,
    };
  } catch (error: any) {
    // Log failed sync
    await supabase.from('quickbooks_sync_logs').insert({
      direction: 'to_quickbooks',
      operation: 'create',
      entity_type: 'customer',
      entity_id: contactId,
      status: 'failed',
      error_message: error.message,
      duration_ms: Date.now() - startTime,
    });

    // Update contact with error
    await supabase
      .from('contacts')
      .update({
        qbo_sync_status: 'failed',
        qbo_sync_error: error.message,
      })
      .eq('id', contactId);

    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { contactId, contactIds } = await req.json();

    // Support both single and batch sync
    if (contactIds && Array.isArray(contactIds)) {
      const results = [];
      for (const id of contactIds) {
        try {
          const result = await syncContactToQuickBooks(supabase, id);
          results.push({ contactId: id, ...result });
        } catch (error: any) {
          results.push({
            contactId: id,
            success: false,
            error: error.message,
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          results,
          summary: {
            total: results.length,
            succeeded: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
          },
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    } else if (contactId) {
      const result = await syncContactToQuickBooks(supabase, contactId);

      return new Response(
        JSON.stringify(result),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    } else {
      throw new Error('contactId or contactIds required');
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
