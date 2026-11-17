/** Read-only deployment configuration check; never starts a runtime or authorizes production. */
import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
import {stat} from 'node:fs/promises';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ASSIST_CONTROL_ORIGIN','ASSIST_CONTROL_TOKEN','ASSIST_PUBLIC_ORIGIN','ASSIST_CANARY_ORIGIN','ASSIST_CANARY_TOKEN','ASSIST_AGENT_CACHE_DIRECTORY','ASSIST_APPROVED_MESHCENTRAL_VERSION'];
function origin(value){try{const u=new URL(value);return u.protocol==='https:'&&u.origin===value&&!u.username&&!u.password;}catch{return false;}}
export function assessStagingConfiguration(env){
 const checks=required.map(key=>({key,pass:typeof env[key]==='string'&&env[key].trim().length>0}));
 for(const key of ['SUPABASE_URL','ASSIST_CONTROL_ORIGIN','ASSIST_PUBLIC_ORIGIN','ASSIST_CANARY_ORIGIN']){
  checks.push({key:key+'_https_origin',pass:origin(env[key])});
 }
 for(const key of ['ASSIST_CONTROL_TOKEN','ASSIST_CANARY_TOKEN']){
  checks.push({key:key+'_length',pass:typeof env[key]==='string'&&env[key].length>=32});
 }
 checks.push({key:'distinct_control_and_canary_secrets',pass:!!env.ASSIST_CONTROL_TOKEN&&!!env.ASSIST_CANARY_TOKEN&&env.ASSIST_CONTROL_TOKEN!==env.ASSIST_CANARY_TOKEN});
 checks.push({key:'distinct_ingress_origins',pass:origin(env.ASSIST_CONTROL_ORIGIN)&&origin(env.ASSIST_PUBLIC_ORIGIN)&&origin(env.ASSIST_CANARY_ORIGIN)&&new Set([env.ASSIST_CONTROL_ORIGIN,env.ASSIST_PUBLIC_ORIGIN,env.ASSIST_CANARY_ORIGIN]).size===3});
 checks.push({key:'absolute_agent_cache',pass:typeof env.ASSIST_AGENT_CACHE_DIRECTORY==='string'&&isAbsolute(env.ASSIST_AGENT_CACHE_DIRECTORY)});
 checks.push({key:'guest_pilot_disabled',pass:env.ASSIST_GUEST_PILOT_APPROVED!=='1'});
 checks.push({key:'arm64_pilot_disabled',pass:env.ASSIST_ARM64_PILOT_APPROVED!=='1'});
 checks.push({key:'version_not_implicitly_approved',pass:env.ASSIST_APPROVED_MESHCENTRAL_VERSION==='1.3.1'});
 return {status:checks.every(x=>x.pass)?'CONFIG_READY_FOR_STAGING_REVIEW':'BLOCKED',checks,windows_pilot_passed:false,production_approved:false};
}
export async function checkStagingPaths(env,inspect=stat){
 const paths=[['agent_cache_directory',env.ASSIST_AGENT_CACHE_DIRECTORY],['state_directory',env.ASSIST_STATE_DIRECTORY||'/var/lib/mjv-assist']];
 const checks=[];
 for(const [key,path] of paths){
  try{const info=await inspect(path);checks.push({key,pass:info.isDirectory()});}
  catch{checks.push({key,pass:false});}
 }
 return checks;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=assessStagingConfiguration(process.env);
 const paths=await checkStagingPaths(process.env);
 const all=[...config.checks,...paths];
 console.log(JSON.stringify({status:all.every(x=>x.pass)?'READY_FOR_STAGING_REVIEW':'BLOCKED',checks:all,windows_pilot_passed:false,production_approved:false},null,2));
 if(all.some(x=>!x.pass))process.exitCode=1;
}
