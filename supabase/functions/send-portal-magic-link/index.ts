import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  email: string;
  redirectTo?: string;
}

function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

type AccessContext = {
  type: 'test_and_tune' | 'vip_membership' | 'subscription' | 'security_contract' | 'general';
  destinationPath: string;
  emailSubjectSuffix: string;
  emailHeadline: string;
  emailBodyLine: string;
  buttonText: string;
  accessGrantId?: string;
};

function detectAccessContext(
  accessGrant: { id: string; access_type: string; expiration_date: string | null } | null,
  subscription: { id: string; status: string } | null,
  securityContract: { id: string; status: string } | null,
): AccessContext {
  if (accessGrant?.access_type === 'test_and_tune') {
    return {
      type: 'test_and_tune',
      destinationPath: '/portal/punchlist',
      emailSubjectSuffix: '90-Day Test & Tune Portal',
      emailHeadline: 'Your 90-Day Test & Tune Portal',
      emailBodyLine: 'Use the button below to access your personalized Test & Tune punchlist and track your service requests.',
      buttonText: 'Open My Test & Tune Punchlist',
      accessGrantId: accessGrant.id,
    };
  }

  if (accessGrant?.access_type === 'vip_membership') {
    return {
      type: 'vip_membership',
      destinationPath: '/portal/punchlist',
      emailSubjectSuffix: 'VIP Member Portal',
      emailHeadline: 'Your VIP Member Portal',
      emailBodyLine: 'As a VIP member, use the button below to access your punchlist and full portal.',
      buttonText: 'Open My VIP Punchlist',
      accessGrantId: accessGrant.id,
    };
  }

  if (subscription) {
    return {
      type: 'subscription',
      destinationPath: '/portal',
      emailSubjectSuffix: 'Customer Portal',
      emailHeadline: 'Your Customer Portal',
      emailBodyLine: 'Use the button below to securely log in to your customer portal.',
      buttonText: 'Log In to Portal',
    };
  }

  if (securityContract) {
    return {
      type: 'security_contract',
      destinationPath: '/portal',
      emailSubjectSuffix: 'Customer Portal',
      emailHeadline: 'Your Customer Portal',
      emailBodyLine: 'Use the button below to securely log in to your customer portal.',
      buttonText: 'Log In to Portal',
    };
  }

  return {
    type: 'general',
    destinationPath: '/portal',
    emailSubjectSuffix: 'Customer Portal',
    emailHeadline: 'Your Customer Portal',
    emailBodyLine: 'Use the button below to securely log in to your customer portal.',
    buttonText: 'Log In to Portal',
  };
}

