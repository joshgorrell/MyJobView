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
    const {
      threadId,
      messageBody,
      contextLabel,
      proposalNumber,
      proposalTitle,
      proposalId,
      customerName,
      repEmail,
      repName,
      authorName,
      proposalUrl: payloadProposalUrl,
    } = await req.json();

    if (!repEmail) {
      return new Response(
        JSON.stringify({ success: true, message: 'No rep email — skipping' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('company_name, from_email, from_name, reply_to_email, portal_url')
      .maybeSingle();

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ success: true, message: 'No RESEND_API_KEY — skipping email' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fromEmail = settings?.from_email;
    if (!fromEmail) {
      return new Response(
        JSON.stringify({ success: true, message: 'No from_email configured — skipping' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fromName = settings?.from_name || settings?.company_name || 'Your Company';
    const replyTo = settings?.reply_to_email || fromEmail;
    const portalUrl = settings?.portal_url || `${Deno.env.get('SUPABASE_URL')}/portal`;
    const proposalUrl = payloadProposalUrl || `${portalUrl}/proposals/${proposalId}`;

    const subject = `New question on Proposal ${proposalNumber || ''}`;
    const contextLine = contextLabel ? `<p><strong>Re: ${contextLabel}</strong></p>` : '';
    const emailBody = `<p>Hi ${repName || 'Sales Rep'},</p>
<p><strong>${customerName || authorName || 'A customer'}</strong> just asked a question on proposal <strong>${proposalNumber || ''}</strong>${proposalTitle ? ` — ${proposalTitle}` : ''}.</p>
${contextLine}
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#1e293b;font-size:14px;line-height:1.6;">${(messageBody || '').substring(0, 500)}</p>
</div>
<p><a href="${proposalUrl}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">View & Reply</a></p>
<p style="color:#64748b;font-size:12px;margin-top:24px;">You're receiving this because you're the assigned sales rep for this proposal.</p>`;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: repEmail,
        reply_to: replyTo,
        subject,
        html: emailBody,
        text: `Hi ${repName || 'Sales Rep'},\n\n${customerName || authorName || 'A customer'} just asked a question on proposal ${proposalNumber || ''}${proposalTitle ? ` — ${proposalTitle}` : ''}.\n\n${(messageBody || '').substring(0, 500)}\n\nView & Reply: ${proposalUrl}`,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Resend API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Question email sent' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-proposal-question-email:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
