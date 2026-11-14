import postgres from 'npm:postgres@3.4.7';
import {createSandboxInvocationHandler} from '../_shared/techsafe-sandbox-invocation.mjs';
import {createNativeTechsafeOrderSender} from '../_shared/techsafe-native-order-sender.mjs';
import {createDenoTechsafeSecretReader} from '../_shared/techsafe-environment-secret-reader.mjs';

// Custom one-use capability authentication, never anonymous sender authority.
// The normal JWT-authenticated sender remains unchanged.
const environment=Deno.env.get('TECHSAFE_NATIVE_SENDER_ENVIRONMENT');
const enabled=Deno.env.get('TECHSAFE_NATIVE_SENDER_ENABLED')==='true'&&environment==='sandbox';
const databaseUrl=Deno.env.get('TECHSAFE_SOURCE_DATABASE_URL')??Deno.env.get('SUPABASE_DB_URL');
const projectUrl=Deno.env.get('SUPABASE_URL');
let sql:ReturnType<typeof postgres>|null=null,sourceInstanceId:string|null=null;
try{
 if(enabled&&databaseUrl&&projectUrl){
  const db=new URL(databaseUrl),project=new URL(projectUrl);
  if(['postgres:','postgresql:'].includes(db.protocol)&&project.protocol==='https:'){
   sourceInstanceId=project.hostname.split('.')[0];
   sql=postgres(databaseUrl,{ssl:'require',prepare:false,max:2,connect_timeout:10,idle_timeout:20,onnotice:()=>{}});
  }
 }
}catch{/* Disabled without logging private configuration. */}
const pool={connect:async()=>{
 if(!sql)throw Error('source_database_unavailable');
 const session=await sql.reserve();
 return {query:async(query:string,parameters:unknown[]=[])=>({rows:Array.from(await session.unsafe(query,parameters as never[]))}),
  release:()=>session.release()};
}};
const sendOrder=sql&&sourceInstanceId?createNativeTechsafeOrderSender({pool,sourceInstanceId,
 environment:'sandbox',enabled:true,readSecret:createDenoTechsafeSecretReader()}):undefined;
Deno.serve(createSandboxInvocationHandler({pool,sendOrder,environment,enabled:enabled&&Boolean(sql&&sendOrder)}));
