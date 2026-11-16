const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function sessionClaimsAfterVerification(bearer,userId){
 const token=bearer.replace(/^Bearer /,'');const parts=token.split('.');if(parts.length!==3)throw new Error('invalid_session');
 const claims=JSON.parse(atob(parts[1].replaceAll('-','+').replaceAll('_','/')));
 if(claims.sub!==userId||!uuid.test(claims.session_id)||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now())throw new Error('invalid_session');
 return {auth_session_id:claims.session_id,token_exp:claims.exp};
}
const dealerOrigin=origin=>/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myjobview\.com$/.test(origin||'');
export function createAssistSupportHandler({authenticate,control,publicOrigin}){
 const expected=new URL(publicOrigin);if(expected.protocol!=='https:'||expected.origin!==publicOrigin)throw new Error('invalid_support_origin');
 return async request=>{
  const origin=request.headers.get('origin');const cors=dealerOrigin(origin)?{'access-control-allow-origin':origin,vary:'Origin','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS'}:{};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer'}});
  if(request.method==='OPTIONS')return new Response(null,{status:dealerOrigin(origin)?204:403,headers:cors});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer '))return reply(401,{error:'sign_in_required'});
  try{
   const actor=await authenticate(bearer);if(!actor)return reply(401,{error:'sign_in_required'});
   if(origin && origin!==`https://${actor.subdomain}.myjobview.com`)return reply(403,{error:'wrong_dealer'});
   const text=await request.text();if(text.length>4096)return reply(400,{error:'invalid_request'});
   let body;try{body=JSON.parse(text);}catch{return reply(400,{error:'invalid_request'});}
   if(!body||body.organizationId!==actor.organization_id||!['devices','connect','touch','end'].includes(body.operation))return reply(403,{error:'support_access_required'});
   const context={organization_id:actor.organization_id,actor_id:actor.actor_id,auth_session_id:actor.auth_session_id,token_exp:actor.token_exp,operation:body.operation};
   if(body.operation==='connect'){
    if(typeof body.deviceId!=='string'||body.deviceId.length>256)return reply(400,{error:'invalid_device'});context.device_id=body.deviceId;
   }
   if(['touch','end'].includes(body.operation)){if(!uuid.test(body.sessionId))return reply(400,{error:'invalid_session'});context.session_id=body.sessionId;}
   const data=await control(context);const domain='mjv-'+actor.organization_id.replaceAll('-','');
   if(body.operation==='devices'){
    if(!Array.isArray(data?.devices)||data.devices.length>500||data.devices.some(d=>typeof d.id!=='string'||!d.id.startsWith(`node/${domain}/`)))throw new Error('invalid_response');
    return reply(200,{devices:data.devices.map(d=>({id:d.id,name:String(d.name||'Windows laptop').slice(0,120),os:String(d.os||'').slice(0,160),online:d.online===true}))});
   }
   if(body.operation==='connect'){
    const url=new URL(data.viewer_url);if(url.origin!==publicOrigin||url.username||url.password||url.pathname!==`/${domain}/`||!url.searchParams.get('login')||!url.searchParams.get('node')||url.searchParams.get('viewmode')!=='11'||url.searchParams.get('hide')!=='15'||[...url.searchParams.keys()].some(k=>!['login','node','viewmode','hide'].includes(k))||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1)||!uuid.test(data.session_id))throw new Error('invalid_response');
    return reply(200,{session_id:data.session_id,viewer_url:url.href,viewer_origin:publicOrigin,expires_at:data.expires_at});
   }
   return reply(200,body.operation==='end'?{ended:data?.ended===true}:{active:data?.active===true,expires_at:data?.expires_at});
  }catch(error){return reply(error?.message==='forbidden'?403:503,{error:error?.message==='forbidden'?'support_access_required':'support_unavailable'});}
 };
}
