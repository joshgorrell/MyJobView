import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SMSReviewRequest {
  contactId?: string;
  phone?: string;
  name?: string;
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

    const { contactId, phone, name, reviewUrl }: SMSReviewRequest = await req.json();

    let recipientPhone: string;
    let recipientName: string;

    // Get recipient details
    if (contactId) {
      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("phone, contact_name, full_name")
        .eq("id", contactId)
        .single();

      if (contactError || !contact) {
        throw new Error("Contact not found");
      }

      if (!contact.phone) {
        throw new Error("Contact does not have a phone number");
      }

      recipientPhone = contact.phone;
      recipientName = contact.full_name || contact.contact_name || "Customer";
    } else if (phone) {
      recipientPhone = phone;
      recipientName = name || "Customer";
    } else {
      throw new Error("Either contactId or phone number must be provided");
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
      console.error("Twilio error:", errorData);
      throw new Error(`Failed to send SMS: ${errorData.message || twilioResponse.statusText}`);
    }

    const twilioData = await twilioResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        messageId: twilioData.sid,
        to: recipientPhone,
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
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
