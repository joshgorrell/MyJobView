import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, getSupabaseAdmin } from '../_shared/qbo-client.ts';
import { sendSystemEmail } from '../_shared/system-email.ts';
import { wrapInEmailLayout } from '../_shared/emailTemplates.ts';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
Deno.serve(async (req:Request)=>{
 if(req.method==='OPTIONS') return new Response(null,{headers:corsHeaders});
 if(req.method!=='POST') return respond({error:'POST required'},405);
 try {
  const {requestId,deliveryId}=await req.json();
  const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{
   global:{headers:{Authorization:req.headers.get('Authorization') || ''}},auth:{persistSession:false},
  });
  const {data:attempt,error}=await caller.rpc('staff_service_approval',{p_action:'prepare',p_id:requestId,p_delivery_id:deliveryId});
  if(error || !attempt) return respond({error:error?.message || 'Staff access required'},403);
  if(attempt.sent_at) return respond({success:true});
  const admin=getSupabaseAdmin();
  const {data:settings,error:settingsError}=await admin.from('company_settings').select('company_name,from_name,from_email,company_email,portal_url,company_logo_url,reply_to_email').eq('organization_id',attempt.organization_id).maybeSingle();
  const {data:offices}=await admin.from('company_offices').select('office_name,phone').eq('organization_id',attempt.organization_id).order('display_order');
  const {data:org}=await admin.from('organizations').select('subdomain').eq('id',attempt.organization_id).maybeSingle();
  if(settingsError || !settings?.from_email) throw new Error('Configure the company email sender before sending this request.');
  const base=org?.subdomain ? `https://${org.subdomain}.myjobview.com` : new URL(settings.portal_url || 'https://myjobview.com').origin;
  const url=`${base}/portal/service-approval?request=${encodeURIComponent(requestId)}&token=${encodeURIComponent(attempt.token)}`;
  // Only the staff_service_approval description and terms are approved for customer delivery.
  // service_requests.notes is a staff-only scheduling message and must never be fetched or interpolated here.
  const company=settings.company_name || 'Your service provider';
  const text=`Hello ${attempt.customer_name},\n\nPlease review your service request, accept the service terms, and securely provide a payment method before we schedule your appointment.\n\n${attempt.description}\n\nNo payment is collected now. Completing these steps allows us to schedule your service appointment. An appointment time has not yet been reserved.\n\nReview and complete your request:\n${url}\n\nThis link expires in 14 days. If you have questions, contact ${company}.`;
  // Recheck immediately before delivery: waived/cancelled/revised requests must not be sent.
  const check=await caller.rpc('staff_service_approval',{p_action:'prepare',p_id:requestId,p_delivery_id:deliveryId});
  if(check.error) return respond({error:check.error.message},409);
  const response=await sendSystemEmail({headers:{'Idempotency-Key':`service-approval-${deliveryId}`},body:JSON.stringify({
   from:`${String(settings.from_name || company).replace(/[<>\r\n]/g,'')} <${settings.from_email}>`,
   to:[attempt.recipient],reply_to:settings.reply_to_email || settings.company_email || settings.from_email,
   subject:`${company}: Complete your service request`,text,
   html:wrapInEmailLayout(``<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2>Prepare your service appointment</h2><p>Hello ${escape(attempt.customer_name)},</p><p>Please review your service request, accept the service terms, and securely provide a payment method so we can schedule your service visit.</p><p style="white-space:pre-wrap">${escape(attempt.description)}</p><p>View the Service Terms &amp; Conditions on the approval page before accepting.</p><p><strong>No payment is collected now.</strong> Completing these steps allows us to schedule your service appointment. An appointment time has not yet been reserved.</p><p><a href="${escape(url)}">Review &amp; Approve Service</a></p><p>This link expires in 14 days. Questions? Contact ${escape(company)}.</p></div>`,company,settings.company_email || settings.from_email,'#0e7490',settings.company_logo_url || '',(offices || []).filter(o=>o.phone).map(o=>({office_name:o.office_name,phone:o.phone}))),
  })});
  if(!response.ok) throw new Error('Email delivery failed. The request is saved and remains waiting on the customer. Retry from the service queue.');
  const result=await response.json();
  const {error:saveError}=await admin.rpc('mark_service_approval_email_sent',{p_id:deliveryId,p_provider_id:result.id});
  if(saveError) throw new Error('Email was submitted, but delivery could not be recorded. Retry this request to confirm delivery.');
  return respond({success:true});
 }catch(e){return respond({error:e instanceof Error ? e.message : 'Unable to send customer request'},400);}
});
function respond(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});}
