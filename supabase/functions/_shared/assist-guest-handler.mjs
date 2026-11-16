const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const dealerOrigin=origin=>/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myjobview\.com$/.test(origin||'');
export function guestStatus(data){
 if(!uuid.test(data?.invite_id)||!['waiting_for_guest','waiting_for_computer','computer_ready','support_window_ready'].includes(data.state)||!Number.isFinite(Date.parse(data.expires_at)))throw new Error('invalid_response');
 return {invite_id:data.invite_id,state:data.state,expires_at:data.expires_at};
}
export function createAssistGuestHandler({resolveDealer,control,publicOrigin}){
 const expected=new URL(publicOrigin);if(expected.protocol!=='https:'||expected.origin!==publicOrigin)throw new Error('invalid_origin');
 return async request=>{
  const origin=request.headers.get('origin'),allowed=dealerOrigin(origin);
  const cors=allowed?{'access-control-allow-origin':origin,vary:'Origin','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS'}:{};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:cors});
  if(!allowed)return reply(403,{error:'guest_unavailable'});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  try{
   const text=await request.text();if(text.length>2048)throw new Error('invalid_request');const body=JSON.parse(text);
   if(!body||!['redeem','status','end'].includes(body.operation))throw new Error('invalid_request');
   const organization=await resolveDealer(new URL(origin).hostname.split('.')[0]);if(!uuid.test(organization))throw new Error('guest_unavailable');
   const context={organization_id:organization,operation:body.operation};
   if(body.operation==='redeem'){
    if(typeof body.code!=='string'||body.code.length>24)throw new Error('invalid_request');context.code=body.code;
   }else{
    if(!uuid.test(body.inviteId)||!/^[a-f0-9]{64}$/.test(body.claimToken||''))throw new Error('invalid_request');context.invite_id=body.inviteId;context.claim_token=body.claimToken;
   }
   const data=await control(context);
   if(body.operation==='end')return reply(200,{ended:data?.ended===true});
   const result=guestStatus(data);
   if(body.operation==='redeem'){
    if(!/^[a-f0-9]{64}$/.test(data.claim_token||''))throw new Error('invalid_response');
    const url=new URL(data.download_url),domain='mjv-'+organization.replaceAll('-','');
    if(url.origin!==publicOrigin||url.pathname!==`/${domain}/meshagents`||url.username||url.password||url.hash||url.searchParams.get('installflags')!=='1'||url.searchParams.get('id')!=='4'||!/^[a-zA-Z0-9@$+=_-]{32,128}$/.test(url.searchParams.get('meshid')||'')||[...url.searchParams.keys()].some(k=>!['meshid','id','installflags'].includes(k)||url.searchParams.getAll(k).length!==1))throw new Error('invalid_response');
    result.claim_token=data.claim_token;result.download_url=url.href;
   }
   return reply(200,result);
  }catch{return reply(503,{error:'guest_unavailable'});}
 };
}
