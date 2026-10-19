import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {corsHeaders,getSupabaseAdmin,getConnection,qboRequest} from '../_shared/qbo-client.ts';
import {ensureSecurityQboCustomer} from '../_shared/security-qbo-customer.ts';
import {openVipCheckout} from '../_shared/vip-checkout.ts';
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:corsHeaders});
 if(req.method!=='POST')return respond({error:'POST required'},405);
 try {
  const caller=createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_ANON_KEY') || '',{global:{headers:{Authorization:req.headers.get('Authorization') || ''}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await caller.auth.getUser();
  if(authError || !user)return respond({error:'Sign in required'},401);
  const input=await req.json();
  if(Object.keys(input).some(key=>!['contact_id','plan_id'].includes(key)))return respond({error:'Invalid checkout request'},400);
  const {data:prepared,error}=await caller.rpc('prepare_vip_checkout',{p_contact_id:input.contact_id,p_plan_id:input.plan_id});
  if(error || !prepared?.id)return respond({error:error?.message || 'Checkout could not be prepared'},403);
  const admin=getSupabaseAdmin();
  const {data:checkout,error:readError}=await admin.from('vip_membership_checkouts').select('*').eq('id',prepared.id).eq('contact_id',input.contact_id).maybeSingle();
  if(readError || !checkout)throw new Error('Checkout could not be loaded.');
  if(checkout.status!=='pending')return respond({status:checkout.status,total:Number(checkout.total)});
  const connection=await getConnection(admin,checkout.organization_id);
  if(!connection)throw new Error('Online VIP checkout is not ready. Please contact your representative.');
  const result=await openVipCheckout(admin,connection,checkout,qboRequest,ensureSecurityQboCustomer);
  return respond({...result,plan_name:checkout.plan_name,billing_frequency:checkout.billing_frequency,subtotal:Number(checkout.subtotal),tax_amount:Number(checkout.tax_amount),environment:connection.environment});
 }catch(error){return respond({error:error instanceof Error?error.message:'Checkout could not be completed'},409);}
});
function respond(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});}
