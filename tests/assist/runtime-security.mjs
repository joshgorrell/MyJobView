import assert from 'node:assert/strict';
import {readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {patchRuntimeSource, verifyRuntimeSecurity} from '../../services/assist/runtime-security.mjs';

const entry=resolve('services/assist/node_modules/meshcentral/meshcentral.js');
const source=await readFile(entry);
await verifyRuntimeSecurity(entry);
assert.deepEqual(patchRuntimeSource(source),source,'Preparation is idempotent');
const original=Buffer.from(source.toString('utf8')
 .replace("'compression@1.8.2'","'compression@1.8.1'")
 .replace("'node-forge@1.4.3'","'node-forge@1.4.0'")
 .replace("function InstallModuleEx(modulenames, args, func) { throw new Error('MJV runtime dependencies must be prepared offline');",'function InstallModuleEx(modulenames, args, func) {'));
assert.deepEqual(patchRuntimeSource(original),source,'Exact upstream source is reproducibly prepared');
assert.throws(()=>patchRuntimeSource(Buffer.concat([source,Buffer.from('\n')])),/unexpected_runtime_source/);
// Old startup pins and enabled fallback must not reappear after an offline npm ci.
assert(!source.includes(Buffer.from("'compression@1.8.1'")));
assert(!source.includes(Buffer.from("'node-forge@1.4.0'")));
assert(source.includes(Buffer.from("function InstallModuleEx(modulenames, args, func) { throw new Error('MJV runtime dependencies must be prepared offline');")));
const require=createRequire(entry);
assert.equal(typeof require('glob').glob,'function');
assert.equal(require('qs').parse('dealer=one').dealer,'one');
const dir=await mkdtemp(join(tmpdir(),'mjv-runtime-security-'));
try{
 const unprepared=join(dir,'original.js');await writeFile(unprepared,original);
 await assert.rejects(verifyRuntimeSecurity(unprepared),/runtime_security_preparation_required/);
 const changed=join(dir,'meshcentral.js');await writeFile(changed,Buffer.concat([source,Buffer.from('\n')]));
 await assert.rejects(verifyRuntimeSecurity(changed),/runtime_security_preparation_required/);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('Assist runtime security: idempotent preparation, source tampering and dependency APIs pass');
