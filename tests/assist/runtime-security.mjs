import assert from 'node:assert/strict';
import {readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {prepareGuestRuntime,verifyGuestRuntime} from '../../services/assist/guest-runtime-security.mjs';
import {patchRuntimeSource, verifyRuntimeSecurity} from '../../services/assist/runtime-security.mjs';

const entry=resolve('services/assist/node_modules/meshcentral/meshcentral.js');
const source=await readFile(entry);
await verifyRuntimeSecurity(entry);
await prepareGuestRuntime(resolve('services/assist/node_modules/meshcentral'));
await verifyGuestRuntime(resolve('services/assist/node_modules/meshcentral'));
const agentSource=await readFile(resolve('services/assist/node_modules/meshcentral/meshagent.js'),'utf8');
assert.ok(agentSource.includes("mesh.name.startsWith('MJV guest ')"));
assert.ok(agentSource.includes('obj.close(1); return null;'));
assert.deepEqual(patchRuntimeSource(source),source,'Preparation is idempotent');
const original=Buffer.from(source.toString('utf8')
 .replace("'compression@1.8.2'","'compression@1.8.1'")
 .replace("'node-forge@1.4.3'","'node-forge@1.4.0'")
 .replace("'node-windows@1.0.0-beta.8'","'node-windows@0.1.14'")
 .replace("function InstallModuleEx(modulenames, args, func) { throw new Error('MJV runtime dependencies must be prepared offline');",'function InstallModuleEx(modulenames, args, func) {'));
assert.deepEqual(patchRuntimeSource(original),source,'Exact upstream source is reproducibly prepared');
assert.throws(()=>patchRuntimeSource(Buffer.concat([source,Buffer.from('\n')])),/unexpected_runtime_source/);
// Old startup pins and enabled fallback must not reappear after an offline npm ci.
assert(!source.includes(Buffer.from("'compression@1.8.1'")));
assert(!source.includes(Buffer.from("'node-forge@1.4.0'")));
assert(!source.includes(Buffer.from("'node-windows@0.1.14'")));
assert(source.includes(Buffer.from("'node-windows@1.0.0-beta.8'")));
assert(source.includes(Buffer.from("function InstallModuleEx(modulenames, args, func) { throw new Error('MJV runtime dependencies must be prepared offline');")));
const require=createRequire(entry);
assert.equal(typeof require('glob').glob,'function');
assert.equal(require('qs').parse('dealer=one').dealer,'one');
const dir=await mkdtemp(join(tmpdir(),'mjv-runtime-security-'));
try{
 const agent=await readFile(resolve('services/assist/node_modules/meshcentral/meshagent.js'));
 const user=await readFile(resolve('services/assist/node_modules/meshcentral/meshuser.js'));
 await writeFile(join(dir,'meshagent.js'),agent);await writeFile(join(dir,'meshuser.js'),user);await verifyGuestRuntime(dir);
 await writeFile(join(dir,'meshagent.js'),Buffer.concat([agent,Buffer.from('tampered')]));
 await assert.rejects(verifyGuestRuntime(dir),/guest_runtime_preparation_required/);
 await assert.rejects(prepareGuestRuntime(dir),/unexpected_guest_runtime_source/);
 const unprepared=join(dir,'original.js');await writeFile(unprepared,original);
 await assert.rejects(verifyRuntimeSecurity(unprepared),/runtime_security_preparation_required/);
 const changed=join(dir,'meshcentral.js');await writeFile(changed,Buffer.concat([source,Buffer.from('\n')]));
 await assert.rejects(verifyRuntimeSecurity(changed),/runtime_security_preparation_required/);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('Assist runtime security: idempotent preparation, source tampering and dependency APIs pass');
