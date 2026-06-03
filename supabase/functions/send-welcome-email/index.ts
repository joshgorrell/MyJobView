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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { email, full_name } = await req.json();

    if (!email || !full_name) {
      throw new Error("Email and full name are required");
    }

    // Get email template
    const { data: template, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_type", "welcome_email")
      .eq("is_active", true)
      .maybeSingle();

    if (templateError) throw templateError;
    if (!template) {
      throw new Error("No active welcome email template found");
    }

    // Get company settings
    const { data: companySettings } = await supabaseClient
      .from("company_settings")
      .select("company_name")
      .maybeSingle();

    const companyName = companySettings?.company_name || "Your Company";
    const loginUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "").replace("https://", "https://") || "https://app.example.com";

    // Replace placeholders
    let subject = template.subject
      .replace(/{{full_name}}/g, full_name)
      .replace(/{{email}}/g, email)
      .replace(/{{company_name}}/g, companyName)
      .replace(/{{login_url}}/g, loginUrl);

    let body = template.body
      .replace(/{{full_name}}/g, full_name)
      .replace(/{{email}}/g, email)
      .replace(/{{company_name}}/g, companyName)
      .replace(/{{login_url}}/g, loginUrl);

    // Send email using Resend if API key is available
    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "onboarding@resend.dev",
          to: [email],
          subject: subject,
          text: body,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Resend API error:", data);
        throw new Error(`Failed to send email: ${data.message || "Unknown error"}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Welcome email sent", emailId: data.id }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    } else {
      // No email service configured, just log
      console.log("Welcome email would be sent to:", email);
      console.log("Subject:", subject);
      console.log("Body:", body);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Email service not configured. Email details logged.",
          preview: { subject, body }
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send welcome email" }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
