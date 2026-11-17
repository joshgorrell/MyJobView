import assert from 'node:assert/strict';
import {createWindowsCanaryServer} from '../../services/assist/windows-canary-host.mjs';
import {dealerDomain} from '../../services/assist/control-core.mjs';
const token='a'.repeat(48),org='00000000-0000-0000-0000-000000000001',domain=dealerDomain(org);
assert.throws(()=>createWindowsCanaryServer({os:'linux',token,verify:async()=>({})}),/windows_host_required/);
assert.throws(()=>createWindowsCanaryServer({os:'win32',token:'short',verify:async()=>({})}),/canary_token_required/);
assert.throws(()=>createWindowsCanaryServer({os:'win32',token}),/independent_windows_verifier_required/);
let called=0;
const server=createWindowsCanaryServer({os:'win32',token,verify:async request=>{called++;return {...request,checked_at:Date.now(),desktop_control:true,consent_enforced:true,cross_tenant_denied:true,windows_host_verified:true,actual_input_observed:true,denied_consent_observed:true,second_dealer_denied_observed:true};}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const url='http://127.0.0.1:'+server.address().port+'/v1/assist/probe';
 const body={organization_id:org,generation:1,mesh_domain:domain,mesh_id:'mesh/'+domain+'/abc',server_origin:'https://assist.example.com',probe_nonce:'00000000-0000-0000-0000-000000000003',probe_requested_at:Date.now()};
 const send=(headers={},payload=body)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(payload)});
 assert.equal((await send()).status,401);
 assert.equal((await send({authorization:'Bearer wrong'})).status,401);
 assert.equal(called,0);
 assert.equal((await send({authorization:'Bearer '+token})).status,200);
 assert.equal(called,1);
 assert.equal((await send({authorization:'Bearer '+token})).status,503);
 assert.equal(called,1);
 assert.equal((await send({authorization:'Bearer '+token},{...body,probe_nonce:'bad'})).status,503);
 assert.equal(called,1);
}finally{await new Promise(resolve=>server.close(resolve));}
console.log('Windows canary HTTP host requires Windows, strong token, real verifier and rejects replay');
