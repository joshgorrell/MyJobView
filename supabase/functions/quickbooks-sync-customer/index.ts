import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { leadId } = await req.json();

    if (!leadId) {
      throw new Error("Lead ID is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      throw new Error("Lead not found");
    }

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

    const customerData: any = {
      DisplayName: lead.company_name || lead.contact_name,
      GivenName: lead.contact_name,
    };

    if (lead.email) {
      customerData.PrimaryEmailAddr = { Address: lead.email };
    }

    if (lead.phone) {
      customerData.PrimaryPhone = { FreeFormNumber: lead.phone };
    }

    if (lead.opportunity_description) {
      customerData.Notes = lead.opportunity_description;
    }

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}/customer`;

    const createResponse = await fetch(qbApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(customerData),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`QuickBooks API error: ${error}`);
    }

    const qbCustomer = await createResponse.json();

    await supabase
      .from("leads")
      .update({
        qbo_customer_id: qbCustomer.Customer.Id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    return new Response(
      JSON.stringify({
        success: true,
        customerId: qbCustomer.Customer.Id,
        message: "Customer synced to QuickBooks",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("QuickBooks sync error:", error);
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