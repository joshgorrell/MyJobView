import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {sendSystemEmail} from '../_shared/system-email.ts';
import {createAssistSupportHandler,sessionClaimsAfterVerification} from '../_shared/assist-support-handler.mjs';

Deno.serve(async(request:Request)=>{
 try{
  const backend=Deno.env.get('SUPABASE_URL')!;const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const controlOrigin=Deno.env.get('ASSIST_CONTROL_ORIGIN')!;const secret=Deno.env.get('ASSIST_CONTROL_TOKEN')!;
  const publicOrigin=Deno.env.get('ASSIST_PUBLIC_ORIGIN')!;
  const url=new URL(controlOrigin);if(url.protocol!=='https:'||url.origin!==controlOrigin||!secret||secret.length<32)throw new Error('not_configured');
  const handler=createAssistSupportHandler({publicOrigin,
   authenticate:async(bearer:string)=>{
    const db=createClient(backend,anon,{auth:{persistSession:false},global:{headers:{Authorization:bearer}}});
    const {data:{user},error}=await db.auth.getUser();if(error||!user)return null;
    const claims=sessionClaimsAfterVerification(bearer,user.id);
    const {data:profile,error:pe}=await db.from('profiles').select('organization_id,role,is_active').eq('id',user.id).maybeSingle();
    if(pe||!profile?.is_active||profile.role==='portal_user'||!profile.organization_id)return null;
    const {data:org,error:oe}=await db.from('organizations').select('subdomain,is_active').eq('id',profile.organization_id).maybeSingle();
    if(oe||!org?.is_active||!org.subdomain)return null;
    return {organization_id:profile.organization_id,actor_id:user.id,subdomain:org.subdomain,...claims};
   },
   sendInviteEmail:async({recipient,joinUrl,inviteId}:{recipient:string;joinUrl:string;inviteId:string})=>{
    const response=await sendSystemEmail({
     signal:AbortSignal.timeout(10000),
     headers:{'Idempotency-Key':`assist-invite/${inviteId}`},
     body:JSON.stringify({
      to:[recipient],
      subject:'MyJobView Assist invitation',
      text:`Open this one-time link to get remote support:\n${joinUrl}\n\nClick Download Assist, open the app, and approve the support request. Only approve if you were expecting help.`,
     }),
    });
    await response.body?.cancel();
    return response.ok;
   },
   control:async(body:unknown)=>{
    const response=await fetch(controlOrigin+'/v1/support',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json',authorization:'Bearer '+secret},body:JSON.stringify(body)});
    if(response.status===403)throw new Error('forbidden');if(!response.ok)throw new Error('support_unavailable');
    const text=await response.text();if(text.length>262144)throw new Error('oversized_response');return JSON.parse(text);
   },
  });
  return await handler(request);
 }catch{return new Response(JSON.stringify({error:'support_unavailable'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});}
});
