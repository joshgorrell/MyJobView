import postgres from 'npm:postgres@3.4.7';
import {createNativeDispatchHandler} from '../_shared/techsafe-native-dispatch-handler.mjs';
import {createNativeTechsafeOrderSender} from '../_shared/techsafe-native-order-sender.mjs';
import {createDenoTechsafeSecretReader} from '../_shared/techsafe-environment-secret-reader.mjs';
import {createVaultTechsafeSecretReader} from '../_shared/techsafe-vault-secret-reader.mjs';
const environment=Deno.env.get('TECHSAFE_NATIVE_SENDER_ENVIRONMENT');
const enabled=Deno.env.get('TECHSAFE_NATIVE_SENDER_ENABLED')==='true'&&['sandbox','production'].includes(environment??'');
const databaseUrl=Deno.env.get('TECHSAFE_SOURCE_DATABASE_URL')??Deno.env.get('SUPABASE_DB_URL');
const projectUrl=Deno.env.get('SUPABASE_URL');
let sql:ReturnType<typeof postgres>|null=null,sourceInstanceId:string|null=null;
try{if(enabled&&databaseUrl&&projectUrl){
 const db=new URL(databaseUrl),project=new URL(projectUrl);
 if(['postgres:','postgresql:'].includes(db.protocol)&&project.protocol==='https:'){
  sourceInstanceId=project.hostname.split('.')[0];
  sql=postgres(databaseUrl,{ssl:'require',prepare:false,max:2,connect_timeout:10,idle_timeout:20,onnotice:()=>{}});
 }
}}catch{/* Keep disabled without logging private configuration. */}
const pool={connect:async()=>{
 if(!sql)throw Error('source_database_unavailable');const session=await sql.reserve();
 return {query:async(query:string,parameters:unknown[]=[])=>({rows:Array.from(await session.unsafe(query,parameters as never[]))}),release:()=>session.release()};
}};
const sendOrder=sql&&sourceInstanceId?createNativeTechsafeOrderSender({pool,sourceInstanceId,environment:environment!,
 enabled:true,readSecret:createVaultTechsafeSecretReader({pool,environment:environment!,readEnvironmentSecret:createDenoTechsafeSecretReader()})}):undefined;
Deno.serve(createNativeDispatchHandler({pool,sendOrder,environment,enabled:enabled&&Boolean(sql&&sendOrder)}));
