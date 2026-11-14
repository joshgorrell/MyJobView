import {createHash} from 'node:crypto';
import {readBoundedTechsafeInvocation} from './techsafe-sandbox-invocation.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
/** @param {{pool?: {connect: () => Promise<{query: (sql: string, parameters?: any[]) => Promise<{rows: any[]}>, release: () => void}>}, sendOrder?: (scope: {connectionId: string, orderId: string}) => Promise<{accepted: boolean, reason?: string, sourceRevision?: string}>, environment?: string, enabled?: boolean}} options */
export function createNativeDispatchHandler({pool,sendOrder,environment,enabled=false}={}){
 return async request=>{
  if(request.method!=='POST')return json(405,{accepted:false,reason:'method_not_allowed'});
  if(enabled!==true||!['sandbox','production'].includes(environment)||typeof pool?.connect!=='function'||typeof sendOrder!=='function')
   return json(503,{accepted:false,reason:'native_dispatch_not_configured'});
  const authorization=request.headers.get('authorization');
  if(typeof authorization!=='string'||!/^Bearer [a-f0-9]{64}$/.test(authorization))return json(403,{accepted:false,reason:'dispatch_ticket_required'});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return json(415,{accepted:false,reason:'unsupported_media_type'});
  let input;try{input=await readBoundedTechsafeInvocation(request);}catch{return json(400,{accepted:false,reason:'invalid_request'});}
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['connectionId','orderId'].includes(k))||
    !uuid(input.connectionId)||!uuid(input.orderId))return json(400,{accepted:false,reason:'invalid_request'});
  let client,authorized=false;
  try{
   client=await pool.connect();
   const result=await client.query(`UPDATE techsafe_source.native_invocation_tickets t SET consumed_at=clock_timestamp()
    FROM techsafe_source.integration_connections c,techsafe_source.native_delivery_queue q,techsafe_source.native_dispatch_settings s
    WHERE t.token_hash=$1 AND t.purpose='order_dispatch' AND t.consumed_at IS NULL
     AND t.connection_id=$2 AND t.sales_order_id=$3 AND t.dispatch_environment=$4
     AND t.issued_at<=clock_timestamp() AND t.expires_at>clock_timestamp() AND t.expires_at<=t.issued_at+interval '5 minutes'
     AND c.connection_id=t.connection_id AND c.sales_order_id=t.sales_order_id AND c.connection_generation=t.connection_generation
     AND c.dispatch_environment=$4 AND c.enabled=true AND c.status='active'
     AND q.connection_id=c.connection_id AND q.sales_order_id=c.sales_order_id
     AND q.attempt_sequence=t.dispatch_sequence AND q.request_id IS NOT NULL AND q.lease_expires_at>clock_timestamp()
     AND s.id=true AND s.enabled=true AND s.environment=$4 AND s.worker_url IS NOT NULL
    RETURNING t.connection_id`,[createHash('sha256').update(authorization.slice(7)).digest('hex'),input.connectionId,input.orderId,environment]);
   authorized=result.rows.length===1;
  }catch{/* No SQL/configuration/capability data may escape. */}
  finally{if(client)client.release();}
  if(!authorized)return json(403,{accepted:false,reason:'dispatch_ticket_required'});
  try{
   const result=await sendOrder(input);
   const revision=typeof result?.sourceRevision==='string'&&/^[1-9][0-9]{0,15}$/.test(result.sourceRevision)?result.sourceRevision:null;
   const accepted=result?.accepted===true&&revision!==null;
   const reason=typeof result?.reason==='string'&&/^[a-z_]{1,96}$/.test(result.reason)?result.reason:'delivery_not_confirmed';
   return json(accepted?200:409,{accepted,reason,...(accepted?{sourceRevision:revision}:{})});
  }catch{return json(409,{accepted:false,reason:'delivery_not_confirmed'});}
 };
}
