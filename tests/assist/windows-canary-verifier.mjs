import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createWindowsHarnessVerifier} from '../../services/assist/windows-canary-verifier.mjs';
assert.throws(()=>createWindowsHarnessVerifier({os:'linux',executable:'C:\\pilot.exe'}),/windows_harness_required/);
assert.throws(()=>createWindowsHarnessVerifier({os:'win32',executable:'pilot.exe'}),/absolute_windows_harness_exe_required/);
const makeSpawn=(response,exit=0)=>()=>{
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};
 let request='';
 child.stdin.on('data',chunk=>request+=chunk.toString());
 child.stdin.on('finish',()=>queueMicrotask(()=>{
  assert.equal(JSON.parse(request).probe_nonce,'test-nonce');
  child.stdout.end(response);child.emit('close',exit);
 }));
 return child;
};
const harnessBytes=Buffer.from('trusted-test-harness');
const expectedSha256=createHash('sha256').update(harnessBytes).digest('hex');
const config={os:'win32',executable:'/tmp/pilot.exe',expectedSha256,readExecutable:async()=>harnessBytes,checkFile:async()=>({isFile:()=>true})};
assert.throws(()=>createWindowsHarnessVerifier({os:'win32',executable:'/tmp/pilot.exe'}),/pinned_harness_sha256_required/);
await assert.rejects(createWindowsHarnessVerifier({...config,readExecutable:async()=>Buffer.from('modified')})( {probe_nonce:'test-nonce'}),/harness_hash_mismatch/);
const request={probe_nonce:'test-nonce'};
assert.deepEqual(await createWindowsHarnessVerifier({...config,spawnProcess:makeSpawn('{"desktop_control":true}')})(request),{desktop_control:true});
await assert.rejects(createWindowsHarnessVerifier({...config,spawnProcess:makeSpawn('{}',1)})(request),/harness_failed/);
await assert.rejects(createWindowsHarnessVerifier({...config,spawnProcess:makeSpawn('invalid')})(request),/harness_invalid_json/);
await assert.rejects(createWindowsHarnessVerifier({...config,checkFile:async()=>({isFile:()=>false})})(request),/harness_not_file/);
console.log('Windows executable harness bridge: no default verifier, isolated process, invalid and failed output rejected');
