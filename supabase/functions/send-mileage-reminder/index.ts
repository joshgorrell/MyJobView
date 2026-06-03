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

    const {
      to_email,
      full_name,
      vehicle_info,
      last_entry_date,
      days_since,
      last_mileage,
      portal_url,
      company_name,
      urgency,
      urgency_label,
      urgency_message
    } = await req.json();

    if (!to_email || !full_name || !vehicle_info) {
      throw new Error("Required fields are missing");
    }

    // Get email template
    const { data: template, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_type", "mileage_reminder_email")
      .eq("is_active", true)
      .maybeSingle();

    if (templateError) throw templateError;
    if (!template) {
      throw new Error("No active mileage reminder email template found");
    }

    // Replace placeholders
    let subject = template.subject
      .replace(/{{urgency_label}}/g, urgency_label || '')
      .replace(/{{full_name}}/g, full_name)
      .replace(/{{vehicle_info}}/g, vehicle_info)
      .replace(/{{company_name}}/g, company_name || 'Company');

    let body = template.body
      .replace(/{{urgency_label}}/g, urgency_label || '')
      .replace(/{{urgency_message}}/g, urgency_message || '')
      .replace(/{{full_name}}/g, full_name)
      .replace(/{{vehicle_info}}/g, vehicle_info)
      .replace(/{{last_entry_date}}/g, last_entry_date || 'Never')
      .replace(/{{days_since}}/g, String(days_since || 0))
      .replace(/{{last_mileage}}/g, String(last_mileage || 0))
      .replace(/{{portal_url}}/g, portal_url || '#')
      .replace(/{{company_name}}/g, company_name || 'Company');

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
          to: [to_email],
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
        JSON.stringify({ success: true, message: "Mileage reminder email sent", emailId: data.id }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    } else {
      // No email service configured, just log
      console.log("Mileage reminder email would be sent to:", to_email);
      console.log("Subject:", subject);
      console.log("Urgency:", urgency);
      console.log("Days since:", days_since);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Email service not configured. Email details logged.",
          preview: {
            to: to_email,
            subject,
            urgency,
            days_since,
            vehicle_info
          }
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
    console.error("Error sending mileage reminder email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send mileage reminder email" }),
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
