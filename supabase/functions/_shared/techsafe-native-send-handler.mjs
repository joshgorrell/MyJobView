// Dealer-admin or authenticated internal-service invocation only. Request JSON contains identities,
// never endpoints, credentials, approval facts, flags or exported customer data.
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function boundedBody(request){
 const reader=request.body?.getReader();if(!reader)throw Error('body_required');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;if(size>4096){await reader.cancel();throw Error('body_limit');}chunks.push(value);
 }}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
/** @param {{enabled?: boolean, authenticateService?: (authorization: string|null) => Promise<boolean>, authenticateAdmin?: (authorization: string|null) => Promise<{verified: boolean, userId: string, organizationId: string, role: string}|null>, readConnectionOrganization?: (scope: {connectionId: string, orderId: string}) => Promise<string|null>, sendOrder?: (scope: {connectionId: string, orderId: string}) => Promise<{accepted: boolean, reason?: string, sourceRevision?: string}>}} options */
export function createNativeTechsafeSendHandler({enabled=false,authenticateService,authenticateAdmin,readConnectionOrganization,sendOrder}={}){
 return async request=>{
  if(request.method!=='POST')return json(405,{accepted:false,reason:'method_not_allowed'});
  if(enabled!==true||(typeof authenticateAdmin!=='function'&&typeof authenticateService!=='function')||typeof readConnectionOrganization!=='function'||typeof sendOrder!=='function')
   return json(503,{accepted:false,reason:'sender_not_configured'});
  let identity,trustedService=false;
  const authorization=request.headers.get('authorization');
  try{
   trustedService=typeof authenticateService==='function'&&await authenticateService(authorization)===true;
   if(!trustedService&&typeof authenticateAdmin==='function')identity=await authenticateAdmin(authorization);
  }catch{}
  if(!trustedService&&(!identity||identity.verified!==true||!uuid(identity.userId)||!uuid(identity.organizationId)||identity.role!=='admin'))
   return json(403,{accepted:false,reason:'dealer_admin_required'});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))
   return json(415,{accepted:false,reason:'unsupported_media_type'});
  let body;try{body=await boundedBody(request);}catch{return json(400,{accepted:false,reason:'invalid_request'});}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['connectionId','orderId'].includes(k))||
     !uuid(body.connectionId)||!uuid(body.orderId))return json(400,{accepted:false,reason:'invalid_request'});
  try{
   const organizationId=await readConnectionOrganization({connectionId:body.connectionId,orderId:body.orderId});
   if(!uuid(organizationId)||(!trustedService&&organizationId!==identity.organizationId))return json(404,{accepted:false,reason:'connection_not_found'});
   const result=await sendOrder({connectionId:body.connectionId,orderId:body.orderId});
   if(result?.accepted!==true)return json(409,{accepted:false,
    reason:typeof result?.reason==='string'&&/^[a-z_]{1,96}$/.test(result.reason)?result.reason:'delivery_not_confirmed'});
   return json(200,{accepted:true,reason:'receiver_acknowledged',
    ...(typeof result.sourceRevision==='string'&&/^[1-9]\d{0,15}$/.test(result.sourceRevision)?{sourceRevision:result.sourceRevision}:{})});
  }catch{return json(409,{accepted:false,reason:'delivery_not_confirmed'});}
 };
}
