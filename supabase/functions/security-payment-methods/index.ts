import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, getSupabaseAdmin, getConnection, getValidAccessToken, getQboIdByLocalId } from '../_shared/qbo-client.ts';
import { maskedPayment, paymentsOrigin, vaultRequest } from '../_shared/security-payment-vault.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null,{headers:corsHeaders});
  if (req.method !== 'POST') return respond({error:'POST required'},405);
  try {
    const input = await req.json();
    // A strict envelope excludes raw card/bank data and client-supplied customer IDs.
    if (Object.keys(input).some(k => !['action','contractId','token','paymentType','tokenValue','methodId'].includes(k)))
      return respond({error:'Only processor tokens are accepted'},400);
    const {action,contractId,token,paymentType,tokenValue,methodId} = input;
    if (!['list','add','verify'].includes(action) || typeof contractId!=='string') return respond({error:'Invalid request'},400);
    const caller = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global:{headers:{Authorization:req.headers.get('Authorization') || ''}}, auth:{persistSession:false},
    });
    // Same contract-scoped invitation/portal ownership check as drafts. No service-role bypass.
    const {data:agreement,error:accessError} = await caller.rpc('portal_security_onboarding',{
      p_action:'get',p_contract_id:contractId,p_token:token || null,
    });
    if (accessError || !agreement || agreement.customer_completed_at || !['pending_customer','customer_completed'].includes(agreement.status))
      return respond({error:'Your invitation has expired or this agreement is no longer editable'},403);
    const admin = getSupabaseAdmin();
    const {data:contract} = await admin.from('security_contracts').select('contact_id,organization_id,security_billing_mode').eq('id',contractId).single();
    if (!contract || contract.security_billing_mode!=='autopay') return respond({error:'Payment enrollment is not available for this agreement'},400);
    const {data:organization} = await admin.from('organizations').select('payment_processor').eq('id',contract.organization_id).single();
    const connection = await getConnection(admin,contract.organization_id);
    if (organization?.payment_processor!=='quickbooks' || !connection || !connection.payments_enabled)
      return respond({error:'QuickBooks Payments enrollment is not enabled. Your progress is saved; contact your provider.'},409);
    const {data:contact} = await admin.from('contacts').select('qbo_customer_id').eq('id',contract.contact_id).eq('organization_id',contract.organization_id).single();
    const customerId = contact?.qbo_customer_id || await getQboIdByLocalId(admin,contract.organization_id,'customer',contract.contact_id);
    if (!customerId) return respond({error:'Your provider needs to sync your customer account with QuickBooks before payment enrollment. Your progress is saved.'},409);
    const accessToken = await getValidAccessToken(admin,connection);
    if (!accessToken) return respond({error:'QuickBooks needs to be reconnected by your provider'},409);
    const origin = paymentsOrigin(connection.environment);
    const owner = {organization_id:contract.organization_id,contact_id:contract.contact_id};
    async function remember(raw: Record<string,unknown>, type: 'card'|'ach') {
      const mask = maskedPayment(raw,type);
      if (!mask.qbo_method_id || mask.display_last4.length!==4) throw new Error('QuickBooks returned an incomplete payment method');
      const {data,error} = await admin.from('security_payment_methods').upsert({
        ...owner,qbo_customer_id:String(customerId),
        ...mask,verified_at:new Date().toISOString(),is_active:true,
      },{onConflict:'organization_id,contact_id,payment_type,qbo_method_id'})
        .select('id,payment_type,display_brand,display_last4,exp_month,exp_year').single();
      if (error) throw new Error('Your payment method could not be saved. Please refresh the methods list before retrying.');
      return data;
    }
    if (action==='verify') {
      const {data:method} = await admin.from('security_payment_methods').select('qbo_method_id,payment_type,qbo_customer_id')
        .eq('id',methodId).eq('contact_id',contract.contact_id).eq('organization_id',contract.organization_id).eq('is_active',true).maybeSingle();
      if (!method || String(method.qbo_customer_id)!==String(customerId)) return respond({error:'Select a payment method belonging to this customer'},400);
      const raw = await vaultRequest(origin,accessToken,String(customerId),method.payment_type,undefined,method.qbo_method_id);
      return respond({method:await remember(raw,method.payment_type)});
    }
    if (action==='add') {
      if (!['card','ach'].includes(paymentType) || typeof tokenValue!=='string' || !tokenValue || tokenValue.length>512)
        return respond({error:'A valid QuickBooks payment token is required'},400);
      const raw = await vaultRequest(origin,accessToken,String(customerId),paymentType,tokenValue);
      return respond({method:await remember(raw,paymentType)});
    }
    const methods = [];
    for (const type of ['card','ach'] as const) {
      const collection = await vaultRequest(origin,accessToken,String(customerId),type);
      if (!Array.isArray(collection)) throw new Error('QuickBooks returned an invalid payment-method list');
      for (const method of collection) methods.push(await remember(method,type));
    }
    return respond({methods,environment:connection.environment});
  } catch (error) {
    return respond({error:error instanceof Error ? error.message : 'Payment enrollment failed'},400);
  }
});
function respond(data:unknown,status=200) {
  return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});
}
