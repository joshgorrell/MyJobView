import assert from 'node:assert/strict';
import {inspectSerializableEquipmentCandidate as inspect} from '../../src/lib/techsafe/serializableEquipmentCandidate.mjs';
const order={id:'sales-1',organizationId:'tenant-1',proposalId:'approved-1',approved:true,revision:4};
const baseLines=[{id:'base-1',organizationId:'tenant-1',proposalId:'approved-1',productId:'product-1',quantity:2}];
const source={connectionId:'conn-1',orderId:'sales-1',transactionConsistent:true,ledgerRowLocked:true,connectionActive:true,sourceRevisionVerified:true,connectionGeneration:2,ledgerGeneration:2,ledgerConnectionId:'conn-1',ledgerSalesOrderId:'sales-1',connectionOrganizationId:'tenant-1',connectionProposalId:'approved-1',ledgerRevision:4,ledgerOrganizationId:'tenant-1',ledgerProposalId:'approved-1',ledgerState:'candidate',ledgerFingerprint:'a'.repeat(64),sourceFingerprint:'a'.repeat(64),revision:4,salesOrder:order,baseLines,changeOrders:[],sourceManifest:{complete:true,approvalEvidenceVerified:true,salesOrderId:'sales-1',organizationId:'tenant-1',proposalId:'approved-1',revision:4,baseLineCount:1,changeOrderCount:0,totalChangeOrderCount:0,unapprovedChangeOrderCount:0,changeLineCount:0}};
const details=[{sourceLineId:'base-1',productRef:'product-1',productKind:'equipment',description:'Display',unitEquipmentValueCents:50000,customerSupplied:false,techsafeExcluded:false}];
let reads=0;
const tx=(patch={})=>({serverOwned:true,isolationLevel:'serializable',readConsistentSource:async()=>{reads++;return {...source,...patch}},readCompleteEquipmentDetails:async()=>details,readCurrentRevision:async()=>({connectionGeneration:2,revision:4,sourceFingerprint:'a'.repeat(64),state:'candidate'})});
const run=(adapter=tx())=>inspect({connectionId:'conn-1',orderId:'sales-1',withSerializableSourceTransaction:async callback=>callback(adapter)});
const good=await run();
assert.equal(good.ok,true);assert.equal(good.authorized,false);assert.equal(good.snapshotReady,false);
assert.equal(good.lineCount,1);assert.match(good.contentFingerprint,/^[a-f0-9]{64}$/);
assert.equal(good.reason,'serializable_candidate_not_certified');
for(const bad of [{...tx(),isolationLevel:'read committed'},{...tx(),serverOwned:false},{...tx(),readCompleteEquipmentDetails:undefined},{...tx(),readCurrentRevision:undefined}]){
 const result=await run(bad);assert.equal(result.ok,false);assert.equal(result.authorized,false);
}
for(const patch of [{salesOrder:{...order,approved:false}},{ledgerState:'held'},{sourceFingerprint:'b'.repeat(64)},{connectionProposalId:'different'}]){
 assert.equal((await run(tx(patch))).ok,false);
}
assert.equal((await run({...tx(),readCompleteEquipmentDetails:async()=>[]})).reason,'complete_equipment_evidence_failed');
assert.equal((await run({...tx(),readCurrentRevision:async()=>({connectionGeneration:2,revision:5,sourceFingerprint:'a'.repeat(64),state:'candidate'})})).reason,'source_changed_during_transaction');
assert.equal((await run({...tx(),readCurrentRevision:async()=>({connectionGeneration:2,revision:4,sourceFingerprint:'b'.repeat(64),state:'candidate'})})).reason,'source_changed_during_transaction');
assert.equal((await run({...tx(),readCurrentRevision:async()=>{throw Object.assign(Error('serialization failure'),{code:'40001'})}})).reason,'serializable_transaction_aborted');
assert.equal((await inspect({connectionId:'bad space',orderId:'sales-1',withSerializableSourceTransaction:async()=>{throw Error('should not run')}})).reason,'invalid_source_identity');
assert.equal((await inspect({connectionId:'conn-1',orderId:'sales-1'})).reason,'serializable_transaction_unavailable');
assert.equal((await inspect({connectionId:'conn-1',orderId:'sales-1',withSerializableSourceTransaction:async()=>({ok:true,authorized:true,snapshotReady:true})})).reason,'invalid_transaction_result');
console.log('PASS: serializable approved Sales Order candidate stays inert and rejects stale or incomplete source');
