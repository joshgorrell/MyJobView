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
// Exercise actual control characters, not escaped backslash sequences.
let rejectedReads=0;
const forbiddenRead=async()=>{rejectedReads++;throw Error('invalid identity reached reader')};
for (const invalid of ['change:reserved',...([0,9,10,13,31,127].map(code=>'conn-1'+String.fromCharCode(code)+'other')),'x'.repeat(257)]) {
 const result=await inspect({connectionId:invalid,orderId:'sales-1',readConsistentSource:forbiddenRead});
 assert.equal(result.reason,'invalid_source_identity');
 assert.equal(result.authorized,false);
 assert.equal(result.snapshotReady,false);
}
for (const invalid of ['change:reserved',...([0,9,10,13,31,127].map(code=>'sales-1'+String.fromCharCode(code)+'other'))]) {
 const result=await inspect({connectionId:'conn-1',orderId:invalid,readConsistentSource:forbiddenRead});
 assert.equal(result.reason,'invalid_source_identity');
 assert.equal(result.snapshotReady,false);
}
assert.equal(rejectedReads,0,'Malformed identifiers must be rejected before any database read');
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
// Already-applied source rows must not be replayed as an original base.
for(const patch of [
 {baseLinesAreCurrent:true},
 {sourceManifest:{...evidence.sourceManifest,baseLineSource:'current_proposal_line_items'}},
 {sourceManifest:{...evidence.sourceManifest,baseLineSource:'post_application_current'}}
]){
 const result=await run(patch);
 assert.equal(result.reason,'current_equipment_must_not_replay_change_orders');
 assert.equal(result.authorized,false);assert.equal(result.snapshotReady,false);
 assert.deepEqual(result.items,[]);
}
const pending=await run({sourceManifest:{...evidence.sourceManifest,totalChangeOrderCount:1,unapprovedChangeOrderCount:1}});
assert.equal(pending.ok,true,'pending changes do not invalidate previously approved equipment');
assert.deepEqual(pending.items,[{sourceLineId:'base-1',productId:'product-1',quantity:2}]);
assert.equal(pending.authorized,false);
assert.equal(pending.snapshotReady,false);

// Contract regression: a caller-supplied proposal alone is never a Sales Order.
// A mismatched sales_orders.proposal_id must hold even if approval flags are true.
for (const patch of [
 {salesOrder:{...order,id:'proposal-only'}},
 {salesOrder:{...order,proposalId:'different-approved-proposal'},connectionProposalId:'different-approved-proposal'},
 {salesOrder:{...order,approved:false}},
 {sourceManifest:{...evidence.sourceManifest,approvalEvidenceVerified:false}},
 {sourceManifest:{...evidence.sourceManifest,proposalId:'unapproved-proposal'}},
 {baseLines:[{...base[0],proposalId:'unapproved-proposal'}]},
 {changeOrders:[{id:'co-1',salesOrderId:'sales-1',organizationId:'tenant-1',status:'pending',customerApproved:false,revision:1,lines:[]}],
  sourceManifest:{...evidence.sourceManifest,changeOrderCount:1,totalChangeOrderCount:1}}
]) {
 const result=await run(patch);
 assert.equal(result.ok,false,JSON.stringify(patch));
 assert.equal(result.authorized,false);
 assert.equal(result.snapshotReady,false);
 assert.deepEqual(result.items,[]);
}
// Failure and replay-like repeated inspection never create an export grant.
for (let i=0;i<3;i++) {
 const result=await run();
 assert.equal(result.ok,true);
 assert.equal(result.authorized,false);
 assert.equal(result.snapshotReady,false);
}


// Adversarial source manifests: matching row counts do not establish a valid
// Sales Order, approval chain, or complete customer-approved equipment scope.
for (const patch of [
 {sourceManifest:{...evidence.sourceManifest,salesOrderId:'standalone-proposal'}},
 {sourceManifest:{...evidence.sourceManifest,organizationId:'other-tenant'}},
 {sourceManifest:{...evidence.sourceManifest,proposalId:'other-proposal'}},
 {sourceManifest:{...evidence.sourceManifest,revision:3}},
 {sourceManifest:{...evidence.sourceManifest,baseLineCount:0}},
 {sourceManifest:{...evidence.sourceManifest,changeOrderCount:1}},
 {sourceManifest:{...evidence.sourceManifest,totalChangeOrderCount:1,unapprovedChangeOrderCount:0}},
 {sourceManifest:{...evidence.sourceManifest,approvalEvidenceVerified:'true'}},
 {salesOrder:{...order,revision:5}},
 {baseLines:[{...base[0],organizationId:'other-tenant'}]},
 {baseLines:[{...base[0],proposalId:'standalone-proposal'}]}
]) {
 const result=await run(patch);
 assert.equal(result.ok,false,JSON.stringify(patch));
 assert.equal(result.authorized,false);
 assert.equal(result.snapshotReady,false);
 assert.deepEqual(result.items,[]);
}
// The inspection adapter may fail, replay, or return plausible diagnostics;
// none of those results may become permission to dispatch or activate coverage.
for(const response of [null,{}, {authorized:true,snapshotReady:true}, {...evidence,ledgerState:'held'}]){
 const result=await inspect({connectionId:'conn-1',orderId:'sales-1',readConsistentSource:async()=>response});
 assert.equal(result.authorized,false);
 assert.equal(result.snapshotReady,false);
}


// Malformed authoritative evidence must never escape as an unhandled exception
// or accidentally yield an export grant.
for(const patch of [
 {baseLines:null},
 {baseLines:[null]},
 {changeOrders:null},
 {changeOrders:[null]},
 {sourceManifest:{...evidence.sourceManifest,baseLineCount:1},baseLines:undefined}
]){
 const result=await run(patch);
 assert.equal(result.ok,false);
 assert.equal(result.authorized,false);
 assert.equal(result.snapshotReady,false);
 assert.deepEqual(result.items,[]);
}


// The Techsafe receiver rejects these source IDs. Hold before the DB adapter
// rather than reporting a successful inspection that cannot be transported.
for (const invalid of ['space in id','bad.dot','bad:colon','nonascii-ñ','a'.repeat(129),'trailing/']) {
 for (const field of ['connectionId','orderId']) {
  let reads=0;
  const input={connectionId:'conn-1',orderId:'sales-1',readConsistentSource:async()=>{reads++;return evidence;}};
  input[field]=invalid;
  const result=await inspect(input);
  assert.equal(result.reason,'invalid_source_identity',field+': '+invalid);
  assert.equal(result.authorized,false);
  assert.equal(result.snapshotReady,false);
  assert.equal(reads,0,'invalid transport identity reached database adapter');
 }
}

console.log('Transaction source inspection orchestration contract: PASS');
