import assert from 'node:assert/strict';
import {inspectVerifiedSalesOrderEquipment as inspect} from '../../src/lib/techsafe/verifiedSourceRead.mjs';
const order={id:'sales-1',organizationId:'tenant-1',proposalId:'approved-proposal-1',approved:true,revision:4};
const base=[{id:'base-1',organizationId:'tenant-1',proposalId:'approved-proposal-1',productId:'product-1',quantity:2}];
const evidence={connectionId:'conn-1',orderId:'sales-1',transactionConsistent:true,ledgerRowLocked:true,connectionActive:true,sourceRevisionVerified:true,connectionGeneration:2,ledgerGeneration:2,ledgerConnectionId:'conn-1',ledgerSalesOrderId:'sales-1',connectionOrganizationId:'tenant-1',connectionProposalId:'approved-proposal-1',ledgerRevision:4,ledgerOrganizationId:'tenant-1',ledgerProposalId:'approved-proposal-1',ledgerState:'candidate',ledgerFingerprint:'a'.repeat(64),sourceFingerprint:'a'.repeat(64),revision:4,salesOrder:order,baseLines:base,changeOrders:[],sourceManifest:{complete:true,approvalEvidenceVerified:true,salesOrderId:'sales-1',organizationId:'tenant-1',proposalId:'approved-proposal-1',revision:4,baseLineCount:1,changeOrderCount:0,totalChangeOrderCount:0,unapprovedChangeOrderCount:0,changeLineCount:0}};
const run=(patch={})=>inspect({connectionId:'conn-1',orderId:'sales-1',readConsistentSource:async()=>({...evidence,...patch})});
const good=await run();assert.equal(good.ok,true);assert.equal(good.authorized,false);assert.equal(good.snapshotReady,false);assert.equal(good.items[0].quantity,2);
for(const patch of [{connectionId:'other'},{orderId:'other'},{transactionConsistent:false},{ledgerRowLocked:false},{connectionActive:false},{sourceRevisionVerified:false},{connectionGeneration:0},{ledgerGeneration:3},{ledgerConnectionId:'other-connection'},{ledgerSalesOrderId:'other-order'},{connectionOrganizationId:'other-tenant'},{connectionProposalId:'other-proposal'},{ledgerRevision:3},{ledgerOrganizationId:'other-tenant'},{ledgerProposalId:'other-proposal'},{ledgerState:'held'},{ledgerFingerprint:'0'.repeat(64)},{ledgerFingerprint:'invalid'},{sourceFingerprint:'b'.repeat(64)},{sourceManifest:{...evidence.sourceManifest,complete:false}}]) {
 const result=await run(patch);assert.equal(result.ok,false);assert.equal(result.authorized,false);assert.equal(result.snapshotReady,false);assert.deepEqual(result.items,[]);
}
assert.equal((await inspect({connectionId:' conn-1',orderId:'sales-1'})).reason,'invalid_source_identity');
assert.equal((await inspect({connectionId:'conn-1',orderId:'sales-1 '})).reason,'invalid_source_identity');
for (const invalid of ['change:reserved','conn-1\\nother','conn-1\\tother','conn-1\\u0000other','x'.repeat(257)]) {
 const result=await inspect({connectionId:invalid,orderId:'sales-1',readConsistentSource:async()=>{throw Error('must not read')}});
 assert.equal(result.reason,'invalid_source_identity');
 assert.equal(result.authorized,false);
}
for (const invalid of ['change:reserved','sales-1\\rother','sales-1\\u007fother']) {
 const result=await inspect({connectionId:'conn-1',orderId:invalid,readConsistentSource:async()=>{throw Error('must not read')}});
 assert.equal(result.reason,'invalid_source_identity');
}
assert.equal((await inspect({connectionId:'conn-1',orderId:'sales-1'})).reason,'authoritative_reader_unavailable');
assert.equal((await inspect({connectionId:'conn-1',orderId:'sales-1',readConsistentSource:async()=>{throw Error('db down')}})).reason,'authoritative_read_failed');
// A valid-looking manifest cannot override ledger holds, revision reuse,
// or connection generation rotation. No inspection result authorizes export.
for (const patch of [
 {ledgerState:'held',sourceManifest:{...evidence.sourceManifest,complete:true}},
 {ledgerRevision:5,revision:4},
 {connectionGeneration:3,ledgerGeneration:2},
 {salesOrder:{...order,organizationId:'other-tenant'}},
 {salesOrder:{...order,proposalId:'unapproved-proposal'}}
]) {
 const result=await run(patch);
 assert.equal(result.ok,false);
 assert.equal(result.authorized,false);
 assert.equal(result.snapshotReady,false);
 assert.deepEqual(result.items,[]);
}
assert.equal((await run({salesOrder:{...order,approved:false}})).reason,'approved_sales_order_unverified');
assert.equal((await run({sourceManifest:{...evidence.sourceManifest,totalChangeOrderCount:1,unapprovedChangeOrderCount:1}})).reason,'unapproved_changes_present');
console.log('Transaction source inspection orchestration contract: PASS');
