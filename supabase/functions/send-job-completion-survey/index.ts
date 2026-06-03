import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { getEmailTemplate, getCompanySettings, replacePlaceholders, convertTextToHtml, wrapInEmailLayout } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function buildJobCompletionSurveyEmail(params: {
  customerName: string;
  companyName: string;
  companyEmail: string;
  offices?: { office_name: string; phone: string }[];
  companyLogoUrl?: string;
  companyWebsite?: string;
  reviewUrl: string;
}): string {
  const EL_LOGO_URL = 'https://bqtsuzvuvqvgidipbsis.supabase.co/storage/v1/object/public/organization-logos/el_logo_color_(2).png';
  const logoUrl = params.companyLogoUrl || EL_LOGO_URL;
  const logoBlock = `<img src="${logoUrl}" alt="${params.companyName}" style="max-height:64px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`;

  const websiteLink = params.companyWebsite
    ? `<a href="${params.companyWebsite}" style="color:#06b6d4;text-decoration:none;font-weight:600;font-size:13px;">${params.companyWebsite}</a>`
    : '';

  const starIcon = `<table cellpadding="0" cellspacing="0" style="display:inline-table;"><tr>
    <td style="width:20px;height:20px;background:#f59e0b;border-radius:3px;text-align:center;vertical-align:middle;font-size:13px;font-weight:900;color:#ffffff;line-height:20px;">&#9733;</td>
  </tr></table>`;

  const warningIcon = `<table cellpadding="0" cellspacing="0" style="display:inline-table;"><tr>
    <td style="width:20px;height:20px;background:#dc2626;border-radius:3px;text-align:center;vertical-align:middle;font-size:12px;font-weight:900;color:#ffffff;line-height:20px;">!</td>
  </tr></table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>How did we do?</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid #06b6d4;">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">How did we do?</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;">Your experience means everything to us</p>
        <div style="margin-top:20px;"><span style="font-size:24px;letter-spacing:3px;color:#f59e0b;">&#9733;&#9733;&#9733;&#9733;&#9733;</span></div>
      </td></tr>
      <tr><td style="background:#ffffff;padding:44px 44px 36px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 20px 0;">Hi ${params.customerName || 'there'},</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 18px 0;">Thank you for choosing <strong style="color:#0e7490;">${params.companyName}</strong>! We truly appreciate you trusting us with your project and we hope your experience exceeded your expectations.</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 32px 0;">We'd love to hear how we did. Your feedback not only helps us grow — it helps other homeowners and businesses in the community find reliable, quality service they can count on.</p>

        <!-- 5-Star Section -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;margin-bottom:24px;">
          <tr><td style="padding:24px 28px;">
            <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>
              <td style="background:#16a34a;border-radius:6px;width:28px;height:28px;text-align:center;vertical-align:middle;font-size:15px;font-weight:900;color:#ffffff;line-height:28px;">&#9733;</td>
              <td style="padding-left:10px;color:#15803d;font-size:16px;font-weight:700;vertical-align:middle;">If we earned 5 stars...</td>
            </tr></table>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px 0;">We'd be so grateful if you'd take 2 minutes to share your experience on Google. A quick review helps our team grow and lets your neighbors know they can count on us.</p>
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
              <a href="${params.reviewUrl}" style="display:inline-block;background:#ffffff;border:2px solid #dadce0;border-radius:8px;text-decoration:none;padding:12px 24px;font-family:Arial,sans-serif;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-3.58-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="color:#3c4043;font-size:15px;font-weight:600;font-family:Arial,sans-serif;letter-spacing:0.01em;">Write a Google Review</span>
                  </td>
                </tr></table>
              </a>
            </td></tr></table>
          </td></tr>
        </table>

        <!-- Fell Short Section -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:12px;border:1px solid #fecaca;margin-bottom:32px;">
          <tr><td style="padding:24px 28px;">
            <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>
              <td style="background:#dc2626;border-radius:6px;width:28px;height:28px;text-align:center;vertical-align:middle;font-size:15px;font-weight:900;color:#ffffff;line-height:28px;">!</td>
              <td style="padding-left:10px;color:#b91c1c;font-size:16px;font-weight:700;vertical-align:middle;">If we fell short of 5 stars...</td>
            </tr></table>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 4px 0;">Please reach out to us directly before posting a review. We'd love the opportunity to make it right.</p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0;">Simply reply to this email or give us a call — we're here to help.</p>
          </td></tr>
        </table>

        <p style="color:#374151;font-size:15px;line-height:1.75;margin:0 0 28px 0;">And if you ever need additional service, training, or just have questions about your system, don't hesitate to reach out. We're always happy to help.</p>

        <p style="color:#374151;font-size:15px;line-height:1.75;margin:0 0 4px 0;">Thank you again for being an <strong style="color:#0e7490;">${params.companyName}</strong> customer.</p>
        <p style="color:#374151;font-size:15px;line-height:1.75;margin:0 0 4px 0;font-style:italic;font-weight:600;">Innovate. Integrate. Inspire.</p>
        <p style="color:#6b7280;font-size:14px;line-height:1.75;margin:0;">The ${params.companyName} Team${websiteLink ? ` &nbsp;&bull;&nbsp; ${websiteLink}` : ''}</p>
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <img src="${logoUrl}" alt="${params.companyName}" style="max-height:36px;max-width:140px;object-fit:contain;display:block;margin:0 auto 12px auto;opacity:0.85;" />
        <p style="color:#06b6d4;font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${params.companyName}</p>
        ${params.companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${params.companyEmail}</p>` : ''}
        ${params.offices && params.offices.length > 0 ? `<p style="color:#94a3b8;font-size:12px;margin:6px 0 0 0;line-height:1.8;">${params.offices.map(o => `${o.office_name}: ${o.phone}`).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</p>` : ''}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this because we recently completed work at your property.<br>Thank you for your business.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function injectPersonalNote(html: string, note: string): string {
  if (!note.trim()) return html;
  const noteBlock = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background:#f8fafc;border-left:4px solid #06b6d4;border-radius:0 8px 8px 0;padding:16px 20px;"><p style="color:#0c4a6e;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px 0;">Personal Note</p><p style="color:#374151;font-size:15px;line-height:1.7;margin:0;white-space:pre-wrap;">${note.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p></td></tr></table>`;
  const marker = '<p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 20px 0;">';
  if (html.includes(marker)) return html.replace(marker, noteBlock + marker);
  return html.replace('</body>', noteBlock + '</body>');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { contactId, email, name, reviewUrl, personalNote, customSubject } = await req.json();

    if (!reviewUrl) {
      return new Response(JSON.stringify({ error: 'Review URL required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let recipientEmail = email;
    let customerFirstName = name || '';
    let subjectName = (name || '').split(' ')[0];

    if (contactId) {
      const { data: contact, error: contactError } = await supabaseAdmin
        .from('contacts')
        .select('contact_name, first_name, last_name, email, company_name')
        .eq('id', contactId)
        .single();

      if (contactError || !contact) {
        return new Response(JSON.stringify({ error: 'Contact not found', details: contactError?.message }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!contact.email) {
        return new Response(JSON.stringify({ error: 'Contact has no email address' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      recipientEmail = contact.email;
      customerFirstName = contact.first_name || contact.contact_name || contact.company_name || '';
      subjectName = contact.first_name || contact.company_name || '';
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'Email address required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const settings = await getCompanySettings(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const template = await getEmailTemplate(
      'job_completion_survey',
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const companyWebsite = (settings as any).company_website || '';

    let subject: string;

    if (template) {
      const placeholders = {
        customer_first_name: customerFirstName,
        company_name: settings.company_name,
        review_url: reviewUrl,
        company_website: companyWebsite,
      };
      subject = replacePlaceholders(template.subject, placeholders);
    } else {
      subject = customSubject || (subjectName ? `Your opinion matters, ${subjectName}!` : `Your opinion matters!`);
    }

    const emailHtml = buildJobCompletionSurveyEmail({
      customerName: customerFirstName,
      companyName: settings.company_name,
      companyEmail: settings.company_email,
      offices: settings.offices || [],
      companyLogoUrl: settings.company_logo_url || '',
      companyWebsite,
      reviewUrl,
    });

    if (personalNote) {
      emailHtml = injectPersonalNote(emailHtml, personalNote);
    }
    if (customSubject) {
      subject = customSubject;
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.log('Demo mode — would send survey to:', recipientEmail);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email service not configured (demo mode)',
          email: recipientEmail
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: settings.from_address,
        to: recipientEmail,
        reply_to: settings.reply_to_email,
        subject: subject,
        html: emailHtml,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Email send failed:', errorText);
      throw new Error('Failed to send survey email');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Job completion survey sent successfully',
        email: recipientEmail
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error sending job completion survey:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
