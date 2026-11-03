import { notifyProposalMessage } from './notify.ts';
import { isProposalChoice, proposalChoices } from '../_shared/proposalCheckOptions.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:{...headers,'Content-Type':'application/json'}});
export async function handleProposalResponse(req: Request, db: any) {
 if(req.method==='OPTIONS') return new Response(null,{headers});
 if(!['GET','POST'].includes(req.method)) return json({error:'Method not allowed'},405);
 try {
  if(Number(req.headers.get('content-length')||0)>12000) return json({error:'Request too large'},413);
  const url=new URL(req.url); let body: any={};
  if(req.method==='POST') {const raw=await req.text();if(raw.length>12000)return json({error:'Request too large'},413);body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);}
  const token=req.method==='GET'?url.searchParams.get('token'):body.token;
  if(typeof token!=='string'||!/^[0-9a-f-]{72}$/.test(token))return json({error:'This response link is unavailable.'},404);
  const {data:email,error}=await db.from('proposal_check_emails').select('id,organization_id,status,response_url,response_expires_at,recipient_name,recipient_email,proposal_id').eq('response_token',token).maybeSingle();
  if(error)throw error;
  if(!email||email.status!=='sent'||Date.parse(email.response_expires_at)<Date.now())return json({error:'This response link is unavailable or expired.'},404);
  async function record(kind:string,choice:string,step:string|null=null,message:string|null=null,key=crypto.randomUUID()) {
   const result=await db.rpc('record_proposal_check_event',{p_email_id:email.id,p_event_key:key,p_kind:kind,p_choice:choice,p_step:step,p_message:message,p_automated:kind==='link_visit'&&/bot|spider|crawler|scanner|safelinks|proofpoint/i.test(req.headers.get('user-agent')||'')});
   if(result.error)throw result.error;return result.data;
  }
  if(req.method==='GET') {
   const choice=url.searchParams.get('choice');if(!isProposalChoice(choice))return json({error:'Choose a valid response.'},400);
   // Do not redirect when the event could not be saved; a retry remains possible.
   await record('link_visit',choice);
   const target=new URL(email.response_url);
   if(target.protocol!=='https:'||!target.hostname.endsWith('.myjobview.com')||target.pathname!=='/proposal-check-response')throw Error('Invalid response destination');
   target.searchParams.set('token',token);target.searchParams.set('choice',choice);
   return new Response(null,{status:303,headers:{...headers,Location:target.toString()}});
  }
  if(body.action==='load') {
   const {data:settings,error:settingError}=await db.from('company_settings').select('company_name,company_logo_url,company_email').eq('organization_id',email.organization_id).maybeSingle();
   const {data:org,error:orgError}=await db.from('organizations').select('subdomain').eq('id',email.organization_id).single();
   if(settingError||orgError)throw settingError||orgError;
   return json({company_name:settings?.company_name||'Our team',company_logo_url:settings?.company_logo_url||'',owner_name:org.subdomain==='elife'?'Josh Gorrell':null,owner_email:org.subdomain==='elife'?'josh@electroniclife.com':settings?.company_email||null});
  }
  if(!['interaction','message'].includes(body.action)||!isProposalChoice(body.choice))return json({error:'Choose a valid response.'},400);
  const step=body.step||null;const message=typeof body.message==='string'?body.message.trim():'';
  if(step!==null&&!proposalChoices[body.choice].steps.some(s=>s===step))return json({error:'Choose a valid next step.'},400);
  if(message.length>5000||!(/^[0-9a-f-]{36}$/.test(body.event_key||'')))return json({error:'Invalid response.'},400);
  if(body.action==='message'&&!step&&!message)return json({error:'Choose a next step or write a message.'},400);
  const event_id=await record(body.action,body.choice,step,body.action==='message'?message:null,body.event_key);
  if(body.action==='message')await notifyProposalMessage(db,email,event_id);
  return json({success:true,event_id});
 } catch {return json({error:'We could not save this response. Please try again.'},503);}
}
