import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AttachmentInput {
  filename: string;
  // base64-encoded content (HTML or binary)
  content: string;
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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const body = await req.json();
    const {
      proposalId,
      toEmail,
      ccEmails,
      subject: customSubject,
      message: customMessage,
      // Array of { filename, content } where content is base64-encoded HTML
      attachments = [] as AttachmentInput[],
      // Which document types were included — for audit tracking
      sentAttachments = {} as Record<string, boolean>,
    } = body;

    if (!proposalId) {
      return new Response(JSON.stringify({ error: 'Proposal ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: proposal, error: proposalError } = await supabaseClient
      .from('proposals')
      .select(`
        *,
        contacts:contact_id (
          contact_name,
          first_name,
          last_name,
          email
        )
      `)
      .eq('id', proposalId)
      .maybeSingle();

    if (proposalError || !proposal) {
      return new Response(JSON.stringify({ error: 'Proposal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settings } = await supabaseClient
      .from('company_settings')
      .select('company_name, company_email, company_phone, from_email, from_name, reply_to_email, portal_url')
      .maybeSingle();

    // Use override email if provided, otherwise fall back to contact email
    const recipientEmail = toEmail || proposal.contacts?.email;
    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'Customer email not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const customerName = proposal.contacts?.contact_name ||
      `${proposal.contacts?.first_name || ''} ${proposal.contacts?.last_name || ''}`.trim() ||
      'Valued Customer';

    const portalUrl = settings?.portal_url || `${Deno.env.get('SUPABASE_URL')}/portal`;
    const proposalUrl = `${portalUrl}/proposals/${proposal.id}`;

    const { data: emailTemplate } = await supabaseClient
      .from('email_templates')
      .select('subject, body')
      .eq('template_type', 'proposal_sent')
      .eq('is_active', true)
      .maybeSingle();

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', proposal.created_by)
      .maybeSingle();

    const companyName = settings?.company_name || 'Your Company';
    const placeholders: Record<string, string> = {
      customer_name: customerName,
      proposal_number: proposal.proposal_number,
      project_name: proposal.title || 'Your Project',
      proposal_total: `$${Number(proposal.total).toFixed(2)}`,
      portal_link: proposalUrl,
      sales_rep_name: profile?.full_name || 'Sales Team',
      sales_rep_email: profile?.email || settings?.company_email || '',
      sales_rep_phone: profile?.phone || settings?.company_phone || '',
      company_name: companyName,
    };

    let subject = customSubject ||
      emailTemplate?.subject ||
      `New Proposal from ${companyName} - ${proposal.proposal_number}`;
    let emailBody = customMessage ||
      emailTemplate?.body ||
      `Hi ${customerName},\n\nPlease review your proposal: ${proposalUrl}`;

    for (const [key, value] of Object.entries(placeholders)) {
      const placeholder = `{{${key}}}`;
      subject = subject.split(placeholder).join(value);
      emailBody = emailBody.split(placeholder).join(value);
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({
          error: 'Email configuration missing. Please configure RESEND_API_KEY in Supabase Edge Functions secrets.',
          details: 'Go to Supabase Dashboard → Edge Functions → Settings → Secrets to add RESEND_API_KEY',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fromEmail = settings?.from_email || settings?.company_email;
    if (!fromEmail) {
      return new Response(
        JSON.stringify({
          error: 'Email configuration incomplete. No "from" email address configured.',
          details: 'Please configure the "From Email" in Company Settings → Email Settings (Resend)',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fromName = settings?.from_name || settings?.company_name || 'Your Company';
    const fromField = `${fromName} <${fromEmail}>`;
    const replyTo = settings?.reply_to_email || fromEmail;

    // Build Resend payload
    const resendPayload: Record<string, unknown> = {
      from: fromField,
      to: recipientEmail,
      reply_to: replyTo,
      subject,
      text: emailBody,
    };

    // Add CC recipients if provided
    if (Array.isArray(ccEmails) && ccEmails.length > 0) {
      resendPayload.cc = ccEmails;
    }

    // Add attachments if any (Resend accepts { filename, content } where content is base64)
    if (attachments.length > 0) {
      resendPayload.attachments = attachments.map((a: AttachmentInput) => ({
        filename: a.filename,
        content: a.content,
      }));
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Resend API error:', errorText);

      let errorMessage = 'Failed to send email via Resend API';
      let errorDetails = errorText;

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) errorMessage = errorJson.message;
        if (errorJson.name === 'validation_error') {
          errorDetails = 'Please verify your email configuration in Company Settings → Email Settings';
        }
      } catch (_) {
        // not JSON
      }

      return new Response(
        JSON.stringify({ error: errorMessage, details: errorDetails, status: emailResponse.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const updatePayload: Record<string, unknown> = {
      status: 'sent',
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      last_emailed_at: now.toISOString(),
    };

    // Record which attachments were sent
    if (Object.keys(sentAttachments).length > 0) {
      updatePayload.sent_attachments = sentAttachments;
    }

    const { error: updateError } = await supabaseAdmin
      .from('proposals')
      .update(updatePayload)
      .eq('id', proposalId);

    if (updateError) {
      console.error('Error updating proposal status:', updateError);
      throw new Error('Failed to update proposal status: ' + updateError.message);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Proposal sent and status updated' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Email error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