function buildEmailHtml(opts: {
  firstName: string;
  companyName: string;
  context: AccessContext;
  portalLink: string;
  daysLabel: string;
}): string {
  const { firstName, companyName, context, portalLink, daysLabel } = opts;

  const accentColor = context.type === 'test_and_tune'
    ? '#0f766e'
    : context.type === 'vip_membership'
    ? '#b45309'
    : '#2563eb';

  const badgeHtml = context.type === 'test_and_tune'
    ? `<div style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px;margin-bottom:20px;letter-spacing:0.05em;">90-DAY TEST &amp; TUNE</div>`
    : context.type === 'vip_membership'
    ? `<div style="display:inline-block;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px;margin-bottom:20px;letter-spacing:0.05em;">&#9733; VIP MEMBER</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="background:#0f2347;border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
          <p style="margin:0 0 4px;color:#93c5fd;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">${companyName}</p>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${context.emailHeadline}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:36px 40px;border-radius:0 0 12px 12px;">
          ${badgeHtml}
          <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hello ${firstName || 'there'},</p>
          <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">${context.emailBodyLine}</p>

          <div style="text-align:center;margin:32px 0;">
            <a href="${portalLink}"
               style="display:inline-block;background:${accentColor};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.01em;">
              ${context.buttonText}
            </a>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-top:8px;">
            <p style="margin:0 0 6px;color:#374151;font-size:13px;font-weight:600;">About this link</p>
            <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
              This link is valid for <strong>${daysLabel}</strong> and can be used multiple times &mdash; save this email for easy access anytime.<br>
              If you request a new login link, this one will be replaced.
            </p>
          </div>

          <p style="margin:28px 0 0;color:#94a3b8;font-size:12px;text-align:center;">
            If you didn&rsquo;t request this link, you can safely ignore this email.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 0;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email, redirectTo: requestedRedirect }: RequestBody = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, portal_access_enabled, portal_user_id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (contactError) {
      console.error('Error fetching contact:', contactError);
      return new Response(
        JSON.stringify({ error: 'An error occurred. Please try again.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!contact) {
      return new Response(
        JSON.stringify({
          error: 'No customer account found with this email address. Click here to sign up now!',
          isNewCustomer: true
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!contact.portal_access_enabled) {
      return new Response(
        JSON.stringify({ error: 'Portal access is not enabled for your account. Please contact support.' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch all access sources in parallel
    const [subscriptionResult, accessGrantResult, securityContractResult] = await Promise.all([
      supabaseAdmin
        .from('recurring_subscriptions')
        .select('id, status')
        .eq('contact_id', contact.id)
        .in('status', ['active', 'trial', 'pending_payment'])
        .maybeSingle(),

      // Check for active punchlist grants — both test_and_tune (has expiration) and vip_membership (no expiration)
      supabaseAdmin
        .from('punchlist_access_grants')
        .select('id, access_type, expiration_date')
        .eq('contact_id', contact.id)
        .eq('status', 'active')
        .or(`expiration_date.is.null,expiration_date.gte.${new Date().toISOString().split('T')[0]}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabaseAdmin
        .from('security_contracts')
        .select('id, status')
        .eq('contact_id', contact.id)
        .eq('status', 'active')
        .maybeSingle(),
    ]);

    const subscription = subscriptionResult.data;
    const accessGrant = accessGrantResult.data;
    const securityContract = securityContractResult.data;

    if (!subscription && !accessGrant && !securityContract) {
      return new Response(
        JSON.stringify({
          error: 'You have not completed your VIP membership signup. Please complete your registration to access the portal.',
          incompleteSignup: true
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Determine the access context — this drives the email content and redirect destination
    const context = detectAccessContext(accessGrant, subscription, securityContract);

    // Invalidate any existing active tokens for this contact
    await supabaseAdmin
      .from('portal_access_tokens')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('contact_id', contact.id)
      .is('invalidated_at', null);

    // Generate a new 30-day token
    const token = generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error: insertError } = await supabaseAdmin
      .from('portal_access_tokens')
      .insert({
        token,
        contact_id: contact.id,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Error inserting token:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate login link.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Build the portal link — caller-supplied redirect takes priority, then auto-detected destination
    const { data: settingsForUrl } = await supabaseAdmin
      .from('company_settings')
      .select('portal_url, from_email, from_name, company_name')
      .maybeSingle();

    const frontendUrl = settingsForUrl?.portal_url || Deno.env.get('FRONTEND_URL') || '';

    // Use caller-supplied redirect if provided, otherwise route based on detected access context
    const destinationPath = requestedRedirect || context.destinationPath;

    // Build the full portal URL: base + /portal + redirect query param (if destination != /portal)
    // The portal login page sits at /portal and reads the ?redirect= param after verifying the token.
    let portalLink: string;
    if (destinationPath === '/portal' || destinationPath === `${frontendUrl}/portal`) {
      portalLink = `${frontendUrl}/portal?portal_token=${token}`;
    } else {
      // Encode the destination as a redirect param so PortalLogin can forward the customer there
      const cleanDestination = destinationPath.startsWith('http')
        ? new URL(destinationPath).pathname
        : destinationPath;
      portalLink = `${frontendUrl}/portal?redirect=${encodeURIComponent(cleanDestination)}&portal_token=${token}`;
    }

    const fromEmail = settingsForUrl?.from_email || 'noreply@yourdomain.com';
    const fromName = settingsForUrl?.from_name || settingsForUrl?.company_name || 'Portal';
    const companyName = settingsForUrl?.company_name || 'Portal';

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (RESEND_API_KEY) {
      const htmlBody = buildEmailHtml({
        firstName: contact.first_name || '',
        companyName,
        context,
        portalLink,
        daysLabel: '30 days',
      });

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [email.toLowerCase()],
          subject: `${companyName} - ${context.emailSubjectSuffix} Login Link`,
          html: htmlBody,
        }),
      });

      const emailData = await emailResponse.json();

      if (!emailResponse.ok) {
        console.error('Resend API error:', emailData);
        return new Response(
          JSON.stringify({ error: 'Failed to send login email. Please contact support.' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Login link sent to your email',
          emailId: emailData.id,
          accessType: context.type,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      console.log('Login link generated but email service not configured:', portalLink);
      return new Response(
        JSON.stringify({
          error: 'Email service not configured. Please contact support.',
          devNote: 'RESEND_API_KEY environment variable not set'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
