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

    // Use service role for reads that span multiple profiles
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { sessionId, direction } = await req.json();

    if (!sessionId || !direction) {
      return new Response(JSON.stringify({ error: 'sessionId and direction are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the session with tech profile
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('internal_time_sessions')
      .select(`
        id,
        session_type,
        title,
        request_reason,
        predetermined_hours,
        status,
        denial_reason,
        session_date,
        assigned_to,
        approved_by,
        tech:profiles!internal_time_sessions_assigned_to_fkey (
          id, full_name, email
        )
      `)
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch company settings for email config and approver list
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('company_name, from_email, from_name, app_url, time_request_approver_ids')
      .maybeSingle();

    const fromEmail = settings?.from_email || 'noreply@example.com';
    const fromName = settings?.from_name || settings?.company_name || 'Team';
    const appUrl = settings?.app_url || '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    const sessionTypeLabel = session.session_type === 'shop_time'
      ? 'Shop Time'
      : session.session_type === 'training'
      ? 'Training Time'
      : (session.session_type ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

    const hours = session.predetermined_hours ?? 0;
    const techName = (session.tech as any)?.full_name || (session.tech as any)?.email || 'A technician';
    const dispatchLink = appUrl ? `${appUrl}/dispatch` : '';

    if (direction === 'to_approvers') {
      // Fetch approver profiles
      const approverIds: string[] = settings?.time_request_approver_ids ?? [];
      if (approverIds.length === 0) {
        return new Response(JSON.stringify({ sent: 0, message: 'No approvers configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: approvers } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', approverIds);

      if (!approvers || approvers.length === 0) {
        return new Response(JSON.stringify({ sent: 0, message: 'No approver profiles found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const subject = `${techName} requested ${sessionTypeLabel}`;
      const reasonLine = session.request_reason
        ? `<p style="margin:0 0 8px;"><strong>Reason:</strong> ${session.request_reason}</p>`
        : '';
      const actionButton = dispatchLink
        ? `<p style="margin:16px 0 0;"><a href="${dispatchLink}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Review Request</a></p>`
        : '';

      const htmlBody = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 16px;color:#111;">${subject}</h2>
          <p style="margin:0 0 8px;"><strong>Type:</strong> ${sessionTypeLabel}</p>
          <p style="margin:0 0 8px;"><strong>Duration:</strong> ${hours} hour${hours !== 1 ? 's' : ''}</p>
          <p style="margin:0 0 8px;"><strong>Date:</strong> ${session.session_date ?? 'Today'}</p>
          ${reasonLine}
          ${actionButton}
          <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">
            Log in to approve or decline this request.
          </p>
        </div>`;

      let sentCount = 0;
      for (const approver of approvers) {
        if (!approver.email) continue;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: [approver.email],
            subject,
            html: htmlBody,
          }),
        });
        sentCount++;
      }

      return new Response(JSON.stringify({ sent: sentCount }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (direction === 'to_tech') {
      const techEmail = (session.tech as any)?.email;
      if (!techEmail) {
        return new Response(JSON.stringify({ sent: 0, message: 'Tech has no email' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch approver name
      let approverName = 'A manager';
      if (session.approved_by) {
        const { data: approver } = await supabaseAdmin
          .from('profiles')
          .select('full_name, email')
          .eq('id', session.approved_by)
          .maybeSingle();
        approverName = approver?.full_name || approver?.email || 'A manager';
      }

      const isApproved = session.status === 'scheduled';
      const subject = isApproved
        ? `Your ${sessionTypeLabel} request was approved`
        : `Your ${sessionTypeLabel} request was declined`;

      const denialLine = !isApproved && session.denial_reason
        ? `<p style="margin:0 0 8px;"><strong>Reason:</strong> ${session.denial_reason}</p>`
        : '';

      const outcomeColor = isApproved ? '#16a34a' : '#dc2626';
      const outcomeLabel = isApproved ? 'Approved' : 'Declined';

      const htmlBody = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 16px;color:${outcomeColor};">${outcomeLabel}: ${sessionTypeLabel} Request</h2>
          <p style="margin:0 0 8px;"><strong>Reviewed by:</strong> ${approverName}</p>
          <p style="margin:0 0 8px;"><strong>Type:</strong> ${sessionTypeLabel}</p>
          <p style="margin:0 0 8px;"><strong>Duration:</strong> ${hours} hour${hours !== 1 ? 's' : ''}</p>
          ${denialLine}
          ${isApproved
            ? `<p style="margin:16px 0 0;color:#374151;">Your session has been scheduled. It will appear in your time clock when the date arrives.</p>`
            : `<p style="margin:16px 0 0;color:#374151;">If you have questions, please reach out to your manager.</p>`
          }
        </div>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [techEmail],
          subject,
          html: htmlBody,
        }),
      });

      return new Response(JSON.stringify({ sent: 1 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid direction' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('send-time-request-notification error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
