import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

    const { customerIds, skipDuplicateCheck } = await req.json();

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      throw new Error('customerIds array is required');
    }

    // Fetch staged customers
    const { data: stagedCustomers, error: fetchError } = await supabase
      .from('quickbooks_staged_customers')
      .select('*')
      .in('id', customerIds);

    if (fetchError) {
      throw new Error(`Failed to fetch staged customers: ${fetchError.message}`);
    }

    if (!stagedCustomers || stagedCustomers.length === 0) {
      throw new Error('No staged customers found');
    }

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const customer of stagedCustomers) {
      try {
        // Check if already imported
        if (customer.import_status === 'imported') {
          results.push({
            customerId: customer.id,
            success: false,
            error: 'Customer already imported',
          });
          failedCount++;
          continue;
        }

        // Check for duplicates unless explicitly skipped
        if (!skipDuplicateCheck) {
          const { data: existingContact } = await supabase
            .from('contacts')
            .select('id, contact_name')
            .or(`qbo_customer_id.eq.${customer.qbo_customer_id},email.eq.${customer.primary_email || 'null'},phone.eq.${customer.primary_phone || 'null'}`)
            .maybeSingle();

          if (existingContact) {
            await supabase
              .from('quickbooks_staged_customers')
              .update({
                import_status: 'skipped',
                import_error: `Duplicate contact exists: ${existingContact.contact_name}`,
              })
              .eq('id', customer.id);

            results.push({
              customerId: customer.id,
              success: false,
              error: `Duplicate contact exists: ${existingContact.contact_name}`,
            });
            failedCount++;
            continue;
          }
        }

        // Build full name
        const fullName = customer.company_name ||
          [customer.given_name, customer.family_name].filter(Boolean).join(' ') ||
          customer.display_name;

        // Generate username
        const baseUsername = fullName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .substring(0, 30) || `qb${customer.qbo_customer_id}`;

        // Ensure unique username
        let username = baseUsername;
        let counter = 1;
        let usernameExists = true;

        while (usernameExists) {
          const { data: existingUsername } = await supabase
            .from('contacts')
            .select('username')
            .eq('username', username)
            .maybeSingle();

          if (!existingUsername) {
            usernameExists = false;
          } else {
            username = `${baseUsername}${counter}`;
            counter++;
          }
        }

        // Prepare contact data
        const contactData = {
          contact_name: fullName,
          company_name: customer.company_name || null,
          first_name: customer.given_name || null,
          last_name: customer.family_name || null,
          email: customer.primary_email || null,
          phone: customer.primary_phone || null,
          business_phone: customer.mobile_phone || null,
          street_address: customer.billing_address?.Line1 || null,
          city: customer.billing_address?.City || null,
          state: customer.billing_address?.CountrySubDivisionCode || null,
          zip_code: customer.billing_address?.PostalCode || null,
          country: customer.billing_address?.Country || 'USA',
          notes: customer.notes ? `Imported from QuickBooks: ${customer.notes}` : 'Imported from QuickBooks',
          qbo_customer_id: customer.qbo_customer_id,
          qbo_sync_status: 'synced',
          qbo_synced_at: new Date().toISOString(),
          username: username,
        };

        // Insert contact
        const { data: insertedContact, error: insertError } = await supabase
          .from('contacts')
          .insert(contactData)
          .select('id, contact_name')
          .single();

        if (insertError) {
          throw new Error(`Failed to insert contact: ${insertError.message}`);
        }

        // Update staged customer
        await supabase
          .from('quickbooks_staged_customers')
          .update({
            import_status: 'imported',
            imported_at: new Date().toISOString(),
            imported_contact_id: insertedContact.id,
            import_error: null,
          })
          .eq('id', customer.id);

        // Log successful import
        await supabase.from('quickbooks_sync_logs').insert({
          direction: 'from_quickbooks',
          operation: 'import',
          entity_type: 'customer',
          entity_id: insertedContact.id,
          qbo_id: customer.qbo_customer_id,
          status: 'success',
          details: {
            contact_name: insertedContact.contact_name,
            display_name: customer.display_name,
          },
        });

        results.push({
          customerId: customer.id,
          contactId: insertedContact.id,
          contactName: insertedContact.contact_name,
          success: true,
        });
        successCount++;
      } catch (error: any) {
        // Update staged customer with error
        await supabase
          .from('quickbooks_staged_customers')
          .update({
            import_status: 'failed',
            import_error: error.message,
          })
          .eq('id', customer.id);

        // Log failed import
        await supabase.from('quickbooks_sync_logs').insert({
          direction: 'from_quickbooks',
          operation: 'import',
          entity_type: 'customer',
          qbo_id: customer.qbo_customer_id,
          status: 'failed',
          error_message: error.message,
        });

        results.push({
          customerId: customer.id,
          success: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: results.length,
          succeeded: successCount,
          failed: failedCount,
        },
        message: `Import complete: ${successCount} succeeded, ${failedCount} failed`,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
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
