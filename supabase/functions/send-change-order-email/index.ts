import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { changeOrderId, toEmail, ccEmails, subject, message } = await req.json();

    if (!changeOrderId || !toEmail) {
      return new Response(JSON.stringify({ error: 'changeOrderId and toEmail are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: co, error: coError } = await supabaseClient
      .from('change_orders')
      .select(`
        *,
        sales_order:sales_orders(
          order_number,
          contact:contacts(full_name, email)
        )
      `)
      .eq('id', changeOrderId)
      .single();

    if (coError || !co) {
      return new Response(JSON.stringify({ error: 'Change order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settings } = await serviceClient
      .from('company_settings')
      .select('company_name, company_email, from_email, from_name, reply_to_email')
      .maybeSingle();

    const companyName = settings?.company_name || 'Your Company';
    const fromEmail = settings?.from_email || settings?.company_email || 'noreply@example.com';
    const fromName = settings?.from_name || companyName;

    const changePositive = co.change_amount >= 0;
    const fmt = (n: number) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <div style="background:#1a1a2e;padding:28px 32px;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${companyName}</h1>
        <p style="color:#aaa;margin:8px 0 0;font-size:14px;">Change Order for Your Review</p>
      </div>
      <div style="padding:32px;">
        <p style="color:#333;font-size:15px;line-height:1.6;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>

        <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:24px 0;border-left:4px solid #1a1a2e;">
          <h3 style="margin:0 0 12px;color:#1a1a2e;font-size:16px;">Change Order Summary</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:4px 0;color:#666;">Change Order #</td>
              <td style="padding:4px 0;color:#333;font-weight:600;text-align:right;">${co.change_order_number}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;">Title</td>
              <td style="padding:4px 0;color:#333;text-align:right;">${co.title}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;">Original Contract</td>
              <td style="padding:4px 0;color:#333;text-align:right;">$${fmt(co.original_contract_amount)}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;">Change Amount</td>
              <td style="padding:4px 0;font-weight:600;text-align:right;color:${changePositive ? '#16a34a' : '#dc2626'};">
                ${changePositive ? '+' : ''}$${fmt(co.change_amount)}
              </td>
            </tr>
            ${co.tax_amount > 0 ? `<tr>
              <td style="padding:4px 0;color:#666;">Tax</td>
              <td style="padding:4px 0;color:#333;text-align:right;">+$${fmt(co.tax_amount)}</td>
            </tr>` : ''}
            <tr style="border-top:2px solid #ddd;">
              <td style="padding:8px 0 0;color:#1a1a2e;font-weight:700;font-size:16px;">New Contract Total</td>
              <td style="padding:8px 0 0;color:#1a1a2e;font-weight:700;font-size:16px;text-align:right;">$${fmt(co.new_contract_total)}</td>
            </tr>
          </table>
        </div>

        <p style="color:#666;font-size:13px;margin-top:24px;">
          If you have any questions about this change order, please don't hesitate to contact us.
        </p>
      </div>
      <div style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #eee;">
        <p style="color:#999;font-size:12px;margin:0;">This email was sent by ${companyName}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');

    if (RESEND_API_KEY) {
      const emailPayload: any = {
        from: `${fromName} <${fromEmail}>`,
        to: [toEmail],
        subject: subject || `Change Order ${co.change_order_number} — ${co.title}`,
        html: htmlBody,
      };
      if (ccEmails && ccEmails.length > 0) emailPayload.cc = ccEmails;
      if (settings?.reply_to_email) emailPayload.reply_to = settings.reply_to_email;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(emailPayload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend error: ${err}`);
      }
    } else if (SENDGRID_API_KEY) {
      const personalizations: any[] = [{ to: [{ email: toEmail }] }];
      if (ccEmails && ccEmails.length > 0) personalizations[0].cc = ccEmails.map((e: string) => ({ email: e }));

      const sgPayload = {
        personalizations,
        from: { email: fromEmail, name: fromName },
        subject: subject || `Change Order ${co.change_order_number} — ${co.title}`,
        content: [{ type: 'text/html', value: htmlBody }],
      };

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sgPayload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`SendGrid error: ${err}`);
      }
    } else {
      console.log('No email provider configured — email would have been sent to:', toEmail);
    }

    await serviceClient.from('change_orders').update({
      customer_approval_sent_at: new Date().toISOString(),
      customer_approval_method: 'email',
    }).eq('id', changeOrderId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error sending change order email:', error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to send email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
