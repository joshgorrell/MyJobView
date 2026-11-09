import assert from 'node:assert/strict';
import {inspectAndProjectTechsafeDraft as compose} from '../../src/lib/techsafe/inspectedDraftComposition.mjs';
const order={id:'sales-1',organizationId:'tenant-1',proposalId:'approved-proposal-1',approved:true,revision:4};
const base=[{id:'base-1',organizationId:'tenant-1',proposalId:'approved-proposal-1',productId:'product-1',quantity:2}];
const manifest={complete:true,approvalEvidenceVerified:true,salesOrderId:'sales-1',organizationId:'tenant-1',proposalId:'approved-proposal-1',revision:4,baseLineCount:1,changeOrderCount:0,totalChangeOrderCount:0,unapprovedChangeOrderCount:0,changeLineCount:0};
const details=[{sourceLineId:'base-1',productRef:'product-1',description:'Display',unitEquipmentValueCents:50000,customerSupplied:false,techsafeExcluded:false,productKind:'equipment'}];
const source={connectionId:'conn-1',orderId:'sales-1',transactionConsistent:true,ledgerRowLocked:true,connectionActive:true,sourceRevisionVerified:true,connectionGeneration:2,ledgerGeneration:2,ledgerConnectionId:'conn-1',ledgerSalesOrderId:'sales-1',connectionOrganizationId:'tenant-1',connectionProposalId:'approved-proposal-1',ledgerRevision:4,ledgerOrganizationId:'tenant-1',ledgerProposalId:'approved-proposal-1',ledgerState:'candidate',ledgerFingerprint:'a'.repeat(64),sourceFingerprint:'a'.repeat(64),revision:4,salesOrder:order,baseLines:base,changeOrders:[],sourceManifest:manifest,equipmentDetails:details};
let reads=0;
const run=(patch={},other={})=>compose({connectionId:'conn-1',orderId:'sales-1',readConsistentSource:async()=>{reads++;return {...source,...patch}},...other});
const ok=await run();
assert.equal(ok.ok,true);assert.equal(ok.lines.length,1);
assert.equal(ok.lines[0].sourceLineId,'base-1');
assert.equal(ok.authorized,false);assert.equal(ok.snapshotReady,false);
assert.equal(reads,1,'single authoritative source read must contain equipment details');
for(const patch of [
 {equipmentDetails:undefined},{equipmentDetails:[]},
 {equipmentDetails:[{...details[0],productRef:'wrong'}]},
 {equipmentDetails:[{...details[0],unitEquipmentValueCents:-1}]},
 {salesOrder:{...order,approved:false}},
 {sourceManifest:{...manifest,approvalEvidenceVerified:false}},
 {ledgerState:'held'},{connectionGeneration:3}
]){
 const result=await run(patch);
 assert.equal(result.ok,false,JSON.stringify(patch));
 assert.equal(result.authorized,false);assert.equal(result.snapshotReady,false);
}
assert.equal((await run({equipmentDetails:[{...details[0],techsafeExcluded:true}]})).lines.length,0);
assert.equal((await run({equipmentDetails:[{...details[0],customerSupplied:true}]})).lines.length,0);
assert.equal((await run({equipmentDetails:[{...details[0],unitEquipmentValueCents:100}]},{minimumUnitValueCents:25000})).lines.length,0);
const before=reads;
assert.equal((await run({}, {readEquipmentDetails:async()=>details})).reason,'separate_equipment_read_forbidden');
assert.equal(reads,before,'forbidden second reader must not reach database');
assert.equal((await compose({connectionId:'conn-1',orderId:'sales-1'})).reason,'authoritative_reader_unavailable');
console.log('Techsafe inspected draft same-read composition: PASS (not certified or authorized)');
