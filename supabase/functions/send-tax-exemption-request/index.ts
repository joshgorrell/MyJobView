import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { sendSystemEmail } from '../_shared/system-email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const staffRoles = new Set([
  'admin', 'manager', 'office_manager', 'sales_manager', 'project_manager',
  'service_manager', 'production_manager', 'sales', 'finance', 'bd',
]);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const emailAddress = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

function respond(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });

  try {
    const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return respond(401, { error: 'Sign in to request a certificate.' });

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return respond(401, { error: 'Sign in to request a certificate.' });

    const { data: staff } = await db.from('profiles')
      .select('organization_id, role, contact_id, is_active, is_global_admin')
      .eq('id', user.id).maybeSingle();
    if (!staff?.organization_id || !staff.is_active || staff.contact_id
        || user.app_metadata.is_portal_user === true
        || !(staff.is_global_admin || staffRoles.has(staff.role))) {
      return respond(403, { error: 'You do not have permission to request a certificate.' });
    }

    const body = await request.json().catch(() => null);
    const { recipientId, source, email, requestId } = body ?? {};
    if (typeof recipientId !== 'string' || !uuid.test(recipientId)
        || typeof requestId !== 'string' || !uuid.test(requestId)
        || !['contact', 'lead'].includes(source)) {
      return respond(400, { error: 'Select a customer to request a certificate.' });
    }

    const staffDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const organizationId = staff.organization_id;
    const { data: recipient, error: recipientError } = await staffDb
      .from(source === 'lead' ? 'leads' : 'contacts')
      .select('email, contact_name')
      .eq('organization_id', organizationId).eq('id', recipientId).maybeSingle();
    if (recipientError || !recipient) return respond(404, { error: 'Customer could not be found.' });
    const recipientEmail = recipient.email?.trim();
    if (!recipientEmail || !emailAddress.test(recipientEmail)) {
      return respond(422, { error: 'Add a valid email address to the customer record first.' });
    }
    if (typeof email !== 'string' || recipientEmail.toLowerCase() !== email.trim().toLowerCase()) {
      return respond(409, { error: 'The customer email changed. Reopen the form to confirm the current address.' });
    }

    const { data: settings, error: settingsError } = await db.from('company_settings')
      .select('company_name, company_email, from_name, from_email, reply_to_email')
      .eq('organization_id', organizationId).maybeSingle();
    if (settingsError) throw settingsError;

    const from = settings?.from_email?.trim() || settings?.company_email?.trim();
    const replyTo = settings?.reply_to_email?.trim() || settings?.company_email?.trim() || from;
    if (!from || !replyTo || !emailAddress.test(from) || !emailAddress.test(replyTo)
        || /@resend\.dev$/i.test(from)) {
      return respond(422, { error: 'Set a verified sender and reply address in Company Settings.' });
    }

    const companyName = settings?.company_name?.trim() || 'Our team';
    const fromName = (settings?.from_name || companyName).replace(/[<>\r\n]/g, '');
    const greeting = recipient.contact_name?.trim() || 'there';
    const delivery = await sendSystemEmail({
      headers: { 'Idempotency-Key': `tax-exemption/${organizationId}/${recipientId}/${requestId}` },
      body: JSON.stringify({
        from: `${fromName} <${from}>`,
        to: [recipientEmail],
        reply_to: replyTo,
        subject: 'Request for your sales tax exemption certificate',
        text: `Hi ${greeting},\n\nPlease reply to this email with a copy of your sales tax exemption certificate for your upcoming purchase or project. This helps us review the exemption before we finalize your paperwork.\n\nThank you,\n${companyName}`,
      }),
    });
    if (!delivery.ok) {
      console.error('Tax exemption email provider rejected request', delivery.status);
      return respond(502, { error: 'The certificate request could not be sent. Please try again.' });
    }
    return respond(200, { sentAt: new Date().toISOString() });
  } catch (error) {
    console.error('Tax exemption request failed', error);
    return respond(500, { error: 'The certificate request could not be sent. Please try again.' });
  }
});
