// Private server composition: DB approval proof + persisted export certificate
// + immediate delivery recheck + generation-bound receiver credentials.
// No HTTP request or browser may supply tokens, endpoints or source evidence.
import {createHash} from 'node:crypto';
import {createNativeOrderAuthority} from '../../../src/lib/techsafe/postgresNativeOrderAuthority.mjs';
import {createTechsafeSalesOrderSender} from './techsafe-sales-order-sender.mjs';
import {createPrivateTechsafeCredentialReader} from './techsafe-private-receiver-credentials.mjs';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
const held=reason=>({accepted:false,reason});
/** @param {{pool: {connect: () => Promise<{query: (sql: string, parameters?: any[]) => Promise<{rows: any[]}>, release: () => void}>}, readSecret: (scope: {connectionId: string, organizationId: string, generation: number}) => Promise<unknown>, sourceInstanceId: string, environment?: string, minimumUnitValueCents?: number, enabled?: boolean, fetchImpl?: typeof fetch}} options */
export function createNativeTechsafeOrderSender({pool,readSecret,sourceInstanceId,
 environment='sandbox',minimumUnitValueCents=0,enabled=false,fetchImpl}={}){
 const credentials=createPrivateTechsafeCredentialReader({readSecret});
 const gate=createNativeOrderAuthority(pool,{sourceInstanceId,environment,minimumUnitValueCents});
 // Return every preflight connection BEFORE opening the owned certification
 // transaction, so a one-connection pool cannot deadlock on itself.
 const client={query:async(query,parameters)=>{
  const connection=await pool.connect();
  try{return await connection.query(query,parameters);}
  finally{connection.release();}
 }};
 const send=createTechsafeSalesOrderSender({client,...gate,
  digest:text=>createHash('sha256').update(text).digest('hex'),...(fetchImpl?{fetchImpl}:{})});
 return async ({connectionId,orderId}={})=>{
  if(enabled!==true)return held('integration_disabled');
  if(!uuid(connectionId)||!uuid(orderId))return held('invalid_binding');
  try{
   const result=await client.query(`SELECT organization_id,connection_generation FROM techsafe_source.integration_connections
    WHERE connection_id=$1 AND sales_order_id=$2 AND enabled=true AND status='active'`,[connectionId,orderId]);
   if(result.rows?.length!==1)return held('connection_not_active');
   const row=result.rows[0],generation=Number(row.connection_generation);
   const secret=await credentials({connectionId,organizationId:row.organization_id,generation});
   if(secret.ok!==true)return held('credentials_unavailable');
   return await send({connectionId,orderId,enabled:true,endpoint:secret.endpoint,
    allowedOrigin:'https://ywvrmjfhixgzdyfuhdpv.supabase.co',token:secret.token});
  }catch{return held('native_sender_unavailable');}
 };
}
