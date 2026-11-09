import assert from 'node:assert/strict';
import {preflightSalesOrderEquipmentFreshness as preflight} from '../../src/lib/techsafe/sourceFreshnessPreflight.mjs';
const order={id:'order-1',organizationId:'org-1',proposalId:'proposal-1',approved:true,revision:4};
const base=[{id:'line-1',organizationId:'org-1',proposalId:'proposal-1',productId:'product-1',quantity:2}];
const manifest={complete:true,approvalEvidenceVerified:true,salesOrderId:'order-1',organizationId:'org-1',proposalId:'proposal-1',revision:4,baseLineCount:1,changeOrderCount:0,totalChangeOrderCount:0,unapprovedChangeOrderCount:0,changeLineCount:0};
const evidence={connectionId:'conn-1',orderId:'order-1',transactionConsistent:true,ledgerRowLocked:true,connectionActive:true,sourceRevisionVerified:true,connectionGeneration:2,ledgerGeneration:2,ledgerConnectionId:'conn-1',ledgerSalesOrderId:'order-1',connectionOrganizationId:'org-1',connectionProposalId:'proposal-1',ledgerRevision:4,ledgerOrganizationId:'org-1',ledgerProposalId:'proposal-1',ledgerState:'candidate',ledgerFingerprint:'a'.repeat(64),sourceFingerprint:'a'.repeat(64),revision:4,salesOrder:order,baseLines:base,changeOrders:[],sourceManifest:manifest};
const run=(responses)=>{let n=0;return preflight({connectionId:'conn-1',orderId:'order-1',readConsistentSource:async()=>responses[n++]});};
const ok=await run([evidence,evidence]);
assert.equal(ok.ok,true);assert.equal(ok.authorized,false);assert.equal(ok.snapshotReady,false);
assert.match(ok.fingerprint,/^[a-f0-9]{64}$/);
for(const bad of [
 {...evidence,ledgerState:'held'},
 {...evidence,transactionConsistent:false},
 {...evidence,connectionActive:false},
 {...evidence,sourceManifest:{...manifest,approvalEvidenceVerified:false}},
 {...evidence,salesOrder:{...order,approved:false}},
 {...evidence,ledgerFingerprint:'0'.repeat(64)},
 {...evidence,sourceFingerprint:'b'.repeat(64)},
 {...evidence,connectionGeneration:3},
 {...evidence,ledgerRevision:5},
 {...evidence,baseLines:[]}
]) {
 assert.equal((await run([bad,evidence])).ok,false);
 assert.equal((await run([evidence,bad])).ok,false);
}
const changed={...evidence,baseLines:[{...base[0],quantity:3}]};
assert.equal((await run([evidence,changed])).reason,'revision_content_conflict');
const advanced={...evidence,revision:5,ledgerRevision:5,salesOrder:{...order,revision:5},sourceManifest:{...manifest,revision:5}};
assert.equal((await run([evidence,advanced])).reason,'source_changed_during_preflight');
assert.equal((await run([advanced,evidence])).reason,'stale_source_revision');
const rotated={...evidence,connectionGeneration:3,ledgerGeneration:3};
assert.equal((await run([evidence,rotated])).reason,'source_changed_during_preflight');
assert.equal((await run([rotated,evidence])).reason,'stale_connection_generation');
assert.equal((await run([evidence,{...evidence,connectionProposalId:'other'}])).ok,false);
assert.equal((await run([evidence,{...evidence,ledgerOrganizationId:'other'}])).ok,false);
assert.equal((await run([evidence,null])).ok,false);
assert.equal((await preflight({connectionId:'bad id',orderId:'order-1',readConsistentSource:async()=>{throw Error('must not read')}})).reason,'invalid_source_identity');
assert.equal((await preflight({connectionId:'conn-1',orderId:'order-1'})).reason,'authoritative_reader_unavailable');
assert.equal((await preflight({connectionId:'conn-1',orderId:'order-1',readConsistentSource:async()=>{throw Error('db down')}})).reason,'authoritative_read_failed');
console.log('Techsafe source freshness preflight: PASS (not transaction certified or authorized)');
