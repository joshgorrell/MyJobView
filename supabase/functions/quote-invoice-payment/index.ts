import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, getSupabaseAdmin } from '../_shared/qbo-client.ts';

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Read only quote. Charging must recheck the invoice and fee settings under a lock.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return respond({ error: 'Unauthorized' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return respond({ error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return respond({ error: 'Invalid request' }, 400); }
  const invoiceId = body.invoiceId;
  const method = body.method;
  const amount = body.amount;
  if (typeof invoiceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(invoiceId) ||
      (method !== 'credit_card' && method !== 'ach') || typeof amount !== 'number' ||
      !Number.isFinite(amount) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001 || amount <= 0) {
    return respond({ error: 'Invalid payment selection' }, 400);
  }
  const { data: profile, error: profileError } = await client.from('profiles')
    .select('contact_id, organization_id').eq('id', user.id).maybeSingle();
  if (profileError || !profile?.contact_id || !profile.organization_id) return respond({ error: 'Portal access required' }, 403);
  const { data: invoice, error: invoiceError } = await client.from('invoices')
    .select('id, organization_id, contact_id, amount_due, status, qbo_invoice_id')
    .eq('id', invoiceId).eq('contact_id', profile.contact_id).eq('organization_id', profile.organization_id).maybeSingle();
  if (invoiceError) return respond({ error: 'Invoice could not be loaded' }, 500);
  if (!invoice || !['submitted', 'partial', 'overdue'].includes(invoice.status) || !invoice.qbo_invoice_id) {
    return respond({ error: 'Invoice is not available for online payment' }, 409);
  }
  const amountCents = Math.round(amount * 100);
  if (amountCents > Math.round(Number(invoice.amount_due) * 100)) return respond({ error: 'Amount exceeds invoice balance' }, 409);

  const { data: settings, error: settingsError } = await client.from('company_settings')
    .select('cc_convenience_fee_enabled, cc_convenience_fee_type, cc_convenience_fee_percentage, cc_convenience_fee_flat_amount, cc_convenience_fee_label')
    .eq('organization_id', profile.organization_id).maybeSingle();
  if (settingsError || !settings) return respond({ error: 'Payment settings unavailable' }, 503);
  const { data: connection } = await getSupabaseAdmin().from('quickbooks_settings')
    .select('environment, is_connected').eq('organization_id', profile.organization_id).maybeSingle();
  if (!connection?.is_connected || !['sandbox', 'production'].includes(connection.environment)) {
    return respond({ error: 'Online payment is unavailable' }, 503);
  }
  const applies = method === 'credit_card' && settings.cc_convenience_fee_enabled === true;
  const rate = Number(settings.cc_convenience_fee_percentage);
  const flat = Number(settings.cc_convenience_fee_flat_amount);
  if (applies && ((settings.cc_convenience_fee_type === 'flat' && (!Number.isFinite(flat) || flat < 0)) ||
    (settings.cc_convenience_fee_type !== 'flat' && (!Number.isFinite(rate) || rate < 0)))) {
    return respond({ error: 'Payment settings unavailable' }, 503);
  }
  const feeCents = !applies ? 0 : settings.cc_convenience_fee_type === 'flat'
    ? Math.round(flat * 100) : Math.round(amountCents * rate);
  return respond({ invoiceId, method, amount: amountCents / 100, fee: feeCents / 100,
    total: (amountCents + feeCents) / 100,
    environment: connection.environment,
    feeLabel: applies ? settings.cc_convenience_fee_label || 'Credit Card Convenience Fee' : null });
});
