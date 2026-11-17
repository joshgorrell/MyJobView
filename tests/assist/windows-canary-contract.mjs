import assert from 'node:assert/strict';
import {createWindowsCanaryHandler,validateCanaryRequest} from '../../services/assist/windows-canary-contract.mjs';
import {dealerDomain} from '../../services/assist/control-core.mjs';
const org='00000000-0000-0000-0000-000000000001',domain=dealerDomain(org),nonce='00000000-0000-0000-0000-000000000003';
const body={organization_id:org,generation:1,mesh_domain:domain,mesh_id:'mesh/'+domain+'/abc',server_origin:'https://assist.example.com',probe_nonce:nonce,probe_requested_at:Date.now()};
assert.equal(validateCanaryRequest(body),body);
assert.throws(()=>createWindowsCanaryHandler(),/independent_windows_verifier_required/);
for(const patch of [{mesh_domain:'mjv-foreign'},{server_origin:'http://assist.example.com'},{probe_requested_at:Date.now()-30000},{mesh_id:'mesh/foreign/abc'},{probe_nonce:'replayed'}])assert.throws(()=>validateCanaryRequest({...body,...patch}));
const proof={...body,checked_at:Date.now(),desktop_control:true,consent_enforced:true,cross_tenant_denied:true,windows_host_verified:true,actual_input_observed:true,denied_consent_observed:true,second_dealer_denied_observed:true};
const run=createWindowsCanaryHandler({verify:async()=>proof});
assert.equal((await run(body)).desktop_control,true);
for(const field of ['windows_host_verified','actual_input_observed','denied_consent_observed','second_dealer_denied_observed','cross_tenant_denied']){
 const rejected=createWindowsCanaryHandler({verify:async()=>({...proof,[field]:false})});
 await assert.rejects(rejected(body),/canary_proof_rejected/);
}
await assert.rejects(createWindowsCanaryHandler({verify:async()=>({...proof,probe_nonce:'wrong'})})(body),/canary_proof_rejected/);
let unblock;const gate=new Promise(resolve=>{unblock=resolve;});
const pending=createWindowsCanaryHandler({verify:async()=>{await gate;return proof;}});
const first=pending(body);
await assert.rejects(pending(body),/duplicate_probe/);
unblock();await first;
console.log('Windows canary contract: missing verifier, spoofed evidence, stale requests and duplicate in-flight probes rejected');
