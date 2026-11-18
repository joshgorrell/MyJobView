// Read-only operator preflight. Does not start services, approve releases, or disclose secrets.
import {readFile,stat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function checkAssistReadiness({env=process.env,root=new URL('.',import.meta.url).pathname}={}){
 const checks=[];
 const add=(name,ok,detail)=>checks.push({name,status:ok?'pass':'block',detail});
 for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ASSIST_CONTROL_ORIGIN','ASSIST_CONTROL_TOKEN','ASSIST_PUBLIC_ORIGIN','ASSIST_CANARY_ORIGIN','ASSIST_CANARY_TOKEN','ASSIST_AGENT_CACHE_DIRECTORY','ASSIST_APPROVED_MESHCENTRAL_VERSION']){
  add(key,Boolean(env[key]),env[key]?'configured':'missing'); // never print secret values
 }
 for(const key of ['ASSIST_CONTROL_ORIGIN','ASSIST_PUBLIC_ORIGIN','ASSIST_CANARY_ORIGIN']){
  let ok=false;try{const u=new URL(env[key]);ok=u.protocol==='https:'&&u.origin===env[key]&&!u.username&&!u.password;}catch{}
  add(key+'_HTTPS',ok,ok?'valid HTTPS origin':'must be an exact HTTPS origin');
 }
 for(const key of ['ASSIST_CONTROL_TOKEN','ASSIST_CANARY_TOKEN'])add(key+'_LENGTH',(env[key]||'').length>=32,'requires at least 32 characters');
 let pkg;try{pkg=JSON.parse(await readFile(join(root,'node_modules/meshcentral/package.json'),'utf8'));}catch{}
 add('MESH_CENTRAL_INSTALLED',pkg?.name==='meshcentral',pkg?.version||'not installed');
 add('MESH_CENTRAL_VERSION_MATCH',Boolean(pkg?.version&&env.ASSIST_APPROVED_MESHCENTRAL_VERSION===pkg.version),'matching version is necessary, not proof of approval');
 let cache;try{cache=await realpath(env.ASSIST_AGENT_CACHE_DIRECTORY||'/nonexistent');const st=await stat(cache);if(!st.isDirectory())cache=undefined;}catch{}
 add('AGENT_CACHE_DIRECTORY',Boolean(cache),cache?'exists (hash/signature verification still required)':'missing/unreadable');
 add('WINDOWS_CANARY_REAL_PROOF',false,'requires independent real Windows desktop, consent and cross-dealer isolation testing; never auto-pass');
 return {ready:false,checks};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await checkAssistReadiness();
 console.log(JSON.stringify(report,null,2));
 process.exitCode=report.checks.some(c=>c.status==='block')?1:0;
}
