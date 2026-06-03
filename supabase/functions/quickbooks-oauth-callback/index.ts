import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const realmId = url.searchParams.get("realmId");
    const state = url.searchParams.get("state");

    if (!code || !realmId) {
      throw new Error("Missing authorization code or realm ID");
    }

    const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
    const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
    const redirectUri = Deno.env.get("QUICKBOOKS_REDIRECT_URI");

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("QuickBooks OAuth configuration missing");
    }

    const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    const authHeader = btoa(`${clientId}:${clientSecret}`);

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens = await tokenResponse.json();

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await supabase
      .from("quickbooks_settings")
      .select("id")
      .maybeSingle();

    if (existing) {
      await supabase
        .from("quickbooks_settings")
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          realm_id: realmId,
          token_expires_at: expiresAt.toISOString(),
          is_connected: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("quickbooks_settings")
        .insert({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          realm_id: realmId,
          token_expires_at: expiresAt.toISOString(),
          is_connected: true,
        });
    }

    (async () => {
      try {
        const syncUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/quickbooks-fetch-customers?autoImport=true`;
        await fetch(syncUrl, {
          headers: {
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
        });
      } catch (error) {
        console.error("Initial sync error:", error);
      }
    })();

    const redirectUrl = `${Deno.env.get("APP_URL") || "http://localhost:5173"}/admin/settings?qbo=success`;

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        "Location": redirectUrl,
      },
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    
    const redirectUrl = `${Deno.env.get("APP_URL") || "http://localhost:5173"}/admin/settings?qbo=error`;
    
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        "Location": redirectUrl,
      },
    });
  }
});