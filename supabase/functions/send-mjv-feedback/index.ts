import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type FeedbackType = 'bug' | 'idea' | 'general';

interface AttachmentPayload {
  filename: string;
  contentType: string;
  content: string;
}

interface FeedbackPayload {
  type: FeedbackType;
  message: string;
  pageUrl?: string;
  browserInfo?: string;
  submittedAt?: string;
  dealerName?: string;
  organizationId?: string | null;
  userName?: string;
  userEmail?: string;
  attachments?: AttachmentPayload[];
}

const TYPE_LABELS: Record<FeedbackType, string> = {
  bug: 'BUG',
  idea: 'IDEA',
  general: 'FEEDBACK',
};

const TYPE_NAMES: Record<FeedbackType, string> = {
  bug: 'Bug / Problem',
  idea: 'Feature / Idea',
  general: 'General Feedback',
};

const MAX_FILES = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
  'text/plain',
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function base64ByteLength(value: string): number {
  const normalized = value.replace(/\s/g, '');
  if (!normalized) return 0;
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function buildEmail(payload: FeedbackPayload): string {
  const submittedAt = payload.submittedAt
    ? new Date(payload.submittedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago',
      })
    : new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });

  const typeName = TYPE_NAMES[payload.type];
  const safeMessage = escapeHtml(payload.message).replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f1f5f9;">
  <tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;">
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:28px 36px;border-bottom:3px solid #2563eb;">
        <div style="color:#ffffff;font-size:24px;font-weight:800;">MyJobView — Tell Us</div>
        <div style="color:#94a3b8;font-size:13px;margin-top:6px;">${escapeHtml(typeName)}</div>
      </td></tr>
      <tr><td style="background:#ffffff;padding:32px 36px;">
        <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;">Message</div>
        <div style="font-size:16px;color:#111827;line-height:1.65;white-space:normal;margin-bottom:28px;">${safeMessage}</div>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:11px 14px;color:#64748b;font-size:12px;width:130px;border-bottom:1px solid #e2e8f0;">Dealer</td><td style="padding:11px 14px;color:#111827;font-size:13px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.dealerName || 'Unknown dealer')}</td></tr>
          <tr><td style="padding:11px 14px;color:#64748b;font-size:12px;border-bottom:1px solid #e2e8f0;">User</td><td style="padding:11px 14px;color:#111827;font-size:13px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.userName || 'Unknown user')}</td></tr>
          <tr><td style="padding:11px 14px;color:#64748b;font-size:12px;border-bottom:1px solid #e2e8f0;">Email</td><td style="padding:11px 14px;color:#111827;font-size:13px;border-bottom:1px solid #e2e8f0;">${escapeHtml(payload.userEmail || '')}</td></tr>
          <tr><td style="padding:11px 14px;color:#64748b;font-size:12px;border-bottom:1px solid #e2e8f0;">Submitted</td><td style="padding:11px 14px;color:#111827;font-size:13px;border-bottom:1px solid #e2e8f0;">${escapeHtml(submittedAt)} CT</td></tr>
          <tr><td style="padding:11px 14px;color:#64748b;font-size:12px;border-bottom:1px solid #e2e8f0;">Page</td><td style="padding:11px 14px;color:#111827;font-size:13px;border-bottom:1px solid #e2e8f0;word-break:break-all;">${escapeHtml(payload.pageUrl || '')}</td></tr>
          <tr><td style="padding:11px 14px;color:#64748b;font-size:12px;">Browser</td><td style="padding:11px 14px;color:#475569;font-size:12px;word-break:break-word;">${escapeHtml(payload.browserInfo || '')}</td></tr>
        </table>
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:18px 36px;text-align:center;color:#64748b;font-size:12px;">Internal MyJobView feedback submission</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase server configuration is incomplete');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.slice('Bearer '.length);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, username, email, organization_id')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let verifiedDealerName = 'Unknown dealer';
    if (profile.organization_id) {
      const { data: company } = await supabase
        .from('company_settings')
        .select('company_name')
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      verifiedDealerName = company?.company_name || verifiedDealerName;
    }

    const payload = (await req.json()) as FeedbackPayload;
    if (!payload || !['bug', 'idea', 'general'].includes(payload.type)) {
      return new Response(JSON.stringify({ error: 'Invalid feedback type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    payload.organizationId = profile.organization_id || null;
    payload.userName = profile.full_name || profile.username || authData.user.email || 'Unknown user';
    payload.userEmail = profile.email || authData.user.email || '';
    payload.dealerName = verifiedDealerName;

    const message = String(payload.message || '').trim();
    if (!message || message.length > 10000) {
      return new Response(JSON.stringify({ error: 'Message is required and must be 10,000 characters or fewer' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    if (attachments.length > MAX_FILES) {
      return new Response(JSON.stringify({ error: `A maximum of ${MAX_FILES} attachments is allowed` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalBytes = 0;
    for (const attachment of attachments) {
      if (!attachment?.filename || !attachment?.content || !ALLOWED_ATTACHMENT_TYPES.has(attachment.contentType)) {
        return new Response(JSON.stringify({ error: 'Unsupported attachment' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const size = base64ByteLength(attachment.content);
      if (size > MAX_ATTACHMENT_BYTES) {
        return new Response(JSON.stringify({ error: `${attachment.filename} exceeds the 10 MB attachment limit` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      totalBytes += size;
    }

    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return new Response(JSON.stringify({ error: 'Attachments exceed the 20 MB total limit' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const fromAddress = Deno.env.get('MJV_FEEDBACK_FROM_EMAIL') || 'MyJobView <noreply@myjobview.com>';
    const subjectType = TYPE_LABELS[payload.type];
    const dealer = String(payload.dealerName || 'Unknown dealer').trim();
    const submitter = String(payload.userName || payload.userEmail || 'Unknown user').trim();
    const subject = `[MJV ${subjectType}] ${dealer} — ${submitter}`;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: ['MJV@ksav.com'],
        reply_to: payload.userEmail || undefined,
        subject,
        html: buildEmail({ ...payload, message }),
        attachments: attachments.map(attachment => ({
          filename: attachment.filename,
          content: attachment.content,
          content_type: attachment.contentType,
        })),
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('MJV feedback email failed:', errorText);
      throw new Error('Email delivery failed');
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending MJV feedback:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
