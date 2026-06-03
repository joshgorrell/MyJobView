import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function calculateCompleteness(customer: any) {
  let score = 0;
  const missingFields: string[] = [];

  // Check company name or contact name (20 points)
  if (customer.CompanyName) {
    score += 20;
  } else {
    missingFields.push('company_name');
  }

  // Check contact name (20 points)
  if (customer.GivenName || customer.FamilyName) {
    score += 20;
  } else {
    missingFields.push('contact_name');
  }

  // Check email (20 points)
  if (customer.PrimaryEmailAddr?.Address) {
    score += 20;
  } else {
    missingFields.push('email');
  }

  // Check phone (20 points)
  if (customer.PrimaryPhone?.FreeFormNumber || customer.Mobile?.FreeFormNumber) {
    score += 20;
  } else {
    missingFields.push('phone');
  }

  // Check address (20 points)
  const addr = customer.BillAddr || customer.ShipAddr;
  if (addr?.Line1 && addr?.City && addr?.PostalCode) {
    score += 20;
  } else {
    missingFields.push('address');
  }

  let status = 'minimal';
  if (score >= 80) status = 'complete';
  else if (score >= 40) status = 'partial';

  return { score, status, missingFields };
}

async function fetchAllCustomers(accessToken: string, realmId: string) {
  const allCustomers: any[] = [];
  let startPosition = 1;
  const maxResults = 1000;
  let hasMore = true;

  while (hasMore) {
    const query = `SELECT * FROM Customer STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;

    const response = await fetch(qbApiUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QuickBooks API error: ${error}`);
    }

    const data = await response.json();
    const customers = data.QueryResponse?.Customer || [];

    if (customers.length > 0) {
      allCustomers.push(...customers);
      startPosition += customers.length;

      // If we got fewer than maxResults, we're done
      if (customers.length < maxResults) {
        hasMore = false;
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } else {
      hasMore = false;
    }
  }

  return allCustomers;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: qbSettings, error: qbError } = await supabase
      .from("quickbooks_settings")
      .select("*")
      .eq("is_connected", true)
      .maybeSingle();

    if (qbError || !qbSettings) {
      throw new Error("QuickBooks not connected");
    }

    const tokenExpiresAt = new Date(qbSettings.token_expires_at);
    let accessToken = qbSettings.access_token;

    // Refresh token if expired
    if (tokenExpiresAt <= new Date()) {
      const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
      const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
      const authHeader = btoa(`${clientId}:${clientSecret}`);

      const refreshResponse = await fetch(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: qbSettings.refresh_token,
          }),
        },
      );

      if (!refreshResponse.ok) {
        throw new Error("Failed to refresh token");
      }

      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

      await supabase
        .from("quickbooks_settings")
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", qbSettings.id);
    }

    // Fetch ALL customers with pagination
    console.log('Fetching all customers from QuickBooks...');
    const customers = await fetchAllCustomers(accessToken, qbSettings.realm_id);
    console.log(`Fetched ${customers.length} total customers`);

    // Clear existing staged customers to start fresh
    await supabase
      .from("quickbooks_staged_customers")
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    // Get existing contacts to check for duplicates
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("qbo_customer_id, email, phone");

    const existingQboIds = new Set(existingContacts?.map(c => c.qbo_customer_id).filter(Boolean) || []);
    const existingEmails = new Set(existingContacts?.map(c => c.email?.toLowerCase()).filter(Boolean) || []);
    const existingPhones = new Set(existingContacts?.map(c => c.phone).filter(Boolean) || []);

    // Process and stage all customers
    const stagedCustomers = [];
    let completeCount = 0;
    let partialCount = 0;
    let minimalCount = 0;

    for (const customer of customers) {
      // Skip if already exists
      const email = customer.PrimaryEmailAddr?.Address?.toLowerCase();
      const phone = customer.PrimaryPhone?.FreeFormNumber;

      if (existingQboIds.has(customer.Id) ||
          (email && existingEmails.has(email)) ||
          (phone && existingPhones.has(phone))) {
        continue;
      }

      const completeness = calculateCompleteness(customer);

      if (completeness.status === 'complete') completeCount++;
      else if (completeness.status === 'partial') partialCount++;
      else minimalCount++;

      stagedCustomers.push({
        qbo_customer_id: customer.Id,
        qbo_sync_token: customer.SyncToken,
        company_name: customer.CompanyName || null,
        given_name: customer.GivenName || null,
        family_name: customer.FamilyName || null,
        display_name: customer.DisplayName,
        primary_email: customer.PrimaryEmailAddr?.Address || null,
        primary_phone: customer.PrimaryPhone?.FreeFormNumber || null,
        mobile_phone: customer.Mobile?.FreeFormNumber || null,
        billing_address: customer.BillAddr || null,
        shipping_address: customer.ShipAddr || null,
        notes: customer.Notes || null,
        is_active: customer.Active !== false,
        balance: customer.Balance || 0,
        raw_data: customer,
        completeness_status: completeness.status,
        missing_fields: completeness.missingFields,
        completeness_score: completeness.score,
      });
    }

    // Insert staged customers
    if (stagedCustomers.length > 0) {
      const { error: stageError } = await supabase
        .from("quickbooks_staged_customers")
        .insert(stagedCustomers);

      if (stageError) {
        console.error('Error staging customers:', stageError);
        throw stageError;
      }
    }

    // Auto-import complete customers if enabled
    let autoImportedCount = 0;
    if (qbSettings.auto_import_complete_data && completeCount > 0) {
      console.log(`Auto-importing ${completeCount} complete customers...`);

      const { data: completeCustomers } = await supabase
        .from("quickbooks_staged_customers")
        .select("*")
        .eq("completeness_status", "complete")
        .eq("import_status", "pending");

      if (completeCustomers && completeCustomers.length > 0) {
        const contactsToInsert = completeCustomers.map(customer => {
          const fullName = customer.company_name ||
            [customer.given_name, customer.family_name].filter(Boolean).join(' ') ||
            customer.display_name;

          const username = fullName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 30) || `qb${customer.qbo_customer_id}`;

          return {
            contact_name: fullName,
            company_name: customer.company_name,
            first_name: customer.given_name,
            last_name: customer.family_name,
            email: customer.primary_email,
            phone: customer.primary_phone,
            business_phone: customer.mobile_phone,
            street_address: customer.billing_address?.Line1,
            city: customer.billing_address?.City,
            state: customer.billing_address?.CountrySubDivisionCode,
            zip_code: customer.billing_address?.PostalCode,
            country: customer.billing_address?.Country || 'USA',
            notes: `Auto-imported from QuickBooks${customer.notes ? ': ' + customer.notes : ''}`,
            qbo_customer_id: customer.qbo_customer_id,
            qbo_sync_status: 'synced',
            qbo_synced_at: new Date().toISOString(),
            username: username,
          };
        });

        const { data: insertedContacts, error: insertError } = await supabase
          .from("contacts")
          .insert(contactsToInsert)
          .select("id, qbo_customer_id");

        if (!insertError && insertedContacts) {
          // Mark staged customers as imported
          for (const contact of insertedContacts) {
            await supabase
              .from("quickbooks_staged_customers")
              .update({
                import_status: 'imported',
                imported_at: new Date().toISOString(),
                imported_contact_id: contact.id,
              })
              .eq("qbo_customer_id", contact.qbo_customer_id);
          }

          autoImportedCount = insertedContacts.length;

          // Log successful imports
          await supabase.from("quickbooks_sync_logs").insert({
            direction: 'from_quickbooks',
            operation: 'import',
            entity_type: 'customer',
            status: 'success',
            details: {
              auto_imported_count: autoImportedCount,
              total_fetched: customers.length,
            },
          });
        }
      }
    }

    // Update settings with fetch stats
    await supabase
      .from("quickbooks_settings")
      .update({
        last_customer_sync_at: new Date().toISOString(),
        last_fetch_count: customers.length,
        last_fetch_completed_at: new Date().toISOString(),
      })
      .eq("id", qbSettings.id);

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: customers.length,
        staged: stagedCustomers.length,
        auto_imported: autoImportedCount,
        complete: completeCount,
        partial: partialCount,
        minimal: minimalCount,
        message: `Fetched ${customers.length} customers. ${autoImportedCount > 0 ? `Auto-imported ${autoImportedCount} complete customers. ` : ''}${partialCount + minimalCount} customers staged for review.`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("QuickBooks fetch customers error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
