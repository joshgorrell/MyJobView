import { renderAccountEmail } from './account-email-template.ts';
import { sendSystemEmail } from './system-email.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};
export async function handleAccountEmail(req: Request, kind: 'welcome' | 'reset') {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  let targetId: string | undefined;
  let accepted = false;
  let tracked = false;
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return respond({ error: 'Not authenticated' }, 401);
    const { data: { user: actor }, error: authError } = await db.auth.getUser(token);
    if (authError || !actor) return respond({ error: 'Not authenticated' }, 401);
    const { data: admin, error: adminError } = await db.from('profiles').select('role,is_active,organization_id').eq('id', actor.id).single();
    if (adminError || admin?.role !== 'admin' || !admin.is_active || !admin.organization_id) return respond({ error: 'An active administrator is required' }, 403);
    const input = await req.json();
    if (typeof input.email !== 'string') return respond({ error: 'Email is required' }, 400);
    // Exact equality avoids treating recipient input as a wildcard pattern.
    const { data: target, error: targetError } = await db.from('profiles').select('id,email,full_name,is_active').eq('email', input.email.trim()).eq('organization_id', admin.organization_id).single();
    if (targetError || !target || !target.is_active) return respond({ error: 'Active user not found' }, 404);
    targetId = target.id;
    // Preserve the explicit password-edit action in EditUserForm.
    if (kind === 'reset' && input.password !== undefined) {
      if (typeof input.password !== 'string' || input.password.length < 6) return respond({ error: 'Password must be at least 6 characters' }, 400);
      const { error } = await db.auth.admin.updateUserById(target.id, { password: input.password });
      if (error) throw error;
      return respond({ success: true, message: 'Password updated successfully' });
    }
    const { error: trackingError } = await db.from('user_account_email_status').upsert({ user_id: target.id, [`${kind}_attempted_at`]: new Date().toISOString(), [`${kind}_error`]: null }, { onConflict: 'user_id' });
    if (trackingError) throw new Error('Account email tracking is unavailable. Apply the onboarding migration first.');
    tracked = true;
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) throw new Error('Email service is not configured: RESEND_API_KEY is missing.');
    const { data: settings, error: settingsError } = await db.from('company_settings').select('company_name,company_logo_url,app_url,from_email,from_name,reply_to_email').eq('organization_id', admin.organization_id).single();
    if (settingsError) throw settingsError;
    const from = settings?.from_email;
    if (!from || from.endsWith('@resend.dev')) throw new Error('Configure a verified email sender in company settings.');
    if (!settings?.app_url) throw new Error('Configure the application URL in company settings.');
    const login = new URL(settings.app_url);
    if (login.protocol !== 'https:') throw new Error('Application URL must use HTTPS.');
    const redirect = new URL(login.origin);
    if (kind === 'welcome') redirect.searchParams.set('account_setup', 'welcome');
    const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: 'recovery', email: target.email, options: { redirectTo: redirect.toString() } });
    if (linkError) throw linkError;
    if (!link.properties?.action_link) throw new Error('Could not generate a password setup link.');
    // Auth falls back to Site URL for redirects missing from its allowlist.
    const actualRedirect = new URL(link.properties.action_link).searchParams.get('redirect_to');
    if (!actualRedirect || new URL(actualRedirect).origin !== login.origin || (kind === 'welcome' && new URL(actualRedirect).searchParams.get('account_setup') !== 'welcome')) throw new Error('Add the application URL and welcome URL to Supabase Auth redirect URLs.');
    const company = settings.company_name || 'Your company';
    const subject = kind === 'welcome' ? `Welcome to MyJobView — ${company}` : 'Reset your MyJobView password';
    const { html, text } = renderAccountEmail({
      kind, companyName: company, companyLogoUrl: settings.company_logo_url,
      fullName: target.full_name, email: target.email,
      actionUrl: link.properties.action_link, loginUrl: login.origin,
      supportEmail: settings.reply_to_email || from,
    });
    const response = await sendSystemEmail({ method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: `${(settings.from_name || settings.company_name || 'MyJobView').replace(/[<>\r\n]/g, '')} <${from}>`, to: [target.email], reply_to: settings.reply_to_email || from, subject, text, html }) });
    const result = await response.json();
    if (!response.ok || !result.id) throw new Error(`Email provider rejected the message: ${result.message || 'Unknown error'}`);
    accepted = true;
    const { error: statusError } = await db.from('user_account_email_status').update({ [`${kind}_sent_at`]: new Date().toISOString(), [`${kind}_email_id`]: result.id, [`${kind}_error`]: null }).eq('user_id', target.id);
    if (statusError) return respond({ success: true, warning: 'Email accepted by provider, but status could not be saved. Refresh before resending.', emailId: result.id });
    return respond({ success: true, message: 'Email accepted by provider', emailId: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send account email';
    if (targetId && tracked && !accepted) await db.from('user_account_email_status').update({ [`${kind}_error`]: message }).eq('user_id', targetId);
    return respond({ error: message }, 400);
  }
}
