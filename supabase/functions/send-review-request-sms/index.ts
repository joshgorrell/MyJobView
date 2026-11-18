import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SMSReviewRequest {
  contactId?: string;
  reviewUrl: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid authentication token");
    }

    const { contactId, reviewUrl }: SMSReviewRequest = await req.json();
    // Review requests must be tied to an authorized, opted-in contact.
    if (!contactId || typeof contactId !== "string") {
      return new Response(JSON.stringify({ error: "Contact is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let reviewHost: string;
    try {
      const parsed = new URL(reviewUrl);
      if (parsed.protocol !== "https:") throw new Error("HTTPS required");
      reviewHost = parsed.hostname.toLowerCase();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid review link" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowedReviewHosts = new Set([
      "g.page", "maps.app.goo.gl", "search.google.com", "www.google.com",
      "google.com", "maps.google.com",
    ]);
    if (!allowedReviewHosts.has(reviewHost)) {
      return new Response(JSON.stringify({ error: "Unsupported review link" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerDb = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    let recipientPhone: string;
    let recipientName: string;

    // The caller must be permitted to read this contact under RLS.
    const { data: contact, error: contactError } = await callerDb
      .from("contacts")
      .select("phone, contact_name, full_name, sms_opt_in")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return new Response(JSON.stringify({ error: "Contact not found or not accessible" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (contact.sms_opt_in !== true) {
      return new Response(JSON.stringify({ error: "Contact has not opted in to SMS" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    recipientPhone = contact.phone;
    recipientName = contact.full_name || contact.contact_name || "Customer";
    if (!recipientPhone) {
      return new Response(JSON.stringify({ error: "Contact has no phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company Twilio settings
    const { data: settings, error: settingsError } = await supabase
      .from("company_settings")
      .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .single();

    if (settingsError || !settings) {
      throw new Error("Company settings not found");
    }

    if (!settings.twilio_account_sid || !settings.twilio_auth_token || !settings.twilio_phone_number) {
      throw new Error("Twilio is not configured. Please configure Twilio in Settings > Admin.");
    }

    // Craft the SMS message
    const message = `Hi ${recipientName}! We'd love your feedback. Please leave us a Google review: ${reviewUrl}\n\nThank you!`;

    // Send SMS via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${settings.twilio_account_sid}/Messages.json`;

    const formData = new URLSearchParams();
    formData.append("To", recipientPhone);
    formData.append("From", settings.twilio_phone_number);
    formData.append("Body", message);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${settings.twilio_account_sid}:${settings.twilio_auth_token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!twilioResponse.ok) {
      const errorData = await twilioResponse.json();
      console.error("Twilio rejected review SMS", twilioResponse.status);
      throw new Error(`Failed to send SMS: ${errorData.message || twilioResponse.statusText}`);
    }

    const twilioData = await twilioResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        messageId: twilioData.sid,
        sentAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending review request SMS:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to send review request SMS",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
