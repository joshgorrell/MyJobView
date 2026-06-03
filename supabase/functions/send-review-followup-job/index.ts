import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { getCompanySettings } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function buildFollowUpReviewEmail(params: {
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
  <title>A quick reminder from ${params.companyName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid #f59e0b;">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:26px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">A Quick Reminder</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;">Your feedback still means the world to us</p>
        <div style="margin-top:20px;"><span style="font-size:24px;letter-spacing:3px;color:#f59e0b;">&#9733;&#9733;&#9733;&#9733;&#9733;</span></div>
      </td></tr>
      <tr><td style="background:#ffffff;padding:44px 44px 36px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 20px 0;">Hi ${params.customerName || 'there'},</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 18px 0;">We hope everything is going great! We reached out a couple of weeks ago asking for a Google review and wanted to follow up one more time — we know how busy life gets.</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 32px 0;">If you've had a positive experience with <strong style="color:#0e7490;">${params.companyName}</strong>, a brief review makes a huge difference for our team and helps others in your community find quality service they can trust.</p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 32px 0;">
          <a href="${params.reviewUrl}" style="display:inline-block;background:#0e7490;color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:10px;font-size:17px;font-weight:700;letter-spacing:0.01em;">Leave Us a Google Review</a>
        </td></tr></table>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9c3;border-radius:10px;border:1px solid #fde68a;"><tr><td style="padding:18px 22px;">
          <p style="color:#92400e;font-size:13px;margin:0 0 5px 0;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Takes less than 2 minutes</p>
          <p style="color:#78350f;font-size:14px;margin:0;line-height:1.6;">This is our final follow-up — we promise! Just a sentence or two is all it takes.</p>
        </td></tr></table>
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:#f59e0b;font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${params.companyName}</p>
        ${params.companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${params.companyEmail}</p>` : ''}
        ${params.offices && params.offices.length > 0 ? `<p style="color:#94a3b8;font-size:12px;margin:6px 0 0 0;line-height:1.8;">${params.offices.map(o => `${o.office_name}: ${o.phone}`).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</p>` : ''}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this because you recently worked with us.<br>Thank you for your business.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function buildFollowUpSatisfactionEmail(params: {
  customerName: string;
  companyName: string;
  companyEmail: string;
  companyLogoUrl?: string;
  offices?: { office_name: string; phone: string }[];
  feedbackBaseUrl: string;
  responseToken: string;
}): string {
  const logoBlock = params.companyLogoUrl
    ? `<img src="${params.companyLogoUrl}" alt="${params.companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${params.companyName}</span>`;

  const makeRatingUrl = (rating: string) =>
    `${params.feedbackBaseUrl}/feedback?rating=${rating}&token=${params.responseToken}`;

  const ratings = [
    { key: 'excellent', label: 'Excellent', emoji: '&#128079;', bg: '#16a34a', desc: 'Everything was great' },
    { key: 'good', label: 'Good', emoji: '&#128077;', bg: '#2563eb', desc: 'Happy with the results' },
    { key: 'okay', label: 'Okay', emoji: '&#128528;', bg: '#d97706', desc: 'Some things could improve' },
    { key: 'needs_attention', label: 'Needs Attention', emoji: '&#128533;', bg: '#dc2626', desc: 'There was a problem' },
  ];

  const makeButton = (r: typeof ratings[0]) => `
    <td align="center" style="padding:6px;">
      <a href="${makeRatingUrl(r.key)}" style="display:block;text-decoration:none;width:120px;height:130px;border-radius:12px;overflow:hidden;background:${r.bg};">
        <table cellpadding="0" cellspacing="0" width="120" style="width:120px;height:130px;border-radius:12px;background:${r.bg};">
          <tr><td align="center" width="120" height="54" style="padding:14px 8px 4px;vertical-align:bottom;">
            <span style="font-size:28px;line-height:28px;display:block;height:28px;">${r.emoji}</span>
          </td></tr>
          <tr><td align="center" width="120" height="32" style="padding:4px 6px 0;vertical-align:middle;">
            <span style="color:#ffffff;font-size:11px;font-weight:700;display:block;line-height:14px;">${r.label}</span>
          </td></tr>
          <tr><td align="center" width="120" height="44" style="padding:2px 6px 14px;vertical-align:top;">
            <span style="color:rgba(255,255,255,0.8);font-size:10px;line-height:13px;display:block;">${r.desc}</span>
          </td></tr>
        </table>
      </a>
    </td>`;

  const [r0, r1, r2, r3] = ratings;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Still waiting to hear from you!</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid #0e7490;">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:26px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">Still Waiting to Hear From You!</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;">Your feedback helps us improve</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:44px 44px 36px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 16px 0;">Hi ${params.customerName || 'there'},</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 18px 0;">We sent you a quick satisfaction survey a couple of weeks ago and wanted to follow up. We'd truly love to hear how your experience with <strong style="color:#0e7490;">${params.companyName}</strong> went — it takes less than 60 seconds!</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 32px 0;">Tap the button below that best describes your experience:</p>
        <table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 24px auto;">
          <tr>
            ${makeButton(r0)}
            ${makeButton(r1)}
          </tr>
          <tr>
            ${makeButton(r2)}
            ${makeButton(r3)}
          </tr>
        </table>
        <p style="color:#9ca3af;font-size:13px;text-align:center;margin:0;line-height:1.6;">This is our final follow-up. Your feedback goes directly to our team.</p>
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:#0e7490;font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${params.companyName}</p>
        ${params.companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${params.companyEmail}</p>` : ''}
        ${params.offices && params.offices.length > 0 ? `<p style="color:#94a3b8;font-size:12px;margin:6px 0 0 0;line-height:1.8;">${params.offices.map(o => `${o.office_name}: ${o.phone}`).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</p>` : ''}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this because you recently worked with us.<br>Thank you for your business.</p>
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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: allSettings, error: settingsErr } = await supabaseAdmin
      .from('company_settings')
      .select('organization_id, auto_review_followup_enabled, auto_review_followup_days')
      .eq('auto_review_followup_enabled', true);

    if (settingsErr) {
      console.error('Error fetching company settings:', settingsErr);
      return new Response(JSON.stringify({ error: 'Failed to load settings' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!allSettings || allSettings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Automated follow-ups not enabled for any organization', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const sharedSettings = await getCompanySettings(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let totalSent = 0;
    let totalErrors = 0;

    for (const orgSettings of allSettings) {
      const orgId = orgSettings.organization_id;
      const followUpDays = orgSettings.auto_review_followup_days ?? 14;
      const cutoffDate = new Date(Date.now() - followUpDays * 24 * 60 * 60 * 1000).toISOString();

      const { data: reviewRows, error: reviewErr } = await supabaseAdmin
        .from('review_requests')
        .select('id, contact_id, recipient_email, recipient_name, method, contacts:contact_id(contact_name, first_name, email)')
        .eq('organization_id', orgId)
        .eq('review_completed', false)
        .eq('auto_followup_enabled', true)
        .is('follow_up_sent_at', null)
        .in('method', ['email', 'survey'])
        .lte('sent_at', cutoffDate);

      if (reviewErr) {
        console.error('Error fetching review_requests for org', orgId, reviewErr);
        totalErrors++;
        continue;
      }

      for (const row of reviewRows ?? []) {
        try {
          const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
          const recipientEmail = contact?.email || row.recipient_email;
          if (!recipientEmail) continue;

          const customerName = contact?.first_name || contact?.contact_name || row.recipient_name || '';

          const REVIEW_URL = 'https://g.page/r/CZzvVUth7kuyEBM/review';
          const emailHtml = buildFollowUpReviewEmail({
            customerName,
            companyName: sharedSettings.company_name,
            companyEmail: sharedSettings.company_email,
            offices: sharedSettings.offices,
            companyLogoUrl: sharedSettings.company_logo_url,
            reviewUrl: REVIEW_URL,
          });

          const firstName = customerName.split(' ')[0];
          const subject = firstName
            ? `One last ask, ${firstName} — we'd love your review`
            : `One last ask — we'd love your review`;

          if (resendApiKey) {
            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: sharedSettings.from_address,
                to: recipientEmail,
                reply_to: sharedSettings.reply_to_email,
                subject,
                html: emailHtml,
              }),
            });

            if (!emailResponse.ok) {
              const errText = await emailResponse.text();
              console.error('Resend error for review request', row.id, errText);
              totalErrors++;
              continue;
            }
          } else {
            console.log('[demo] Would send follow-up review email to', recipientEmail, 'for record', row.id);
          }

          await supabaseAdmin
            .from('review_requests')
            .update({ follow_up_sent_at: new Date().toISOString() })
            .eq('id', row.id);

          totalSent++;
        } catch (err) {
          console.error('Error processing review request row', row.id, err);
          totalErrors++;
        }
      }

      const { data: satRows, error: satErr } = await supabaseAdmin
        .from('customer_satisfaction')
        .select('id, customer_name, customer_email, response_token')
        .eq('organization_id', orgId)
        .is('rating', null)
        .eq('auto_followup_enabled', true)
        .is('follow_up_sent_at', null)
        .lte('sent_at', cutoffDate);

      if (satErr) {
        console.error('Error fetching customer_satisfaction for org', orgId, satErr);
        totalErrors++;
        continue;
      }

      const appUrl = sharedSettings.app_url || 'https://app.electroniclife.com';

      for (const row of satRows ?? []) {
        try {
          if (!row.customer_email) continue;

          const emailHtml = buildFollowUpSatisfactionEmail({
            customerName: row.customer_name || '',
            companyName: sharedSettings.company_name,
            companyEmail: sharedSettings.company_email,
            companyLogoUrl: sharedSettings.company_logo_url,
            offices: sharedSettings.offices,
            feedbackBaseUrl: appUrl,
            responseToken: row.response_token,
          });

          const firstName = (row.customer_name || '').split(' ')[0];
          const subject = firstName
            ? `Still waiting to hear from you, ${firstName}!`
            : 'Still waiting to hear from you!';

          if (resendApiKey) {
            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: sharedSettings.from_address,
                to: row.customer_email,
                reply_to: sharedSettings.reply_to_email,
                subject,
                html: emailHtml,
              }),
            });

            if (!emailResponse.ok) {
              const errText = await emailResponse.text();
              console.error('Resend error for satisfaction record', row.id, errText);
              totalErrors++;
              continue;
            }
          } else {
            console.log('[demo] Would send follow-up satisfaction email to', row.customer_email, 'for record', row.id);
          }

          await supabaseAdmin
            .from('customer_satisfaction')
            .update({ follow_up_sent_at: new Date().toISOString() })
            .eq('id', row.id);

          totalSent++;
        } catch (err) {
          console.error('Error processing satisfaction row', row.id, err);
          totalErrors++;
        }
      }
    }

    console.log(`Review follow-up job complete: ${totalSent} sent, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, errors: totalErrors }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fatal error in send-review-followup-job:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
