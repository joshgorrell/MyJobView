import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Appointment SMS delivery must be implemented through the authenticated,
// consent-aware, idempotent dispatcher. This legacy endpoint previously returned
// a fabricated "sent" result without contacting Twilio.
//
// Fail closed until the dispatcher is ready: no false message IDs, no customer
// data in logs, and no misleading successful HTTP response.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }

  return new Response(JSON.stringify({
    success: false,
    status: "not_configured",
    error: "Appointment SMS reminders are not yet enabled. No text message was sent.",
  }), {
    status: 503,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
