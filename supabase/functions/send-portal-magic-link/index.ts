import { sendSystemEmail } from '../_shared/system-email.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  email: string;
  redirectTo?: string;
  organizationId?: string;
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

const portalContext: AccessContext = {
  type: 'general',
  destinationPath: '/portal',
  emailSubjectSuffix: 'Customer Portal',
  emailHeadline: 'Your Customer Portal',
  emailBodyLine: 'Use the button below to securely log in to your customer portal.',
  buttonText: 'Log In to Portal',
};

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
              You can request another link from the customer portal login page anytime.
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

  let pendingToken: string | null = null;
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { email: rawEmail, redirectTo: requestedRedirect, organizationId }: RequestBody = await req.json();
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Enter a valid email address.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Resolve the customer within the selected dealer, or require a unique match
    // on the main MJV site. Never choose an arbitrary customer/company.
    const escapedEmail = email.replace(/[\\%_]/g, character => `\\${character}`);
    let contactQuery = supabaseAdmin.from('contacts')
      .select('id, email, contact_name, full_name, company_name, first_name, last_name, portal_access_enabled, organization_id')
      .ilike('email', escapedEmail);
    if (organizationId) contactQuery = contactQuery.eq('organization_id', organizationId);
    const { data: contacts, error: contactError } = await contactQuery.limit(2);
    if (contactError) throw contactError;
    if (contacts && contacts.length > 1) {
      return new Response(JSON.stringify({ success: false, error: 'Please use your service provider’s portal link or contact them for assistance.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const contact = contacts?.[0];
    if (!contact?.portal_access_enabled) {
      return new Response(JSON.stringify({ success: false, error: 'We couldn’t find portal access for this email. Please contact us for assistance.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Portal login is independent of paid VIP/Punchlist eligibility.
    const context = portalContext;
    const { data: recentTokens, error: recentError } = await supabaseAdmin
      .from('portal_access_tokens').select('id').eq('contact_id', contact.id)
      .is('invalidated_at', null).gte('created_at', new Date(Date.now() - 60_000).toISOString()).limit(1);
    if (recentError) throw recentError;
    if (recentTokens?.length) {
      return new Response(JSON.stringify({ success: false, error: 'A link was requested recently. Please check your inbox and spam folder, or try again in one minute.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } });
    }

    // Generate a new 30-day token
    const token = generateSecureToken();
    pendingToken = token;
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

    // Resolve branding and destination from this customer's organization.
    const { data: settingsForUrl } = await supabaseAdmin
      .from('company_settings')
      .select('portal_url, from_email, from_name, company_name')
      .eq('organization_id', contact.organization_id)
      .maybeSingle();

    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('subdomain')
      .eq('id', contact.organization_id)
      .maybeSingle();

    const subdomain = orgData?.subdomain || null;
    const frontendUrl = subdomain
      ? `https://${subdomain}.myjobview.com`
      : (settingsForUrl?.portal_url || Deno.env.get('FRONTEND_URL') || '').replace(/\/portal\/?$/, '').replace(/\/$/, '');

    // Only allow local portal destinations.
    const destinationPath = typeof requestedRedirect === 'string' && /^\/portal(?:\/|\?|$)/.test(requestedRedirect) && !requestedRedirect.includes('\\')
      ? requestedRedirect : context.destinationPath;

    if (!frontendUrl || !/^https:\/\//.test(frontendUrl)) throw new Error('Portal URL is not configured');

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
        firstName: contact.contact_name || contact.full_name || contact.company_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '',
        companyName,
        context,
        portalLink,
        daysLabel: '30 days',
      });

      const emailResponse = await sendSystemEmail({
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
        await supabaseAdmin.from('portal_access_tokens').update({ invalidated_at: new Date().toISOString() }).eq('token', token);
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
      await supabaseAdmin.from('portal_access_tokens').update({ invalidated_at: new Date().toISOString() }).eq('token', token);
      console.error('Portal email service not configured');
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
    if (pendingToken) {
      await supabaseAdmin.from('portal_access_tokens').update({ invalidated_at: new Date().toISOString() }).eq('token', pendingToken);
    }
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
