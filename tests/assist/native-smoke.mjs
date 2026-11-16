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
 // Exercise the real Express/Handlebars login renderer after dependency updates.
 for(const state of [a,b]){
  const page=await fetch(`http://127.0.0.1:${state.port}/mjv-${state.organization_id.replaceAll('-','')}/`);
  assert.equal(page.status,200);assert.match(await page.text(),/<!DOCTYPE html>/i);
 }
 const management={port:a.port,domain:'mjv-00000000000000000000000000000001',keyHex:a.keyHex};
 const temporary='mjv-session-00000000000000000000000000000009';
 await meshCommand(management,{action:'adduser',username:temporary,pass:'NativeSmokeOnly!Aa123456789',siteadmin:0});
 const users=(await meshCommand(management,{action:'users'})).users;
 const temporaryUser=users.find(u=>u._id===`user/${management.domain}/${temporary}`);assert.ok(temporaryUser);assert.ok(!temporaryUser.siteadmin);assert.equal(Object.keys(temporaryUser.links||{}).length,0);
 await runtime.revokeViewer(org,temporary);
 assert.equal((await meshCommand(management,{action:'users'})).users.some(u=>u._id===temporaryUser._id),false,'Native temporary account is actually deleted');
 await assert.rejects(meshCommand({port:a.port,domain:'mjv-00000000000000000000000000000001',keyHex:b.keyHex},{action:'meshes'},{timeout:1000}));
 const guest=await runtime.createGuestGroup(org,'00000000000000000000000000000007');
 assert.match(guest.download_url,/installflags=1/);
 assert.notEqual(guest.meshId,result.meshId,'Guest is isolated from permanent technician enrollment');
 await assert.rejects(runtime.deleteGuestGroup(other,guest.meshId),/invalid_guest_group/);
 await assert.rejects(runtime.deleteGuestGroup(org,result.meshId),/invalid_guest_group/);
 await runtime.deleteGuestGroup(org,guest.meshId);
 assert.ok(!(await meshCommand(management,{action:'meshes'})).meshes.some(m=>m._id===guest.meshId&&!m.deleted));
 const orphan=await runtime.createGuestGroup(org,'00000000000000000000000000000008');
 await runtime.stop(org);assert.equal(await runtime.isStopped(org),true);
 assert.equal(runtime.target('mjv-00000000000000000000000000000001'),null);
 assert.ok(runtime.target('mjv-00000000000000000000000000000002'),'Stopping one dealer leaves the other running');
 const again=await runtime.ensure({organization_id:org,generation:2},async()=>{});assert.equal(again.meshId,result.meshId,'Re-enable retains native device ownership');
 const fresh=await store.read(org);const restarted={port:fresh.port,domain:management.domain,keyHex:fresh.keyHex};
 assert.ok(!(await meshCommand(restarted,{action:'meshes'})).meshes.some(m=>m._id===orphan.meshId&&!m.deleted),'Orphaned guest groups are removed before restart ingress');
 console.log('Real MeshCentral smoke: bootstrap, isolated management login, native group/consent, idempotence, stop and re-enable pass');
}catch(error){console.error(diagnostics.replace(/auth=[^&\s]+/g,'auth=[redacted]'));throw error;}finally{await runtime.stopAll();await rm(dir,{recursive:true,force:true});}
