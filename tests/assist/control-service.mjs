import assert from 'node:assert/strict';
import {mkdtemp,rm,stat,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDecipheriv,createHash} from 'node:crypto';
import http from 'node:http';
import {createControlPlane,dealerDomain,validControlToken,validateControlJob} from '../../services/assist/control-core.mjs';
import {stageAgentCache} from '../../services/assist/prepare-agent-cache.mjs';
import {createStateStore} from '../../services/assist/state-store.mjs';
import {managementCookie,ensureLaptopGroup} from '../../services/assist/meshcentral-client.mjs';
import {runtimeConfig} from '../../services/assist/managed-runtime.mjs';
import {createControlServer,createCanaryProbe} from '../../services/assist/control-server.mjs';
const org='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const domain=dealerDomain(org);const job={organization_id:org,generation:1,desired_enabled:true,mesh_domain:domain,lease_token:other,lease_until:new Date(Date.now()+120000).toISOString()};
assert.equal(validateControlJob(job,org+':1'),job);
for(const invalid of [{...job,mesh_domain:'other'},{...job,generation:-1},{...job,organization_id:'../other'},{...job,lease_until:'2000-01-01'}])assert.throws(()=>validateControlJob(invalid,org+':1'));
assert.equal(validControlToken('Bearer '+'x'.repeat(40),'x'.repeat(40)),true);assert.equal(validControlToken('Bearer wrong','x'.repeat(40)),false);assert.equal(validControlToken('Bearer short','short'),false);
const key='ab'.repeat(80);const cookie=Buffer.from(managementCookie(domain,key).replaceAll('@','+').replaceAll('$','/'),'base64');
const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex').subarray(0,32),cookie.subarray(0,12));decipher.setAuthTag(cookie.subarray(12,28));
const identity=JSON.parse(Buffer.concat([decipher.update(cookie.subarray(28)),decipher.final()]).toString());
assert.equal(identity.userid,`user/${domain}/mjv-platform`);assert.equal(identity.domainid,domain);
assert.throws(()=>managementCookie('other',key));
const hash='A'.repeat(64);let groups=[],creates=0;
const request=async(_identity,cmd)=>{if(cmd.action==='meshes')return {meshes:groups};creates++;groups=[{_id:`mesh/${domain}/${hash}`,name:cmd.meshname,mtype:2,consent:cmd.consent,links:{[`user/${domain}/mjv-platform`]:{rights:0xffffffff}}}];return {meshid:groups[0]._id};};
await ensureLaptopGroup({domain},request);await ensureLaptopGroup({domain},request);assert.equal(creates,1);
await assert.rejects(ensureLaptopGroup({domain},async()=>({meshes:[{_id:`mesh/${dealerDomain(other)}/${hash}`}]})),/foreign_domain/);
await assert.rejects(ensureLaptopGroup({domain},async()=>({meshes:[{...groups[0],consent:0}]})),/consent/);
const config=runtimeConfig({domain,port:22000,keyHex:key},'https://assist.example.com');
assert.equal(config.settings.sessionSecure,true);assert.equal(config.settings.portBind,'127.0.0.1');assert.equal(config.settings.exactPorts,true);assert.equal(config.settings.selfUpdate,false);
assert.equal(config.domains[domain].newAccounts,false);assert.equal(config.domains[domain].userConsentFlags.desktopprompt,true);
assert.throws(()=>runtimeConfig({domain},'http://assist.example.com'));
const directory=await mkdtemp(join(tmpdir(),'mjv-assist-control-'));const store=createStateStore(directory);const release=await store.lock();
await assert.rejects(createStateStore(directory).lock(),/locked/);
let lease=true,stopped=true,ensureCount=0,active=0,maxActive=0;
const runtime={
 async ensure(j,check){ensureCount++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,5));await check();stopped=false;active--;return {meshId:`mesh/${j.mesh_domain}/${hash}`,server_origin:'https://assist.example.com',windows_download_url:`https://assist.example.com/${j.mesh_domain}/meshagents?meshid=${hash}&id=4`};},
 async stop(){stopped=true;},async isStopped(){return stopped;},
};
let verifierBusy=false;
const probe=async request=>{
 if(verifierBusy)throw Object.assign(new Error('test verifier in use'),{code:'canary_fixture_busy'});
 return {...request,checked_at:Date.now(),desktop_control:true,consent_enforced:true,cross_tenant_denied:true};
};
runtime.target=()=>({port:22000});
const plane=createControlPlane({store,runtime,validateLease:async()=>lease,probe});
try{
 assert.equal(plane.canServe(domain),false);
 const result=await plane.reconcile(job);assert.equal(plane.canServe(domain),true);assert.equal(result.verified,true);assert.equal((await plane.checkHealth(org)).healthy,true);assert.equal((await store.read(org)).phase,'verified');
 verifierBusy=true;
 assert.equal(await plane.checkHealth(org),null);
 assert.equal(plane.canServe(domain),true,'Another dealer using the verifier keeps this dealer online');
 assert.equal((await store.read(org)).phase,'verified');
 verifierBusy=false;
 await Promise.all([plane.reconcile(job),plane.reconcile(job)]);assert.equal(maxActive,1,'Same dealer side effects serialize');
 assert.equal((await stat(join(directory,org+'.json'))).mode&0o777,0o600);
 await assert.rejects(store.read('../bad'),/invalid_organization/);
 await assert.rejects(store.write(org,{organization_id:other}),/mismatch/);
 const off={...job,generation:2,desired_enabled:false};assert.equal((await plane.reconcile(off)).sessions_revoked,true);assert.equal(stopped,true);
 await assert.rejects(plane.reconcile(job),/stale_generation/);assert.equal((await store.read(org)).generation,2);
 lease=false;await assert.rejects(plane.reconcile({...job,generation:3}),/stale_lease/);lease=true;
 const failPlane=createControlPlane({store,runtime,validateLease:async()=>true,probe:async()=>({desktop_control:true,organization_id:other})});
 await assert.rejects(failPlane.reconcile({...job,generation:3}),/reconcile_failed/);assert.equal(stopped,true);assert.equal((await store.read(org)).phase,'failed');assert.equal(failPlane.canServe(domain),false);
 await plane.reconcile({...job,generation:3});
 assert.equal((await failPlane.checkHealth(org)).healthy,false,'Failed live canary closes the runtime');
 assert.equal(stopped,true);
 let checks=0;const staleDuringProvision=createControlPlane({store,runtime,validateLease:async()=>++checks<4,probe});
 await assert.rejects(staleDuringProvision.reconcile({...job,generation:4}),/stale_lease/);assert.equal(stopped,true);assert.equal((await store.read(org)).phase,'failed');
 const brokenStop=createControlPlane({store,runtime:{...runtime,isStopped:async()=>false},validateLease:async()=>true,probe});
 await assert.rejects(brokenStop.reconcile({...off,generation:5}),/reconcile_failed/);assert.notEqual((await store.read(org)).phase,'off');
 let cachedProof;
 const replay=createControlPlane({store,runtime,validateLease:async()=>true,probe:async body=>cachedProof||(cachedProof=await probe(body))});
 await replay.reconcile({...job,generation:6});
 assert.equal((await replay.checkHealth(org)).healthy,false,'A cached proof cannot satisfy a new health nonce');
 // A separate dealer's journal is unaffected by failed operations.
 await store.write(other,{organization_id:other,generation:9,phase:'off'});assert.equal((await store.read(org)).generation,6);
 assert.equal((await store.list()).length,2);
}finally{await release();await rm(directory,{recursive:true,force:true});}
// Exercise the real HTTP handler using loopback sockets. No provider credentials are sent to public paths.
const cacheRoot=await mkdtemp(join(tmpdir(),'mjv-agent-cache-test-'));
try{
 const source=join(cacheRoot,'source');await mkdir(source);const bytes=Buffer.from('verified agent fixture');await writeFile(join(source,'agent.exe'),bytes);
 const manifest={schemaVersion:1,releases:[{tag:'test-1',files:[{filename:'agent.exe',size:bytes.length,sha384:createHash('sha384').update(bytes).digest('hex')}]}]};
 const destination=join(cacheRoot,'published');await stageAgentCache({manifest,source,destination,runtimeVersion:'test'});
 assert.deepEqual(await readFile(join(destination,'test-1','agent.exe')),bytes);
 await assert.rejects(stageAgentCache({manifest,source,destination,runtimeVersion:'test'}),/exists/);
 await writeFile(join(source,'agent.exe'),'tampered');
 await assert.rejects(stageAgentCache({manifest,source,destination:join(cacheRoot,'bad'),runtimeVersion:'test'}),/mismatch/);
 await assert.rejects(stat(join(cacheRoot,'bad')));
}finally{await rm(cacheRoot,{recursive:true,force:true});}
const token='t'.repeat(40);let applied=0;
const upstream=http.createServer((request,response)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({url:request.url,authorization:request.headers.authorization||null,meshAuth:request.headers['x-meshauth']||null,proto:request.headers['x-forwarded-proto']}));});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));let serving=true,verified=false;const sockets=new Set();
const server=createControlServer({token,plane:{canServe:()=>verified,reconcile:async()=>{applied++;return {status:'applied'};}},runtime:{target:d=>serving&&d===domain?{port:upstream.address().port,sockets}:null},guests:{guest:async()=>({ended:true})}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
assert.equal((await fetch(url+'/v1/guest',{method:'POST',body:'{}'})).status,401);
assert.equal((await fetch(url+'/v1/guest',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({organization_id:org,operation:'end',invite_id:org,claim_token:'0'.repeat(64)})})).status,200);
try{
 assert.equal((await fetch(url+'/v1/dealers/reconcile',{method:'POST',body:JSON.stringify(job)})).status,401);
 assert.equal((await fetch(url+'/v1/dealers/reconcile',{method:'POST',headers:{authorization:'Bearer '+token,'idempotency-key':org+':1'},body:JSON.stringify(job)})).status,200);
 assert.equal(applied,1);
 assert.equal((await fetch(url+'/v1/dealers/reconcile',{method:'POST',headers:{authorization:'Bearer '+token},body:'not json'})).status,400);
 assert.equal((await fetch(url+'/'+domain+'/test')).status,404);
 const pilot=createControlServer({pilotDomain:domain,runtime:{target:()=>({port:upstream.address().port,sockets})}});
 await new Promise(r=>pilot.listen(0,'127.0.0.1',r));const pilotUrl='http://127.0.0.1:'+pilot.address().port;
 try{
  assert.equal((await fetch(pilotUrl+'/'+domain+'/test')).status,200);
  assert.equal((await fetch(pilotUrl+'/'+dealerDomain(other)+'/test')).status,404);
  assert.equal((await fetch(pilotUrl+'/v1/dealers/reconcile',{method:'POST'})).status,404);
 }finally{pilot.closeAllConnections();await new Promise(r=>pilot.close(r));}
 verified=true;
 const proxied=await fetch(url+'/'+domain+'/test',{headers:{authorization:'Bearer must-not-forward','x-meshauth':'must-not-forward'}});
 const echoed=await proxied.json();assert.equal(echoed.authorization,null);assert.equal(echoed.meshAuth,null);assert.equal(echoed.proto,'https');
 serving=false;for(const socket of sockets)socket.destroy();
 assert.equal((await fetch(url+'/'+domain+'/meshagents?meshid=old&id=4')).status,404);
 assert.equal((await fetch(url+'/')).status,404);
}finally{server.closeAllConnections();upstream.closeAllConnections();await new Promise(r=>server.close(r));await new Promise(r=>upstream.close(r));}
// Exercise authenticated support API routing independently of the Edge Function.
{
 const context={organization_id:org,actor_id:other,auth_session_id:org,token_exp:Date.now()/1000+3600};
 const seen=[];let supportResult={devices:[]},staffResult={available:true};
 const api=createControlServer({token,plane:{reconcile:async()=>({})},runtime:{target:()=>null},
  broker:{handle:async body=>{seen.push(['broker',body]);return supportResult;}},
  guests:{guest:async()=>({}),staff:async body=>{seen.push(['staff',body]);return staffResult;}}
 });
 await new Promise(r=>api.listen(0,'127.0.0.1',r));const endpoint='http://127.0.0.1:'+api.address().port+'/v1/support';
 const post=(body,authorization='Bearer '+token)=>fetch(endpoint,{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await post({operation:'devices',...context},'Bearer wrong')).status,401);
  assert.equal((await post({operation:'devices',...context})).status,200);
  assert.equal(seen.at(-1)[0],'broker');
  assert.equal((await post({operation:'device_remove',...context,device_id:'x'})).status,200);
  assert.equal((await post({operation:'connect',...context,device_id:'x'})).status,200);
  assert.equal((await post({operation:'touch',...context,session_id:org})).status,200);
  assert.equal((await post({operation:'end',...context,session_id:org})).status,200);
  assert.equal((await post({operation:'invite_capability',...context})).status,200);
  assert.equal(seen.at(-1)[0],'staff');
  assert.equal((await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'not json'})).status,400);
  assert.equal((await post({operation:'devices',...context,token_exp:1})).status,400);
  assert.equal((await fetch(endpoint,{method:'GET'})).status,405);
 }finally{api.closeAllConnections();await new Promise(r=>api.close(r));}
}
const canaryEnv={ASSIST_CANARY_ORIGIN:'https://canary.example.com',ASSIST_CANARY_TOKEN:'c'.repeat(40)};
const canary=createCanaryProbe(canaryEnv,async(_url,options)=>{assert.equal(options.redirect,'error');return new Response(JSON.stringify(await probe(job)));});
assert.equal((await canary(job)).desktop_control,true);
assert.throws(()=>createCanaryProbe({...canaryEnv,ASSIST_CANARY_ORIGIN:'http://canary.example.com'}));
console.log('Assist control: durable fencing, serial operations, native group ownership/consent, private tokens, off revocation, canary gates, HTTP authentication and unavailable routes pass');
