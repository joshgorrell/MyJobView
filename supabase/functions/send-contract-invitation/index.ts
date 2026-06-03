import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    const { contractId, token, customerEmail, customerName, appOrigin } = await req.json();

    if (!contractId || !token || !customerEmail || !customerName) {
      throw new Error("Missing required fields");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const expirationDays = 30;

    // Fetch email template from database
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("subject, body")
      .eq("template_type", "contract_invitation")
      .eq("is_active", true)
      .maybeSingle();

    if (templateError) {
      console.error("Error fetching template:", templateError);
      throw new Error(`Failed to load email template: ${templateError.message}`);
    }

    if (!template) {
      throw new Error("Contract invitation email template not found. Please contact your administrator to set up the email template.");
    }

    // Fetch company settings including email config
    const { data: settings } = await supabase
      .from("company_settings")
      .select("company_name, from_email, from_name, portal_url, company_logo_url, company_email")
      .single();

    const companyName = settings?.company_name || "Your Company";
    const fromEmail = settings?.from_email || "noreply@yourdomain.com";
    const fromName = settings?.from_name || companyName;
    const portalUrl = settings?.portal_url || Deno.env.get("SUPABASE_URL");
    const companyLogoUrl = settings?.company_logo_url || "";
    const companyEmail = settings?.company_email || "";

    // Use appOrigin (sent by the frontend) if available, otherwise fall back to portal_url
    const baseUrl = appOrigin || portalUrl;
    const onboardingUrl = `${baseUrl}/security-onboarding?token=${token}`;

    // Build logo block for the template
    const logoBlock = companyLogoUrl
      ? `<img src="${companyLogoUrl}" alt="${companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
      : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${companyName}</span>`;

    // Validate email configuration
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured. Please contact your administrator to set up the RESEND_API_KEY in Supabase Edge Functions secrets.");
    }

    // Replace placeholders in template
    let emailHtml = template.body
      .replace(/\{\{customer_name\}\}/g, customerName)
      .replace(/\{\{onboarding_url\}\}/g, onboardingUrl)
      .replace(/\{\{expiration_days\}\}/g, expirationDays.toString())
      .replace(/\{\{company_name\}\}/g, companyName)
      .replace(/\{\{portal_url\}\}/g, portalUrl)
      .replace(/\{\{logo_block\}\}/g, logoBlock)
      .replace(/\{\{company_email\}\}/g, companyEmail);

    let emailSubject = template.subject
      .replace(/\{\{customer_name\}\}/g, customerName)
      .replace(/\{\{company_name\}\}/g, companyName);

    // Create plain text version
    const emailText = `
Dear ${customerName},

Your security monitoring agreement is ready for your review and signature.

Please complete your agreement by visiting:
${onboardingUrl}

What's Next:
- Review your agreement details
- Complete any required fields
- Review terms and conditions
- Provide your digital signature
- Set up recurring billing (if applicable)

IMPORTANT: This link will expire in ${expirationDays} days.

If you have any questions, please contact us.

Best regards,
${companyName}

This is an automated message. Please do not reply to this email.
    `;

    const response = await fetch(`https://api.resend.com/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [customerEmail],
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Resend API error:", errorText);
      let errorMessage = "Failed to send email. ";
      try {
        const errorData = JSON.parse(errorText);
        errorMessage += errorData.message || errorText;
      } catch {
        errorMessage += errorText;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({ success: true, emailId: data.id }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error sending contract invitation:", error);

    // Provide helpful error message
    let errorMessage = "Failed to send contract invitation. ";

    if (error.message) {
      errorMessage += error.message;
    } else {
      errorMessage += "Unknown error occurred.";
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
        success: false
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});