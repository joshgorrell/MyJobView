// Negative source authority only: suppress new checkout for a natively
// cancelled order. This can never authorize equipment, pricing or coverage.
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const held=reason=>({applicable:true,accepted:false,reason});
const requireFact=(ok)=>{if(!ok)throw Error('cancellation_unverified');};
export function createNativeCancellationSender({pool,sourceInstanceId,environment,fetchImpl=globalThis.fetch}={}){
 if(typeof pool?.connect!=='function'||typeof sourceInstanceId!=='string'||
    !/^[A-Za-z0-9_-]{1,128}$/.test(sourceInstanceId)||!['sandbox','production'].includes(environment))
  throw TypeError('trusted_cancellation_configuration_required');
 const transaction=async operation=>{
  const client=await pool.connect();let committed=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
   await client.query("SET LOCAL lock_timeout = '1s'");
   await client.query("SET LOCAL statement_timeout = '8s'");
   const result=await operation(client);
   await client.query('COMMIT');committed=true;return result;
  }finally{
   if(!committed)try{await client.query('ROLLBACK');}catch{}
   client.release();
  }
 };
 const source=async(client,{connectionId,orderId})=>{
  const c=(await client.query(`SELECT organization_id,proposal_id,connection_generation,enabled,status
   FROM techsafe_source.integration_connections WHERE connection_id=$1 AND sales_order_id=$2 FOR UPDATE`,[connectionId,orderId])).rows;
  requireFact(c.length===1&&c[0].enabled===true&&c[0].status==='active');
  const row=c[0],generation=Number(row.connection_generation);
  requireFact(Number.isSafeInteger(generation)&&generation>0);
  const orders=(await client.query(`SELECT so.status AS order_status,p.status AS proposal_status
   FROM public.sales_orders so JOIN public.proposals p
    ON p.id=so.proposal_id AND p.organization_id=so.organization_id
   WHERE so.id=$1 AND so.organization_id=$2 AND so.proposal_id=$3 FOR SHARE OF so,p`,
   [orderId,row.organization_id,row.proposal_id])).rows;
  requireFact(orders.length===1);
  const cancelled=['cancelled','canceled'].includes(orders[0].order_status)||
   ['cancelled','canceled'].includes(orders[0].proposal_status);
  return {cancelled,organizationId:row.organization_id,proposalId:row.proposal_id,generation,
   fingerprint:hash([connectionId,orderId,row.organization_id,row.proposal_id,generation,orders[0]])};
 };
 const payload=(scope,revision,eventId)=>({schemaVersion:1,messageType:'hold',environment,
  connectionId:scope.connectionId,sourceInstanceId,organizationId:scope.organizationId,
  orderId:scope.orderId,generation:scope.generation,revision,eventId,reason:'source_unavailable'});
 return async ({connectionId,orderId,endpoint,token}={})=>{
  if(!uuid(connectionId)||!uuid(orderId))return held('invalid_binding');
  let prepared;
  try{prepared=await transaction(async client=>{
   const ctx=await source(client,{connectionId,orderId});
   if(!ctx.cancelled)return {applicable:false};
   const scope={...ctx,connectionId,orderId};
   const prior=(await client.query(`SELECT * FROM techsafe_source.order_revision_ledger
    WHERE connection_id=$1 AND sales_order_id=$2 FOR UPDATE`,[connectionId,orderId])).rows[0];
   if(prior)requireFact(prior.organization_id===ctx.organizationId&&prior.proposal_id===ctx.proposalId);
   const existing=(await client.query(`SELECT event_payload FROM techsafe_source.negative_order_exports
    WHERE connection_id=$1 AND sales_order_id=$2 FOR UPDATE`,[connectionId,orderId])).rows[0];
   if(prior?.state==='held'&&prior.hold_reason==='source_cancelled'&&
      Number(prior.connection_generation)===ctx.generation&&prior.source_fingerprint===ctx.fingerprint&&
      uuid(existing?.event_payload?.eventId)&&Number.isSafeInteger(Number(prior.revision))){
    const event=payload(scope,Number(prior.revision),existing.event_payload.eventId);
    requireFact(isDeepStrictEqual(event,existing.event_payload));
    return {applicable:true,scope,event};
   }
   const revision=prior?Number(prior.revision)+1:1;
   requireFact(Number.isSafeInteger(revision)&&revision>0);
   const event=payload(scope,revision,randomUUID());
   await client.query(`INSERT INTO techsafe_source.order_revision_ledger
    (connection_id,organization_id,sales_order_id,proposal_id,revision,connection_generation,source_fingerprint,state,hold_reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,'held','source_cancelled')
    ON CONFLICT(connection_id,sales_order_id) DO UPDATE SET revision=EXCLUDED.revision,
     connection_generation=EXCLUDED.connection_generation,source_fingerprint=EXCLUDED.source_fingerprint,
     state='held',hold_reason='source_cancelled',updated_at=clock_timestamp()`,
    [connectionId,ctx.organizationId,orderId,ctx.proposalId,revision,ctx.generation,ctx.fingerprint]);
   await client.query(`INSERT INTO techsafe_source.negative_order_exports(connection_id,sales_order_id,event_payload)
    VALUES($1,$2,$3::jsonb) ON CONFLICT(connection_id,sales_order_id)
    DO UPDATE SET event_payload=EXCLUDED.event_payload`,[connectionId,orderId,JSON.stringify(event)]);
   return {applicable:true,scope,event};
  });}catch{return held('cancellation_source_unverified');}
  if(!prepared.applicable)return prepared;
  let url;
  try{url=new URL(endpoint);}catch{return held('invalid_endpoint');}
  if(url.href!=='https://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import')return held('invalid_endpoint');
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43,512}$/.test(token))return held('credentials_unavailable');
  const {event,scope}=prepared;
  try{
   // Recheck native cancellation, active generation, durable event and shared
   // revision immediately before HTTP. Never hold a DB lease across network IO.
   await transaction(async client=>{
    const ctx=await source(client,{connectionId,orderId});
    requireFact(ctx.cancelled&&ctx.generation===scope.generation&&ctx.fingerprint===scope.fingerprint);
    const rows=(await client.query(`SELECT l.revision,l.state,l.hold_reason,l.source_fingerprint,e.event_payload
     FROM techsafe_source.order_revision_ledger l JOIN techsafe_source.negative_order_exports e
      ON e.connection_id=l.connection_id AND e.sales_order_id=l.sales_order_id
     WHERE l.connection_id=$1 AND l.sales_order_id=$2 FOR SHARE OF l,e`,[connectionId,orderId])).rows;
    requireFact(rows.length===1&&Number(rows[0].revision)===event.revision&&rows[0].state==='held'&&
     rows[0].hold_reason==='source_cancelled'&&rows[0].source_fingerprint===ctx.fingerprint&&
     isDeepStrictEqual(rows[0].event_payload,event));
   });
  }catch{return held('cancellation_delivery_not_authorized');}
  try{
   const response=await fetchImpl(url.href,{method:'POST',headers:{'Content-Type':'application/json',
    Authorization:'Bearer '+token,'Idempotency-Key':connectionId+':'+orderId+':'+event.revision},
    body:JSON.stringify(event),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response||response.status<200||response.status>=300)return held('receiver_not_confirmed');
   const receipt=await response.json();
   if(receipt.accepted!==true||receipt.connectionId!==connectionId||receipt.orderId!==orderId||
      String(receipt.sourceRevision)!==String(event.revision)||receipt.eventId!==event.eventId||
      receipt.generation!==event.generation)return held('receiver_receipt_unverified');
   return {applicable:true,accepted:true,reason:'receiver_acknowledged',sourceRevision:String(event.revision)};
  }catch{return held('transport_failed');}
 };
}
