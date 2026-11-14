import {createHash} from 'node:crypto';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function body(request){
 const reader=request.body?.getReader();if(!reader)throw Error('missing_body');
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;if(size>4096){await reader.cancel();throw Error('oversized_body');}chunks.push(value);
 }}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
// Token issuance is deliberately absent. Only privileged SQL can issue a
// scoped capability. Possession cannot bypass the native sender's approval,
// active connection, source freshness, certificate or receiver credential gates.
/** @param {{pool?: {connect: () => Promise<{query: (sql: string, parameters?: any[]) => Promise<{rows: any[]}>, release: () => void}>}, sendOrder?: (scope: {connectionId: string, orderId: string}) => Promise<{accepted: boolean, reason?: string, sourceRevision?: string}>, environment?: string, enabled?: boolean}} options */
export function createSandboxInvocationHandler({pool,sendOrder,environment,enabled=false}={}){
 return async request=>{
  if(request.method!=='POST')return json(405,{accepted:false,reason:'method_not_allowed'});
  if(enabled!==true||environment!=='sandbox'||typeof pool?.connect!=='function'||typeof sendOrder!=='function')
   return json(503,{accepted:false,reason:'sandbox_runner_not_configured'});
  const authorization=request.headers.get('authorization');
  if(typeof authorization!=='string'||!/^Bearer [a-f0-9]{64}$/.test(authorization))
   return json(403,{accepted:false,reason:'sandbox_ticket_required'});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))
   return json(415,{accepted:false,reason:'unsupported_media_type'});
  let input;try{input=await body(request);}catch{return json(400,{accepted:false,reason:'invalid_request'});}
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(k=>!['connectionId','orderId'].includes(k))||!uuid(input.connectionId)||!uuid(input.orderId))
   return json(400,{accepted:false,reason:'invalid_request'});
  let client,authorized=false;
  try{
   client=await pool.connect();
   const result=await client.query(`UPDATE techsafe_source.native_invocation_tickets t
    SET consumed_at=clock_timestamp()
    FROM techsafe_source.integration_connections c
    WHERE t.token_hash=$1 AND t.purpose='sandbox_send' AND t.consumed_at IS NULL
     AND t.connection_id=$2 AND t.sales_order_id=$3
     AND t.issued_at<=clock_timestamp() AND t.expires_at>clock_timestamp()
     AND t.expires_at<=t.issued_at+interval '5 minutes'
     AND c.connection_id=t.connection_id AND c.sales_order_id=t.sales_order_id
     AND c.connection_generation=t.connection_generation AND c.enabled=true AND c.status='active'
    RETURNING t.connection_id`,[createHash('sha256').update(authorization.slice(7)).digest('hex'),input.connectionId,input.orderId]);
   authorized=result.rows.length===1;
  }catch{/* Do not return SQL errors, capabilities or credentials. */}
  finally{if(client)client.release();}
  if(!authorized)return json(403,{accepted:false,reason:'sandbox_ticket_required'});
  // Ticket consumption has committed and the SQL session is returned before
  // invoking the same native sender used by authenticated dealer admins.
  try{
   const result=await sendOrder(input);
   const reason=typeof result?.reason==='string'&&/^[a-z_]{1,96}$/.test(result.reason)?result.reason:'delivery_not_confirmed';
   return json(result?.accepted===true?200:409,{accepted:result?.accepted===true,reason,
    ...(typeof result?.sourceRevision==='string'&&/^[1-9][0-9]{0,15}$/.test(result.sourceRevision)?{sourceRevision:result.sourceRevision}:{})});
  }catch{return json(409,{accepted:false,reason:'delivery_not_confirmed'});}
 };
}
