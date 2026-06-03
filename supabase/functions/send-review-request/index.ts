import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { getEmailTemplate, getCompanySettings, replacePlaceholders, convertTextToHtml, wrapInEmailLayout } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function injectPersonalNote(html: string, note: string): string {
  if (!note.trim()) return html;
  const noteBlock = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background:#f8fafc;border-left:4px solid #06b6d4;border-radius:0 8px 8px 0;padding:16px 20px;"><p style="color:#0c4a6e;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px 0;">Personal Note</p><p style="color:#374151;font-size:15px;line-height:1.7;margin:0;white-space:pre-wrap;">${note.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p></td></tr></table>`;
  const marker = '<p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 20px 0;">';
  if (html.includes(marker)) return html.replace(marker, noteBlock + marker);
  return html.replace('</body>', noteBlock + '</body>');
}

function buildReviewRequestEmail(params: {
  customerName: string;
  companyName: string;
  companyEmail: string;
  offices?: { office_name: string; phone: string }[];
  companyLogoUrl?: string;
  reviewUrl: string;
}): string {
  const logoBlock = params.companyLogoUrl
    ? `<img src="${params.companyLogoUrl}" alt="${params.companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${params.companyName}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>We'd love your feedback!</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid #06b6d4;">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">Your Opinion Matters</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;">to us and to your community</p>
        <div style="margin-top:20px;"><span style="font-size:24px;letter-spacing:3px;color:#f59e0b;">&#9733;&#9733;&#9733;&#9733;&#9733;</span></div>
      </td></tr>
      <tr><td style="background:#ffffff;padding:44px 44px 36px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 20px 0;">Hi ${params.customerName || 'there'},</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 18px 0;">Thank you for choosing <strong style="color:#0e7490;">${params.companyName}</strong>. We take pride in every project we complete and we genuinely hope your experience exceeded your expectations.</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 32px 0;">If you have a moment, we'd be grateful if you could share your experience with others on Google. Reviews like yours help homeowners and businesses in the community find reliable, quality service.</p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 32px 0;">
          <a href="${params.reviewUrl}" style="display:inline-block;background:#0e7490;color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:10px;font-size:17px;font-weight:700;letter-spacing:0.01em;">Leave Us a Google Review</a>
        </td></tr></table>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;"><tr><td style="padding:18px 22px;">
          <p style="color:#0f172a;font-size:13px;margin:0 0 5px 0;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Takes less than 2 minutes</p>
          <p style="color:#475569;font-size:14px;margin:0;line-height:1.6;">Just a sentence or two is enough. Your words directly help our team grow.</p>
        </td></tr></table>
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:#06b6d4;font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${params.companyName}</p>
        ${params.companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${params.companyEmail}</p>` : ''}
        ${params.offices && params.offices.length > 0 ? `<p style="color:#94a3b8;font-size:12px;margin:6px 0 0 0;line-height:1.8;">${params.offices.map(o => `${o.office_name}: ${o.phone}`).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</p>` : ''}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you recently worked with us.<br>Thank you for your business.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
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
    let customerName = name || '';
    let subjectName = (name || '').split(' ')[0];

    if (contactId) {
      const { data: contact, error: contactError } = await supabaseAdmin
        .from('contacts')
        .select('contact_name, first_name, last_name, email, company_name')
        .eq('id', contactId)
        .single();

      if (contactError) {
        console.error('Contact fetch error:', contactError);
        return new Response(JSON.stringify({ error: 'Contact not found', details: contactError.message }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!contact) {
        return new Response(JSON.stringify({ error: 'Contact not found' }), {
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
      customerName = contact.first_name || contact.contact_name || contact.company_name || '';
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
      'review_request',
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let subject: string;
    let emailHtml: string;

    if (template) {
      const placeholders = {
        customer_name: customerName,
        company_name: settings.company_name,
        review_url: reviewUrl,
      };

      subject = replacePlaceholders(template.subject, placeholders);
      const bodyText = replacePlaceholders(template.body, placeholders);
      const emailBody = convertTextToHtml(bodyText);
      emailHtml = wrapInEmailLayout(
        emailBody,
        settings.company_name,
        settings.company_email,
        '#06b6d4',
        settings.company_logo_url || '',
        settings.offices || []
      );
    } else {
      subject = customSubject || (subjectName ? `We'd love your feedback, ${subjectName}!` : `We'd love your feedback!`);
      emailHtml = buildReviewRequestEmail({
        customerName,
        companyName: settings.company_name,
        companyEmail: settings.company_email,
        offices: settings.offices || [],
        companyLogoUrl: settings.company_logo_url || '',
        reviewUrl,
      });
    }

    if (personalNote) {
      emailHtml = injectPersonalNote(emailHtml, personalNote);
    }
    if (customSubject) {
      subject = customSubject;
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.log('Sending review request email to:', recipientEmail);
      console.log('Customer name:', customerName);
      console.log('Review URL:', reviewUrl);

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
      throw new Error('Failed to send email');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Review request sent successfully',
        email: recipientEmail
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error sending review request:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
