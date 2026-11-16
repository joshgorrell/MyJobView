// Real local MeshCentral metadata smoke. This does not certify Windows desktop control.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createStateStore} from '../../services/assist/state-store.mjs';
import {meshCommand} from '../../services/assist/meshcentral-client.mjs';
import {createManagedRuntime} from '../../services/assist/managed-runtime.mjs';
const dir=await mkdtemp(join(tmpdir(),'mjv-meshcentral-smoke-'));const store=createStateStore(dir);
const org='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
await store.write(org,{organization_id:org,generation:1,desired_enabled:true,phase:'applying'});
let diagnostics='';const runtime=createManagedRuntime({store,entry:resolve('services/assist/node_modules/meshcentral/meshcentral.js'),approvedVersion:'1.3.1',publicOrigin:'https://assist.example.invalid',diagnostic:text=>{diagnostics=(diagnostics+text).slice(-8192);}});
try{
 await runtime.verifyVersion();
 const result=await runtime.ensure({organization_id:org,generation:1},async()=>{});
 assert.match(result.meshId,/^mesh\/mjv-00000000000000000000000000000001\//);
 const repeat=await runtime.ensure({organization_id:org,generation:1},async()=>{});
 assert.equal(repeat.meshId,result.meshId,'Repeated ensure retains the native group');
 assert.ok(runtime.target('mjv-00000000000000000000000000000001'));
 assert.equal(runtime.target('mjv-00000000000000000000000000000002'),null);
 await store.write(other,{organization_id:other,generation:1,desired_enabled:true,phase:'applying'});
 const second=await runtime.ensure({organization_id:other,generation:1},async()=>{});
 assert.notEqual(second.meshId,result.meshId);
 const a=await store.read(org),b=await store.read(other);assert.notEqual(a.port,b.port);assert.notEqual(a.keyHex,b.keyHex);
 await assert.rejects(meshCommand({port:a.port,domain:'mjv-00000000000000000000000000000001',keyHex:b.keyHex},{action:'meshes'},{timeout:1000}));
 await runtime.stop(org);assert.equal(await runtime.isStopped(org),true);
 assert.equal(runtime.target('mjv-00000000000000000000000000000001'),null);
 assert.ok(runtime.target('mjv-00000000000000000000000000000002'),'Stopping one dealer leaves the other running');
 const again=await runtime.ensure({organization_id:org,generation:2},async()=>{});assert.equal(again.meshId,result.meshId,'Re-enable retains native device ownership');
 console.log('Real MeshCentral smoke: bootstrap, isolated management login, native group/consent, idempotence, stop and re-enable pass');
}catch(error){console.error(diagnostics.replace(/auth=[^&\s]+/g,'auth=[redacted]'));throw error;}finally{await runtime.stopAll();await rm(dir,{recursive:true,force:true});}
