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
    const { leadId, amount, description, lineItems } = await req.json();

    if (!leadId || !amount) {
      throw new Error("Lead ID and amount are required");
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

    if (!lead.qbo_customer_id) {
      throw new Error("Lead not synced to QuickBooks. Sync customer first.");
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

    const invoiceLines = lineItems && lineItems.length > 0
      ? lineItems.map((item: any, index: number) => ({
          LineNum: index + 1,
          Amount: item.amount,
          DetailType: "SalesItemLineDetail",
          Description: item.description,
          SalesItemLineDetail: {
            Qty: item.quantity || 1,
            UnitPrice: item.unitPrice || item.amount,
          },
        }))
      : [
          {
            LineNum: 1,
            Amount: amount,
            DetailType: "SalesItemLineDetail",
            Description: description || lead.opportunity_description || "Services",
            SalesItemLineDetail: {
              Qty: 1,
              UnitPrice: amount,
            },
          },
        ];

    const invoiceData = {
      CustomerRef: {
        value: lead.qbo_customer_id,
      },
      Line: invoiceLines,
      TxnDate: new Date().toISOString().split('T')[0],
    };

    const qbApiUrl = `https://quickbooks.api.intuit.com/v3/company/${qbSettings.realm_id}/invoice`;

    const createResponse = await fetch(qbApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(invoiceData),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`QuickBooks API error: ${error}`);
    }

    const qbInvoice = await createResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        invoiceId: qbInvoice.Invoice.Id,
        invoiceNumber: qbInvoice.Invoice.DocNumber,
        totalAmount: qbInvoice.Invoice.TotalAmt,
        message: "Invoice created in QuickBooks",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("QuickBooks invoice error:", error);
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