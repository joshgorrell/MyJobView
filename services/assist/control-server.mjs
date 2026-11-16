import http from 'node:http';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {createStateStore} from './state-store.mjs';
import {createManagedRuntime} from './managed-runtime.mjs';
import {createControlPlane,validControlToken,validateControlJob} from './control-core.mjs';
import {createHttpDependencies} from './activation-worker.mjs';

async function readBody(request){let text='';for await(const chunk of request){text+=chunk;if(Buffer.byteLength(text)>8192)throw new Error('oversized_request');}return JSON.parse(text);}
function respond(response,status,value){response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));}
export function createControlServer({plane,runtime,token}){
 if(typeof token!=='string'||token.length<32)throw new Error('weak_control_token');
 const target=request=>{
  if(!request.url.startsWith('/'))return null;
  const raw=request.url.split('?')[0];const path=new URL(request.url,'http://localhost').pathname;
  if(raw!==path||path.includes('\\')||/%2f|%5c|%2e/i.test(raw))return null;
  const match=path.match(/^\/(mjv-[a-f0-9]{32})\//);return match?runtime.target(match[1]):null;
 };
 const server=http.createServer(async(request,response)=>{
  if(request.url==='/v1/dealers/reconcile'){
   if(request.method!=='POST')return respond(response,405,{error:'method_not_allowed'});
   if(!validControlToken(request.headers.authorization,token))return respond(response,401,{error:'unauthorized'});
   let job;try{job=validateControlJob(await readBody(request),request.headers['idempotency-key']);}catch{return respond(response,400,{error:'invalid_request'});}
   try{return respond(response,200,await plane.reconcile(job));}
   catch{return respond(response,503,{error:'reconciliation_unavailable'});}
  }
  const destination=target(request);if(!destination)return respond(response,404,{error:'unavailable'});
  // MeshCentral has no reason to receive platform bearer credentials from public routes.
  const headers={...request.headers,'x-forwarded-proto':'https','x-forwarded-for':request.headers['x-forwarded-for']||request.socket.remoteAddress,'x-forwarded-host':request.headers.host};
  delete headers.authorization;delete headers['x-meshauth'];delete headers['idempotency-key'];
  const upstream=http.request({host:'127.0.0.1',port:destination.port,path:request.url,method:request.method,headers},incoming=>{
   response.writeHead(incoming.statusCode||502,incoming.headers);incoming.pipe(response);
  });
  if(!destination.sockets.has(request.socket)){destination.sockets.add(request.socket);request.socket.once('close',()=>destination.sockets.delete(request.socket));}
  upstream.once('error',()=>{if(!response.headersSent)respond(response,502,{error:'unavailable'});else response.destroy();});
  request.once('aborted',()=>upstream.destroy());response.once('close',()=>upstream.destroy());request.pipe(upstream);
 });
 server.on('upgrade',(request,socket,head)=>{
  const destination=target(request);if(!destination){socket.destroy();return;}
  destination.sockets.add(socket);socket.once('close',()=>destination.sockets.delete(socket));
  const upstream=net.connect(destination.port,'127.0.0.1');destination.sockets.add(upstream);
  const cleanup=()=>{socket.destroy();upstream.destroy();destination.sockets.delete(upstream);};
  upstream.once('error',cleanup);socket.once('error',cleanup);socket.once('close',cleanup);upstream.once('close',cleanup);
  upstream.once('connect',()=>{
   const headers={...request.headers,'x-forwarded-proto':'https','x-forwarded-for':request.headers['x-forwarded-for']||request.socket.remoteAddress,'x-forwarded-host':request.headers.host};
   delete headers.authorization;delete headers['x-meshauth'];delete headers['idempotency-key'];
   upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`+Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');
   if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
  });
 });
 server.headersTimeout=10000;server.requestTimeout=35000;
 return server;
}

export function createCanaryProbe(env,fetchImpl=fetch){
 const origin=new URL(env.ASSIST_CANARY_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.ASSIST_CANARY_ORIGIN||!env.ASSIST_CANARY_TOKEN||env.ASSIST_CANARY_TOKEN.length<32)throw new Error('invalid_canary_configuration');
 return async body=>{
  const response=await fetchImpl(origin.origin+'/v1/assist/probe',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json',authorization:'Bearer '+env.ASSIST_CANARY_TOKEN},body:JSON.stringify(body)});
  if(!response.ok)throw new Error('canary_unavailable');const text=await response.text();if(text.length>32768)throw new Error('canary_oversized');return JSON.parse(text);
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let server,runtime,release,monitor;
 try{
  const env=process.env;const dependencies=createHttpDependencies(env);
  const store=createStateStore(env.ASSIST_STATE_DIRECTORY||'/var/lib/mjv-assist');release=await store.lock();
  const requeue=(id,generation)=>dependencies.rpc('requeue_assist_runtime',{p_organization_id:id,p_generation:generation});
  runtime=createManagedRuntime({store,entry:env.ASSIST_MESHCENTRAL_ENTRY||new URL('./node_modules/meshcentral/meshcentral.js',import.meta.url).pathname,
   approvedVersion:env.ASSIST_APPROVED_MESHCENTRAL_VERSION,publicOrigin:env.ASSIST_PUBLIC_ORIGIN,agentCacheDirectory:env.ASSIST_AGENT_CACHE_DIRECTORY,onExit:requeue});
  if(!env.ASSIST_AGENT_CACHE_DIRECTORY)throw new Error('approved_agent_cache_required');
  await runtime.verifyVersion();
  const plane=createControlPlane({store,runtime,probe:createCanaryProbe(env),validateLease:job=>dependencies.rpc('validate_assist_activation_lease',{
   p_organization_id:job.organization_id,p_generation:job.generation,p_lease_token:job.lease_token})});
  server=createControlServer({plane,runtime,token:env.ASSIST_CONTROL_TOKEN});
  const port=Number(env.ASSIST_CONTROL_PORT||8443);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('invalid_control_port');
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  // On restart, old 'verified' journals do not imply a running or healthy child process.
  for(const state of await store.list()){if(state.desired_enabled)await requeue(state.organization_id,state.generation);}
  let checking=false;
  monitor=setInterval(async()=>{
   if(checking)return;checking=true;
   try{for(const state of await store.list()){
    const result=await plane.checkHealth(state.organization_id);
    if(result && !result.healthy){await requeue(result.organization_id,result.generation);console.error('Assist canary failed; dealer recovery queued');}
   }}catch{console.error('Assist health check failed; operator attention required');}finally{checking=false;}
  },15*60*1000);
  console.log('MJV Assist control service listening on loopback');
  const stop=async()=>{clearInterval(monitor);const closed=new Promise(r=>server.close(r));server.closeAllConnections();await runtime.stopAll();await closed;await release();process.exit(0);};
  process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
 }catch{
  clearInterval(monitor);if(server)server.close();if(runtime)await runtime.stopAll().catch(()=>{});if(release)await release();
  console.error('MJV Assist control service could not start; verify platform configuration');process.exitCode=1;
 }
}
