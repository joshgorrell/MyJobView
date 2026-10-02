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
    const { contractId, requestId, appOrigin } = await req.json();

    if (!contractId || !requestId) {
      throw new Error("Missing required fields");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) throw new Error('Authentication required');
    const caller = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) throw new Error('Authentication required');
    const { data: attempt, error: prepareError } = await caller.rpc('security_prepare_invitation', { p_id: contractId, p_request: requestId });
    if (prepareError || !attempt) throw new Error(prepareError?.message || 'Invitation could not be prepared');
    if (attempt.sent_at) return new Response(JSON.stringify({ success: true, emailId: attempt.provider_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const token = attempt.token;
    const { data: contract } = await supabase.from('security_contracts')
      .select('organization_id, contact_id, email_override').eq('id', contractId).single();
    if (!contract || contract.organization_id !== attempt.organization_id) throw new Error('Agreement not found');
    const { data: contact } = await supabase.from('contacts').select('email, full_name')
      .eq('id', contract.contact_id).eq('organization_id', contract.organization_id).maybeSingle();
    const customerEmail = attempt.recipient;
    const customerName = contact?.full_name || 'Customer';
    if (!customerEmail) throw new Error('Customer email is required');
    const expirationDays = Math.max(1, Math.ceil((new Date(attempt.expires_at).getTime() - Date.now()) / 86400000));

    // Fetch email template from database
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("subject, body")
      .eq("template_type", "contract_invitation")
      .eq("organization_id", contract.organization_id)
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
      .eq("organization_id", contract.organization_id)
      .single();

    const { data: orgData } = await supabase
      .from("organizations")
      .select("subdomain")
      .eq("id", contract.organization_id)
      .maybeSingle();

    const companyName = settings?.company_name || "Your Company";
    const fromEmail = settings?.from_email || "noreply@yourdomain.com";
    const fromName = settings?.from_name || companyName;
    const portalUrl = settings?.portal_url || "https://myjobview.com/portal";
    const companyLogoUrl = settings?.company_logo_url || "";
    const companyEmail = settings?.company_email || "";

    // Use appOrigin (sent by the frontend) if available, otherwise fall back to subdomain or portal_url
    const subdomain = orgData?.subdomain || null;
    const defaultOrigin = subdomain ? `https://${subdomain}.myjobview.com` : new URL(portalUrl).origin;
    const allowedOrigins = new Set([defaultOrigin, 'https://myjobview.com', 'https://www.myjobview.com']);
    const baseUrl = typeof appOrigin === 'string' && allowedOrigins.has(appOrigin) ? appOrigin : defaultOrigin;
    const onboardingUrl = `${baseUrl}/portal/security?token=${encodeURIComponent(token)}`;

    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    // Build logo block for the template
    const logoBlock = companyLogoUrl
      ? `<img src="${escapeHtml(companyLogoUrl)}" alt="${escapeHtml(companyName)}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
      : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${escapeHtml(companyName)}</span>`;

    // Validate email configuration
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured. Please contact your administrator to set up the RESEND_API_KEY in Supabase Edge Functions secrets.");
    }

    // Replace placeholders in template
    let emailHtml = template.body
      .replace(/\{\{customer_name\}\}/g, () => escapeHtml(customerName))
      .replace(/\{\{onboarding_url\}\}/g, () => escapeHtml(onboardingUrl))
      .replace(/\{\{expiration_days\}\}/g, expirationDays.toString())
      .replace(/\{\{company_name\}\}/g, () => escapeHtml(companyName))
      .replace(/\{\{portal_url\}\}/g, () => escapeHtml(portalUrl))
      .replace(/\{\{logo_block\}\}/g, logoBlock)
      .replace(/\{\{company_email\}\}/g, () => escapeHtml(companyEmail));

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
- Resume saved progress from the Security section of your customer portal
- Print or download your agreement before signing
- Review your agreement details
- Complete any required fields
- Review terms and conditions
- Provide your digital signature
- Add or select a payment method and authorize automatic recurring payments

IMPORTANT: This link will expire in ${expirationDays} days.

If you have any questions, please contact us.

Best regards,
${companyName}

This is an automated message. Please do not reply to this email.
    `;

    const { data: message, error: messageError } = await supabase.rpc('security_invitation_message', {
      p_attempt: attempt.id, p_message: { from: `${fromName} <${fromEmail}>`, to: [customerEmail], subject: emailSubject, html: emailHtml, text: emailText },
    });
    if (messageError || !message) throw new Error('Invitation delivery could not be prepared safely.');

    const response = await fetch(`https://api.resend.com/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
        "Idempotency-Key": `security-invitation-${attempt.id}`,
      },
      body: JSON.stringify(message),
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
    const { error: finishError } = await supabase.rpc('security_finish_invitation', { p_attempt: attempt.id, p_provider_id: data.id });
    if (finishError) throw new Error('Email was accepted, but delivery recording needs retry. Retry this invitation to reconcile it safely.');

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
