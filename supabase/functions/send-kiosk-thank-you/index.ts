import { sendSystemEmail } from '../_shared/system-email.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { email, contact_name, interests } = await req.json();

    if (!email || !contact_name) {
      throw new Error("Email and contact name are required");
    }

    // Get email template
    const { data: template, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_type", "kiosk_thank_you")
      .eq("is_active", true)
      .maybeSingle();

    if (templateError) throw templateError;
    if (!template) {
      throw new Error("No active kiosk thank you email template found");
    }

    // Get company settings + organization subdomain
    const [settingsRes, orgRes] = await Promise.all([
      supabaseClient.from("company_settings").select("*").maybeSingle(),
      supabaseClient.from("organizations").select("subdomain").limit(1).maybeSingle(),
    ]);

    const companySettings = settingsRes.data;
    const subdomain = orgRes.data?.subdomain || null;

    const companyName = companySettings?.company_name || "Electronic Life";
    const companyPhone = companySettings?.company_phone || "";
    const companyEmail = companySettings?.email_from_address || "info@electroniclife.com";
    const companyWebsite = subdomain
      ? `https://${subdomain}.myjobview.com`
      : (companySettings?.portal_url || "https://electroniclife.com");

    // Build interests HTML
    let interestsHtml = '';
    if (interests && Array.isArray(interests) && interests.length > 0) {
      interestsHtml = '<ul>' + interests.map((interest: string) => `<li>${interest}</li>`).join('') + '</ul>';
    } else {
      interestsHtml = '<p>Various products and services</p>';
    }

    // Replace placeholders
    let subject = template.subject
      .replace(/{{contact_name}}/g, contact_name)
      .replace(/{{company_name}}/g, companyName);

    let body = template.body
      .replace(/{{contact_name}}/g, contact_name)
      .replace(/{{company_name}}/g, companyName)
      .replace(/{{company_phone}}/g, companyPhone)
      .replace(/{{company_email}}/g, companyEmail)
      .replace(/{{company_website}}/g, companyWebsite)
      .replace(/{{interests_html}}/g, interestsHtml);

    // Send email using Resend if API key is available
    if (RESEND_API_KEY) {
      const fromEmail = companySettings?.email_from_address || "onboarding@resend.dev";

      const res = await sendSystemEmail({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: subject,
          html: body,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Resend API error:", data);
        throw new Error(`Failed to send email: ${data.message || "Unknown error"}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Email sent successfully", data }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      throw new Error('Email service is not configured: RESEND_API_KEY is missing.');
    }
  } catch (error: any) {
    console.error("Error sending kiosk thank you email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
