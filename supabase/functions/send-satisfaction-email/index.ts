import { sendSystemEmail } from '../_shared/system-email.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { getCompanySettings } from '../_shared/emailTemplates.ts';

function injectNoteIntoHtml(html: string, note: string): string {
    if (!note.trim()) return html;
    const noteBlock = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td style="background:#f8fafc;border-left:4px solid #06b6d4;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="color:#0c4a6e;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px 0;">Personal Note</p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0;white-space:pre-wrap;">${note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </td>
        </tr>
      </table>`;
    const insertBefore = '<p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 20px 0;">';
    if (html.includes(insertBefore)) {
      return html.replace(insertBefore, noteBlock + insertBefore);
    }
    return html.replace('</body>', noteBlock + '</body>');
  }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function buildSatisfactionEmail(params: {
  customerName: string;
  companyName: string;
  companyEmail: string;
  companyLogoUrl?: string;
  offices?: { office_name: string; phone: string }[];
  feedbackBaseUrl: string;
  responseToken: string;
  surveyType?: 'job_completion' | 'post_test_tune' | 'one_year' | 'manual';
}): string {
  const logoBlock = params.companyLogoUrl
    ? `<img src="${params.companyLogoUrl}" alt="${params.companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${params.companyName}</span>`;

  const makeRatingUrl = (rating: string) =>
    `${params.feedbackBaseUrl}/feedback?rating=${rating}&token=${params.responseToken}`;

  const ratings = [
    { key: 'excellent', label: 'Excellent', emoji: '&#128079;', bg: '#16a34a', hover: '#15803d', desc: 'Everything was great' },
    { key: 'good', label: 'Good', emoji: '&#128077;', bg: '#2563eb', hover: '#1d4ed8', desc: 'Happy with the results' },
    { key: 'okay', label: 'Okay', emoji: '&#128528;', bg: '#d97706', hover: '#b45309', desc: 'Some things could improve' },
    { key: 'needs_attention', label: 'Needs Attention', emoji: '&#128533;', bg: '#dc2626', hover: '#b91c1c', desc: 'There was a problem' },
  ];

  const makeButton = (r: typeof ratings[0]) => `
    <td align="center" valign="top" style="padding:6px;">
      <a href="${makeRatingUrl(r.key)}" style="display:block;text-decoration:none;width:120px;border-radius:12px;background:${r.bg};">
        <table role="presentation" cellpadding="0" cellspacing="0" width="120" style="width:120px;border-radius:12px;background:${r.bg};">
          <tr><td align="center" style="padding:16px 8px 8px;"><span style="display:block;font-size:28px;line-height:32px;">${r.emoji}</span></td></tr>
          <tr><td align="center" height="36" style="padding:0 8px;vertical-align:middle;"><span style="display:block;color:#ffffff;font-size:13px;font-weight:700;line-height:16px;">${r.key === 'needs_attention' ? 'Needs<br>Attention' : r.label}</span></td></tr>
          <tr><td align="center" height="32" style="padding:6px 8px 16px;vertical-align:top;"><span style="display:block;color:#ffffff;font-size:11px;line-height:16px;">${r.key === 'okay' ? 'Room to improve' : r.key === 'needs_attention' ? 'Please contact me' : r.desc}</span></td></tr>
        </table>
      </a>
    </td>`;

  const [r0, r1, r2, r3] = ratings;
  const ratingGrid = `
    <table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
      <tr>
        ${makeButton(r0)}
        ${makeButton(r1)}
      </tr>
      <tr>
        ${makeButton(r2)}
        ${makeButton(r3)}
      </tr>
    </table>`;

  const heading = params.surveyType === 'one_year' ? 'How’s everything after your first year?' : params.surveyType === 'post_test_tune' ? 'How did Test & Tune go?' : 'How Did We Do?';
  const intro = params.surveyType === 'one_year'
    ? `It’s been about a year since your system was completed. We’d love a quick check-in on how everything is working for you. This is also a great time to schedule a system checkup and ask about available service or protection plans.`
    : params.surveyType === 'post_test_tune'
      ? `Your Test & Tune period has wrapped up. After living with the system and giving us a chance to make adjustments, we’d love to know how the overall experience went.`
      : params.surveyType === 'job_completion'
        ? `Your project is substantially complete. Before Test & Tune begins, we’d love a quick read on how our team did and whether there’s anything that needs our attention.`
        : `Now that our work is finished, we’d love to know how we did. Please choose a rating below and share any feedback. If we earned a Good or Excellent rating, we’d appreciate a 5-star Google review.`;

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
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid #0e7490;">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">${heading}</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;">Your feedback helps us improve</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:44px 44px 36px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 16px 0;">Hi ${params.customerName || 'there'},</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 32px 0;">${intro} Just tap the button that best describes your experience:</p>

        ${ratingGrid}

        <p style="color:#9ca3af;font-size:13px;text-align:center;margin:28px 0 0 0;line-height:1.6;">Takes less than 60 seconds. Your feedback goes directly to our team.</p>
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:#0e7490;font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${params.companyName}</p>
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

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isServiceCall = authHeader === `Bearer ${serviceKey}`;
    let user: { id: string } | null = null;

    if (!isServiceCall) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !data.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      user = data.user;
    }

    const { contactId, customerName, customerEmail, salesRepId, salesRepName, leadTechId, leadTechName, appUrl: appUrlFromClient, resendRecordId, surveyType = 'manual', projectId, salesOrderId, previewOnly = false, customSubject, personalNote } = await req.json();

    if (!customerEmail && !resendRecordId) {
      return new Response(JSON.stringify({ error: 'Customer email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: contactOrg } = contactId
      ? await supabaseAdmin.from('contacts').select('organization_id').eq('id', contactId).maybeSingle()
      : { data: null };

    const { data: profile } = user
      ? await supabaseAdmin.from('profiles').select('organization_id').eq('id', user.id).maybeSingle()
      : { data: null };

    const organizationId = profile?.organization_id || contactOrg?.organization_id;
    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'Could not determine organization' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let record: { id: string; response_token: string; customer_name: string; customer_email: string };

    if (previewOnly) {
      const settings = await getCompanySettings(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const appUrl = appUrlFromClient || settings.app_url || Deno.env.get('APP_URL') || 'https://app.electroniclife.com';
      const previewToken = crypto.randomUUID();
      const previewName = customerName || 'Valued Customer';
      let emailHtml = buildSatisfactionEmail({
        customerName: previewName,
        companyName: settings.company_name,
        companyEmail: settings.company_email,
        companyLogoUrl: settings.company_logo_url || '',
        offices: settings.offices || [],
        feedbackBaseUrl: appUrl,
        responseToken: previewToken,
        surveyType,
      });
      const firstName = previewName.split(' ')[0];
      let subject = surveyType === 'one_year'
        ? (firstName ? `How’s everything after your first year, ${firstName}?` : 'How’s everything after your first year?')
        : surveyType === 'post_test_tune'
          ? (firstName ? `How did Test & Tune go, ${firstName}?` : 'How did Test & Tune go?')
          : surveyType === 'job_completion'
            ? (firstName ? `How did we do, ${firstName}?` : 'How did we do?')
            : (firstName ? `We’d love your feedback, ${firstName}` : 'We’d love your feedback');
      return new Response(JSON.stringify({ success: true, preview: true, subject, html: emailHtml }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (resendRecordId) {
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('customer_satisfaction')
        .select('id, response_token, customer_name, customer_email')
        .eq('id', resendRecordId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (fetchError || !existing) {
        return new Response(JSON.stringify({ error: 'Satisfaction record not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      record = existing;
    } else {
      const responseToken = crypto.randomUUID();

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('customer_satisfaction')
        .insert({
          organization_id: organizationId,
          contact_id: contactId || null,
          customer_name: customerName || '',
          customer_email: customerEmail,
          sales_rep_id: salesRepId || null,
          sales_rep_name: salesRepName || '',
          lead_tech_id: leadTechId || null,
          lead_tech_name: leadTechName || '',
          response_token: responseToken,
          created_by: user?.id || null,
          survey_type: surveyType,
          project_id: projectId || null,
          sales_order_id: salesOrderId || null,
        })
        .select('id, response_token, customer_name, customer_email')
        .single();

      if (insertError || !inserted) {
        console.error('Insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create satisfaction record' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      record = inserted;
    }

    const settings = await getCompanySettings(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const appUrl = appUrlFromClient || settings.app_url || Deno.env.get('APP_URL') || 'https://app.electroniclife.com';

    const finalCustomerName = record.customer_name || customerName || '';
    const finalCustomerEmail = record.customer_email || customerEmail || '';

    let emailHtml = buildSatisfactionEmail({
      customerName: finalCustomerName,
      companyName: settings.company_name,
      companyEmail: settings.company_email,
      companyLogoUrl: settings.company_logo_url || '',
      offices: settings.offices || [],
      feedbackBaseUrl: appUrl,
      responseToken: record.response_token,
      surveyType,
    });

    const firstName = finalCustomerName.split(' ')[0];
    let subject = surveyType === 'one_year'
      ? (firstName ? `How’s everything after your first year, ${firstName}?` : 'How’s everything after your first year?')
      : surveyType === 'post_test_tune'
        ? (firstName ? `How did Test & Tune go, ${firstName}?` : 'How did Test & Tune go?')
        : (firstName ? `How did we do, ${firstName}?` : 'How did we do?');

    if (typeof customSubject === 'string' && customSubject.trim()) subject = customSubject.trim().slice(0, 200);
    if (typeof personalNote === 'string') emailHtml = injectNoteIntoHtml(emailHtml, personalNote.slice(0, 5000));

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('Email service is not configured: RESEND_API_KEY is missing.');
    }

    const emailResponse = await sendSystemEmail({
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: settings.from_address,
        to: finalCustomerEmail,
        reply_to: settings.reply_to_email,
        subject,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error('Resend error:', errText);
      return new Response(JSON.stringify({ error: 'Failed to send email', details: errText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Satisfaction survey sent', recordId: record.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending satisfaction email:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
