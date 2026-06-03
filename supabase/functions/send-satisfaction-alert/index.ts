import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { getCompanySettings } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function buildAlertEmail(params: {
  companyName: string;
  companyLogoUrl?: string;
  customerName: string;
  customerEmail: string;
  rating: string;
  comment: string;
  salesRepName: string;
  leadTechName: string;
  respondedAt: string;
}): string {
  const logoBlock = params.companyLogoUrl
    ? `<img src="${params.companyLogoUrl}" alt="${params.companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;">${params.companyName}</span>`;

  const ratingColors: Record<string, string> = {
    excellent: '#16a34a',
    good: '#2563eb',
    okay: '#d97706',
    needs_attention: '#dc2626',
  };
  const ratingLabels: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    okay: 'Okay',
    needs_attention: 'Needs Attention',
  };

  const ratingColor = ratingColors[params.rating] || '#6b7280';
  const ratingLabel = ratingLabels[params.rating] || params.rating;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Customer Feedback Alert</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:32px 44px 28px;text-align:center;border-bottom:3px solid ${ratingColor};">
        <div style="margin-bottom:16px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 6px 0;font-size:24px;font-weight:800;">Customer Feedback Received</h1>
        <p style="color:#94a3b8;margin:0;font-size:14px;">A customer has submitted their satisfaction survey</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:40px 44px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:28px;">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
            <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 4px 0;">Rating</p>
            <span style="display:inline-block;background:${ratingColor};color:#ffffff;font-size:14px;font-weight:700;padding:4px 16px;border-radius:20px;">${ratingLabel}</span>
          </td></tr>
          <tr><td style="padding:16px 24px;border-bottom:1px solid #e2e8f0;">
            <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 4px 0;">Customer</p>
            <p style="color:#111827;font-size:15px;font-weight:600;margin:0;">${params.customerName || 'Unknown'}</p>
            ${params.customerEmail ? `<p style="color:#6b7280;font-size:13px;margin:2px 0 0 0;">${params.customerEmail}</p>` : ''}
          </td></tr>
          ${params.salesRepName ? `<tr><td style="padding:16px 24px;border-bottom:1px solid #e2e8f0;">
            <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 4px 0;">Sales Rep</p>
            <p style="color:#111827;font-size:15px;margin:0;">${params.salesRepName}</p>
          </td></tr>` : ''}
          ${params.leadTechName ? `<tr><td style="padding:16px 24px;border-bottom:1px solid #e2e8f0;">
            <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 4px 0;">Lead Tech</p>
            <p style="color:#111827;font-size:15px;margin:0;">${params.leadTechName}</p>
          </td></tr>` : ''}
          <tr><td style="padding:16px 24px;">
            <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 4px 0;">Responded</p>
            <p style="color:#111827;font-size:14px;margin:0;">${params.respondedAt}</p>
          </td></tr>
        </table>
        ${params.comment ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-left:4px solid ${ratingColor};border-radius:0 10px 10px 0;margin-bottom:20px;">
          <tr><td style="padding:16px 20px;">
            <p style="color:#92400e;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 8px 0;">Customer Comment</p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0;white-space:pre-wrap;">${params.comment.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </td></tr>
        </table>` : `<p style="color:#9ca3af;font-size:14px;font-style:italic;margin:0 0 20px 0;">No additional comment was provided.</p>`}
        <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">This response was flagged because the customer selected <strong style="color:${ratingColor};">${ratingLabel}</strong>. Please follow up with the customer if appropriate.</p>
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:24px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:#0e7490;font-size:13px;font-weight:700;margin:0 0 4px 0;">${params.companyName}</p>
        <p style="color:#475569;font-size:12px;margin:0;">Internal notification — Customer Satisfaction System</p>
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
    const { token } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: record, error: fetchError } = await supabaseAdmin
      .from('customer_satisfaction')
      .select('*')
      .eq('response_token', token)
      .maybeSingle();

    if (fetchError || !record) {
      return new Response(JSON.stringify({ error: 'Record not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (record.alert_sent) {
      return new Response(
        JSON.stringify({ success: true, message: 'Alert already sent' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const settings = await getCompanySettings(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const alertEmail = settings.company_email || settings.from_email || 'service@electroniclife.com';

    const respondedAt = record.responded_at
      ? new Date(record.responded_at).toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        })
      : 'Unknown';

    const emailHtml = buildAlertEmail({
      companyName: settings.company_name,
      companyLogoUrl: settings.company_logo_url || '',
      customerName: record.customer_name || '',
      customerEmail: record.customer_email || '',
      rating: record.rating || '',
      comment: record.comment || '',
      salesRepName: record.sales_rep_name || '',
      leadTechName: record.lead_tech_name || '',
      respondedAt,
    });

    const ratingLabels: Record<string, string> = {
      excellent: 'Excellent',
      good: 'Good',
      okay: 'Okay',
      needs_attention: 'Needs Attention',
    };
    const ratingLabel = ratingLabels[record.rating] || record.rating;
    const subject = `Customer Feedback: ${ratingLabel} — ${record.customer_name || record.customer_email}`;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.log('Demo mode: satisfaction alert would be sent to', alertEmail);
    } else {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: settings.from_address,
          to: alertEmail,
          subject,
          html: emailHtml,
        }),
      });

      if (!emailResponse.ok) {
        const errText = await emailResponse.text();
        console.error('Resend alert error:', errText);
      }
    }

    await supabaseAdmin
      .from('customer_satisfaction')
      .update({ alert_sent: true })
      .eq('id', record.id);

    return new Response(
      JSON.stringify({ success: true, message: 'Alert sent' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending satisfaction alert:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
