import postgres from 'npm:postgres@3.4.7';
import {createClient} from 'npm:@supabase/supabase-js@2.94.0';
import {createNativeTechsafeSendHandler} from '../_shared/techsafe-native-send-handler.mjs';
import {createNativeTechsafeOrderSender} from '../_shared/techsafe-native-order-sender.mjs';
import {createTechsafeServiceAuthenticator} from '../_shared/techsafe-service-auth.mjs';
import {createDenoTechsafeSecretReader} from '../_shared/techsafe-environment-secret-reader.mjs';

// Opt-in backend runtime. SQL credentials must be private SQL credentials,
// never an anon/service-role API key or a request-supplied value.
const enabled=Deno.env.get('TECHSAFE_NATIVE_SENDER_ENABLED')==='true';
// Supabase's built-in SQL URL stays on the server; no password copy is needed.
const databaseUrl=Deno.env.get('TECHSAFE_SOURCE_DATABASE_URL')??Deno.env.get('SUPABASE_DB_URL');
const supabaseUrl=Deno.env.get('SUPABASE_URL');
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
let sql: ReturnType<typeof postgres>|null=null;
try{
 if(enabled&&databaseUrl&&supabaseUrl&&serviceKey){
  const url=new URL(databaseUrl);
  if(['postgres:','postgresql:'].includes(url.protocol))sql=postgres(databaseUrl,{
   ssl:'require',prepare:false,max:2,connect_timeout:10,idle_timeout:20,onnotice:()=>{}});
 }
}catch{/* Keep disabled without logging secrets. */}
const configured=enabled&&sql!==null&&Boolean(supabaseUrl&&serviceKey);
const admin=configured?createClient(supabaseUrl!,serviceKey!,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const pool={connect:async()=>{
 if(!sql)throw Error('source_database_unavailable');
 const session=await sql.reserve();
 return {query:async(query:string,parameters:unknown[]=[])=>({rows:Array.from(await session.unsafe(query,parameters as never[]))}),
  release:()=>session.release()};
}};
const sender=configured?createNativeTechsafeOrderSender({pool,sourceInstanceId:new URL(supabaseUrl!).hostname.split('.')[0],
 environment:'production',readSecret:createDenoTechsafeSecretReader(),enabled:true}):undefined;
const handler=createNativeTechsafeSendHandler({enabled:configured,
 authenticateService:createTechsafeServiceAuthenticator(serviceKey),
 authenticateAdmin:async(authorization:string|null)=>{
  if(!admin||!authorization?.startsWith('Bearer '))return null;
  const {data,error}=await admin.auth.getUser(authorization.slice(7));
  if(error||!data.user)return null;
  const profile=await admin.from('profiles').select('organization_id,role').eq('id',data.user.id).maybeSingle();
  if(profile.error||profile.data?.role!=='admin')return null;
  return {verified:true,userId:data.user.id,organizationId:profile.data.organization_id,role:profile.data.role};
 },
 readConnectionOrganization:async({connectionId,orderId}:{connectionId:string;orderId:string})=>{
  const client=await pool.connect();
  try{const result=await client.query(`SELECT organization_id FROM techsafe_source.integration_connections
    WHERE connection_id=$1 AND sales_order_id=$2`,[connectionId,orderId]);
   return result.rows.length===1?result.rows[0].organization_id:null;
  }finally{client.release();}
 },sendOrder:sender});
Deno.serve(handler);
