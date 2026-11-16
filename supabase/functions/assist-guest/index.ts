import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createAssistGuestHandler} from '../_shared/assist-guest-handler.mjs';
Deno.serve(async(request:Request)=>{
 try{
  const controlOrigin=Deno.env.get('ASSIST_CONTROL_ORIGIN')!,secret=Deno.env.get('ASSIST_CONTROL_TOKEN')!;
  const origin=new URL(controlOrigin);if(origin.protocol!=='https:'||origin.origin!==controlOrigin||!secret||secret.length<32)throw new Error('not_configured');
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  return await createAssistGuestHandler({publicOrigin:Deno.env.get('ASSIST_PUBLIC_ORIGIN')!,
   resolveDealer:async(subdomain:string)=>{
    const {data,error}=await db.from('organizations').select('id').eq('subdomain',subdomain).eq('is_active',true).maybeSingle();
    if(error||!data)return null;return data.id;
   },
   control:async(body:unknown)=>{
    const response=await fetch(controlOrigin+'/v1/guest',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json',authorization:'Bearer '+secret},body:JSON.stringify(body)});
    if(!response.ok)throw new Error('guest_unavailable');const text=await response.text();if(text.length>8192)throw new Error('invalid_response');return JSON.parse(text);
   },
  })(request);
 }catch{return new Response(JSON.stringify({error:'guest_unavailable'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});}
});
