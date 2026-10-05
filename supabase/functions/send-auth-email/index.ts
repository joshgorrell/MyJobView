import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { sendSystemEmail } from '../_shared/system-email.ts';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const titles: Record<string, string> = {
  signup: 'Confirm your MyJobView email', email: 'Confirm your MyJobView email',
  recovery: 'Reset your MyJobView password', invite: 'Welcome to MyJobView',
  magiclink: 'Sign in to MyJobView', email_change: 'Confirm your MyJobView email change',
  reauthentication: 'Your MyJobView verification code',
  password_changed_notification: 'Your MyJobView password changed',
  email_changed_notification: 'Your MyJobView email changed',
  phone_changed_notification: 'Your MyJobView phone number changed',
  identity_linked_notification: 'A sign-in method was added to MyJobView',
  identity_unlinked_notification: 'A sign-in method was removed from MyJobView',
  mfa_factor_enrolled_notification: 'MyJobView two-step verification was enabled',
  mfa_factor_unenrolled_notification: 'MyJobView two-step verification was removed',
};
export async function handleAuthEmail(req: Request) {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return respond({ error: { message: 'Method not allowed', http_code: 405 } }, 405);
  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
  if (!secret) return respond({ error: { message: 'Auth email hook is not configured', http_code: 503 } }, 503);
  let event: any;
  try {
    // Only Supabase Auth's signed webhook can invoke this transport.
    event = new Webhook(secret.replace(/^v1,whsec_/, '')).verify(await req.text(), Object.fromEntries(req.headers));
  } catch {
    return respond({ error: { message: 'Invalid webhook signature', http_code: 401 } }, 401);
  }
  try {
    const { user, email_data: data } = event;
    const action = data?.email_action_type;
    const title = titles[action];
    if (!title || !user?.email) throw new Error('Unsupported auth email event');
    const recipients: { email: string; hash?: string; token?: string }[] = action === 'email_change'
      ? [
          ...(data.token_hash_new ? [{ email: user.email, hash: data.token_hash_new, token: data.token }] : []),
          { email: user.new_email, hash: data.token_hash, token: data.token_new || data.token },
        ]
      : [{ email: user.email, hash: data.token_hash, token: data.token }];
    for (const [index, recipient] of recipients.entries()) {
      if (!recipient.email) throw new Error('Auth email recipient is missing');
      let body: string;
      let text: string;
      if (action.endsWith('_notification')) {
        text = `${title}. If you did not make this change, contact your administrator immediately.`;
        body = `<p>${escape(text)}</p>`;
      } else if (action === 'reauthentication') {
        if (!recipient.token) throw new Error('Verification code is missing');
        text = `Your verification code is ${recipient.token}.`;
        body = `<p>Your verification code is <strong>${escape(recipient.token)}</strong>.</p>`;
      } else {
        if (!recipient.hash) throw new Error('Auth email token is missing');
        const link = new URL('/auth/v1/verify', Deno.env.get('SUPABASE_URL'));
        link.search = new URLSearchParams({ token: recipient.hash, type: action, redirect_to: data.redirect_to || data.site_url }).toString();
        text = `${title}: ${link.toString()}\nThis one-time link expires. If you did not request it, ignore this email.`;
        body = `<p><a href="${escape(link.toString())}">${escape(title)}</a></p><p>This one-time link expires. If you did not request it, ignore this email.</p>`;
      }
      const response = await sendSystemEmail({ headers: { 'Idempotency-Key': `auth-${req.headers.get('webhook-id')}-${index}` }, body: JSON.stringify({ to: [recipient.email], subject: title, text, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1 style="color:#163d7a">MyJobView</h1><h2>${escape(title)}</h2>${body}</div>` }) });
      if (!response.ok) throw new Error('Email provider rejected the authentication email');
    }
    return respond({});
  } catch {
    // Do not log tokens, webhook payloads, or user details.
    return respond({ error: { message: 'Could not send authentication email', http_code: 502 } }, 502);
  }
}
Deno.serve(handleAuthEmail);
