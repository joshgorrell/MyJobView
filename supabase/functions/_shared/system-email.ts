import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/** One transport for outbound system mail. Preserve content, tenant sender, recipients and idempotency keys. */
export async function sendSystemEmail(init: RequestInit): Promise<Response> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('Email service is not configured: RESEND_API_KEY is missing.');
  if (typeof init.body !== 'string') throw new Error('System email payload must be JSON.');
  const payload = JSON.parse(init.body);
  // Existing producers resolve their company's sender. Preserve prepared messages
  // exactly (especially billing/invitation retries using provider idempotency).
  // Auth hooks and legacy test senders resolve the configured project sender here.
  if (!payload.from || /@resend\.dev>?$/i.test(payload.from)) {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: settings, error } = await db.from('company_settings').select('from_email,from_name,company_name,company_email,reply_to_email').single();
    if (error) throw new Error('Could not load system email sender settings.');
    const from = settings?.from_email || settings?.company_email;
    if (!from || from.endsWith('@resend.dev')) throw new Error('Configure a verified sender in company email settings.');
    const name = (settings.from_name || settings.company_name || 'MyJobView').replace(/[<>\r\n]/g, '');
    payload.from = `${name} <${from}>`;
    payload.reply_to ||= settings.reply_to_email || from;
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${key}`);
  headers.set('Content-Type', 'application/json');
  return fetch('https://api.resend.com/emails', { ...init, method: 'POST', headers, body: JSON.stringify(payload) });
}
