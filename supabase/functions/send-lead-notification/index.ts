import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { sendSystemEmail } from '../_shared/system-email.ts';
import { getCompanySettings } from '../_shared/emailTemplates.ts';
import { buildLeadUrl, renderLeadEmail } from '../_shared/lead-email-template.ts';
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey' };
Deno.serve(async (req: Request) => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return respond({ error: 'Not authenticated' }, 401);
    const db = createClient(url, key);
    let reader = db;
    // The internal inbound-email worker is trusted; staff requests must pass lead RLS.
    if (token !== key) {
      const { data: { user }, error } = await db.auth.getUser(token);
      if (error || !user) return respond({ error: 'Not authenticated' }, 401);
      reader = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    }
    const { leadId, to } = await req.json();
    if (typeof leadId !== 'string' || !Array.isArray(to) || !to.length || to.some(e => typeof e !== 'string')) return respond({ error: 'Lead ID and recipients are required' }, 400);
    const { data: lead, error: leadError } = await reader.from('leads').select('*').eq('id', leadId).single();
    if (leadError || !lead?.organization_id) return respond({ error: 'Lead not found' }, 404);
    const { data: reps, error: repError } = await db.from('profiles').select('id,email,full_name,notify_on_fishbowl').eq('organization_id', lead.organization_id).in('email', to).eq('is_active', true).eq('email_leads', true);
    if (repError) throw repError;
    const fishbowl = lead.is_fishbowl && !lead.assigned_to;
    const recipients = (reps || []).filter(rep => fishbowl ? rep.notify_on_fishbowl !== false : rep.id === lead.assigned_to);
    if (!recipients.length) return respond({ success: true, sent: 0, failed: 0, skipped: true });
    const settings = await getCompanySettings(url, key, lead.organization_id);
    const leadUrl = buildLeadUrl(settings.app_url || (settings.subdomain ? `https://${settings.subdomain}.myjobview.com` : Deno.env.get('APP_URL')), lead.id, fishbowl);
    const { data: people, error: peopleError } = await db.from('profiles').select('id,full_name').eq('organization_id', lead.organization_id).in('id', [lead.created_by, lead.assigned_to].filter(Boolean));
    if (peopleError) throw peopleError;
    let officeName = '';
    if (lead.office_id) {
      const { data: office, error } = await db.from('company_offices').select('office_name').eq('organization_id', lead.organization_id).eq('id', lead.office_id).maybeSingle();
      if (error) throw error;
      officeName = office?.office_name || '';
    }
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('Email service is not configured.');
    const results = await Promise.all(recipients.map(async rep => {
      const message = renderLeadEmail({ lead, leadUrl, isFishbowl: fishbowl, repName: rep.full_name, companyName: settings.company_name, companyLogoUrl: settings.company_logo_url, officeName, creatorName: people?.find(p => p.id === lead.created_by)?.full_name || '', assignedName: people?.find(p => p.id === lead.assigned_to)?.full_name || '' });
      try {
        const response = await sendSystemEmail({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` }, body: JSON.stringify({ from: settings.from_address, to: [rep.email], reply_to: settings.reply_to_email, ...message }) });
        return response.ok;
      } catch { return false; }
    }));
    const failed = results.filter(ok => !ok).length;
    return respond({ success: failed === 0, sent: results.length - failed, failed }, failed ? 502 : 200);
  } catch (error) {
    console.error('Lead notification failed:', error);
    return respond({ error: error instanceof Error ? error.message : 'Email failed' }, 500);
  }
});
