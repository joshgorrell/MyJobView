import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getEmailTemplate, getCompanySettings, replacePlaceholders, convertTextToHtml, wrapInEmailLayout } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailRequest {
  to: string[];
  leadId: string;
  leadName: string;
  companyName?: string;
  isFishbowl: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { to, leadId, leadName, companyName, isFishbowl }: EmailRequest = await req.json();

    if (!to || to.length === 0 || !leadId || !leadName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const settings = await getCompanySettings(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const leadUrl = `${supabaseUrl.replace('.supabase.co', '')}/lead/${leadId}`;

    const template = await getEmailTemplate(
      'lead_notification',
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let subject: string;
    let emailBody: string;

    if (template) {
      const placeholders = {
        sales_rep_name: 'Team Member',
        lead_name: leadName,
        lead_company: companyName || 'N/A',
        lead_email: '',
        lead_phone: '',
        lead_source: isFishbowl ? 'Fishbowl' : 'Direct Assignment',
        lead_priority: 'Standard',
        lead_notes: isFishbowl ? 'This lead is available in the Fishbowl - first come, first served!' : 'You have been assigned this lead.',
        app_link: leadUrl,
        company_name: settings.company_name,
      };

      subject = replacePlaceholders(template.subject, placeholders);
      const bodyText = replacePlaceholders(template.body, placeholders);
      emailBody = convertTextToHtml(bodyText);
    } else {
      subject = isFishbowl
        ? "New Lead Available in Fishbowl"
        : "New Lead Assigned to You";

      emailBody = `
        <div style="text-align: center; padding: 20px 0;">
          <h1 style="color: #2563eb; margin: 0;">${subject}</h1>
        </div>
        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <h2 style="margin-top: 0; color: #1f2937;">Lead Details</h2>
          <p><strong>Contact:</strong> ${leadName}</p>
          ${companyName ? `<p><strong>Company:</strong> ${companyName}</p>` : ''}
          ${isFishbowl ? '<p style="color: #059669; font-weight: bold;">🐟 This lead is available in the Fishbowl - first come, first served!</p>' : ''}
        </div>
        <p>
          ${isFishbowl
            ? 'A new lead has been added to the Fishbowl and is ready to be claimed. Click the button below to view details and claim this opportunity.'
            : 'You have been assigned a new lead. Click the button below to view the full details and start working on this opportunity.'
          }
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${leadUrl}" class="button">View Lead Details</a>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          Can't click the button? Copy and paste this link into your browser:<br>
          <a href="${leadUrl}" style="color: #2563eb;">${leadUrl}</a>
        </p>
      `;
    }

    const emailHtml = wrapInEmailLayout(
      emailBody,
      settings.company_name,
      settings.company_email,
      '#2563eb',
      settings.company_logo_url || '',
      settings.offices || []
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      console.log("Resend API key not configured. Email would have been sent to:", to);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Email service not configured (demo mode)",
          recipients: to
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const emailPromises = to.map(email =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: settings.from_address,
          to: [email],
          reply_to: settings.reply_to_email,
          subject: subject,
          html: emailHtml,
        }),
      })
    );

    const results = await Promise.all(emailPromises);
    const failedEmails = results.filter(r => !r.ok);

    if (failedEmails.length > 0) {
      console.error("Some emails failed to send:", failedEmails);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: results.length - failedEmails.length,
        failed: failedEmails.length
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
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
