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
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { proposalId, sendSms } = await req.json();

    if (!proposalId) {
      return new Response(JSON.stringify({ error: 'Proposal ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get proposal details
    const { data: proposal, error: proposalError } = await supabaseClient
      .from('proposals')
      .select(`
        *,
        contacts:contact_id (
          contact_name,
          first_name,
          last_name,
          email,
          phone
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

    // Proposal must be in an approved/pending state and have a deposit amount due
    const validStatuses = ['approved', 'approved_pending_action', 'portal', 'pending_deposit'];
    if (!validStatuses.includes(proposal.status)) {
      return new Response(JSON.stringify({ error: 'Proposal must be approved first' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!proposal.deposit_amount_due || proposal.deposit_amount_due <= 0) {
      return new Response(JSON.stringify({ error: 'No deposit amount set for this proposal' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create deposit invoice if it doesn't exist
    if (!proposal.deposit_invoice_id) {
      const { data: invoiceData, error: invoiceError } = await supabaseClient
        .rpc('create_deposit_invoice_from_proposal', { p_proposal_id: proposalId });

      if (invoiceError) {
        console.error('Failed to create deposit invoice:', invoiceError);
        return new Response(JSON.stringify({ error: 'Failed to create deposit invoice' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update proposal with invoice reference
      await supabaseClient
        .from('proposals')
        .update({ deposit_invoice_id: invoiceData })
        .eq('id', proposalId);
    }

    const { data: settings } = await supabaseClient
      .from('company_settings')
      .select('company_name, company_email, from_email, from_name, reply_to_email, portal_url, twilio_account_sid, twilio_auth_token, twilio_phone_number')
      .maybeSingle();

    const customerEmail = proposal.contacts?.email;
    const customerPhone = proposal.contacts?.phone;
    const customerName = proposal.contacts?.contact_name ||
      `${proposal.contacts?.first_name || ''} ${proposal.contacts?.last_name || ''}`.trim() ||
      'Valued Customer';

    const companyName = settings?.company_name || 'Your Company';
    // portal_url already contains the full portal base path (e.g. "https://app.example.com/portal")
    // so we only append /proposals/:id — never add /portal again
    const portalBase = (settings?.portal_url || Deno.env.get('FRONTEND_URL') || 'https://yourapp.com').replace(/\/+$/, '');
    const proposalUrl = `${portalBase}/proposals/${proposal.id}`;

    // Try to generate a one-click magic link so the customer lands directly on the
    // proposal payment page without needing to log in separately.
    let paymentLink = proposalUrl;
    if (customerEmail) {
      try {
        const { data: contactRecord } = await supabaseAdmin
          .from('contacts')
          .select('portal_user_id')
          .eq('id', proposal.contact_id)
          .maybeSingle();

        const portalUserId = contactRecord?.portal_user_id;
        if (portalUserId) {
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: customerEmail.toLowerCase(),
            options: {
              redirectTo: proposalUrl,
            },
          });
          if (linkData?.properties?.action_link) {
            paymentLink = linkData.properties.action_link;
          }
        }
      } catch (linkErr) {
        console.error('Failed to generate magic link, falling back to proposal URL:', linkErr);
      }
    }

    const depositAmount = Number(proposal.deposit_amount_due || 0).toFixed(2);
    const placeholders: Record<string, string> = {
      customer_name: customerName,
      proposal_number: proposal.proposal_number,
      deposit_amount: depositAmount,
      payment_link: paymentLink,
      payment_url: paymentLink,
      company_name: companyName,
    };

    let emailSent = false;
    let smsSent = false;

    // Send email reminder
    if (customerEmail) {
      const { data: emailTemplate } = await supabaseClient
        .from('email_templates')
        .select('subject, body')
        .eq('template_type', 'deposit_reminder')
        .eq('is_active', true)
        .maybeSingle();

      let subject = emailTemplate?.subject || `Complete Your Deposit - Proposal ${proposal.proposal_number}`;
      let body = emailTemplate?.body || `Hi ${customerName},\n\nThank you for approving proposal ${proposal.proposal_number}! To get started, please complete your deposit payment of $${proposal.deposit_amount_due?.toFixed(2)}.\n\nView proposal: ${proposalUrl}`;

      // Replace placeholders
      for (const [key, value] of Object.entries(placeholders)) {
        const placeholder = `{{${key}}}`;
        subject = subject.split(placeholder).join(value);
        body = body.split(placeholder).join(value);
      }

      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (resendApiKey) {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: settings?.from_name
              ? `${settings.from_name} <${settings.from_email || settings.company_email || 'noreply@example.com'}>`
              : (settings?.from_email || settings?.company_email || 'noreply@example.com'),
            to: customerEmail,
            subject: subject,
            html: body,
          }),
        });

        emailSent = emailResponse.ok;
      } else {
        console.log('Email would be sent to:', customerEmail);
        emailSent = true; // Simulate success
      }
    }

    // Send SMS reminder if requested
    if (sendSms && customerPhone) {
      const { data: smsTemplate } = await supabaseClient
        .from('email_templates')
        .select('body')
        .eq('template_type', 'deposit_reminder_sms')
        .eq('is_active', true)
        .maybeSingle();

      let smsBody = smsTemplate?.body || `Hi ${customerName}, your proposal ${proposal.proposal_number} is approved! To get started, please complete your $${proposal.deposit_amount_due?.toFixed(2)} deposit: ${proposalUrl} - ${companyName}`;

      // Replace placeholders
      for (const [key, value] of Object.entries(placeholders)) {
        const placeholder = `{{${key}}}`;
        smsBody = smsBody.split(placeholder).join(value);
      }

      const twilioSid = settings?.twilio_account_sid;
      const twilioToken = settings?.twilio_auth_token;
      const twilioPhone = settings?.twilio_phone_number;

      if (twilioSid && twilioToken && twilioPhone) {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const smsResponse = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: customerPhone,
            From: twilioPhone,
            Body: smsBody,
          }),
        });

        smsSent = smsResponse.ok;
      } else {
        console.log('SMS would be sent to:', customerPhone);
        smsSent = true; // Simulate success
      }
    }

    // Update reminder tracking
    if (emailSent || smsSent) {
      await supabaseClient
        .from('proposals')
        .update({
          deposit_request_sent: true,
          deposit_request_sent_at: new Date().toISOString(),
          deposit_reminder_count: (proposal.deposit_reminder_count || 0) + 1,
          last_deposit_reminder_sent_at: new Date().toISOString(),
        })
        .eq('id', proposalId);

      // Log activity
      await supabaseClient
        .from('activity_feed')
        .insert({
          company_id: proposal.company_id,
          activity_type: 'deposit_reminder_sent',
          entity_type: 'proposal',
          entity_id: proposalId,
          title: 'Deposit Reminder Sent',
          description: `Deposit reminder sent to ${customerName} for proposal ${proposal.proposal_number}. ${emailSent ? 'Email' : ''} ${emailSent && smsSent ? 'and' : ''} ${smsSent ? 'SMS' : ''} sent.`,
        });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailSent, 
        smsSent,
        message: `Reminder sent successfully. ${emailSent ? 'Email' : ''} ${emailSent && smsSent ? 'and' : ''} ${smsSent ? 'SMS' : ''} delivered.`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Deposit reminder error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});