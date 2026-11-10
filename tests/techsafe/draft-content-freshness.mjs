import assert from 'node:assert/strict';
import {preflightTechsafeDraftContent as preflight} from '../../src/lib/techsafe/draftContentFreshness.mjs';
const order={id:'sales-1',organizationId:'tenant-1',proposalId:'approved-1',approved:true,revision:4};
const base=[{id:'base-1',organizationId:'tenant-1',proposalId:'approved-1',productId:'product-1',quantity:2}];
const manifest={complete:true,approvalEvidenceVerified:true,salesOrderId:'sales-1',organizationId:'tenant-1',proposalId:'approved-1',revision:4,baseLineCount:1,changeOrderCount:0,totalChangeOrderCount:0,unapprovedChangeOrderCount:0,changeLineCount:0};
const details=[{sourceLineId:'base-1',productRef:'product-1',description:'Display',unitEquipmentValueCents:50000,customerSupplied:false,techsafeExcluded:false,productKind:'equipment'}];
const source={connectionId:'conn-1',orderId:'sales-1',transactionConsistent:true,ledgerRowLocked:true,connectionActive:true,sourceRevisionVerified:true,connectionGeneration:2,ledgerGeneration:2,ledgerConnectionId:'conn-1',ledgerSalesOrderId:'sales-1',connectionOrganizationId:'tenant-1',connectionProposalId:'approved-1',ledgerRevision:4,ledgerOrganizationId:'tenant-1',ledgerProposalId:'approved-1',ledgerState:'candidate',ledgerFingerprint:'a'.repeat(64),sourceFingerprint:'a'.repeat(64),revision:4,salesOrder:order,baseLines:base,changeOrders:[],sourceManifest:manifest,equipmentDetails:details};
const run=async(second,first=source)=>{let n=0;return {result:await preflight({connectionId:'conn-1',orderId:'sales-1',readConsistentSource:async()=>{n++;return n===1?first:second}}),reads:()=>n}};
const ok=await run(source);assert.equal(ok.result.ok,true);assert.equal(ok.result.authorized,false);assert.equal(ok.result.snapshotReady,false);assert.equal(ok.reads(),2);
const changedDetails=patch=>({...source,equipmentDetails:[{...details[0],...patch}]});
for(const patch of [{unitEquipmentValueCents:60000},{description:'Different display'},{techsafeExcluded:true},{customerSupplied:true}]){
 const x=await run(changedDetails(patch));assert.equal(x.result.reason,'draft_content_changed_during_preflight',JSON.stringify(patch));
 assert.equal(x.result.authorized,false);
}
const newer={...source,revision:5,ledgerRevision:5,salesOrder:{...order,revision:5},sourceManifest:{...manifest,revision:5}};
assert.equal((await run(newer)).result.reason,'source_changed_during_preflight');
assert.equal((await run(source,newer)).result.reason,'source_revision_rollback');
assert.equal((await run({...source,sourceFingerprint:'b'.repeat(64),ledgerFingerprint:'b'.repeat(64)})).result.reason,'source_fingerprint_changed');
assert.equal((await run({...source,ledgerState:'held'})).result.ok,false);
assert.equal((await run(changedDetails({productRef:'wrong'}))).result.ok,false);
// Source readers may return the same complete line set in a different order.
// Non-contract diagnostic metadata must not cause a false content change.
const secondBase={...base[0],id:'base-2',productId:'product-2',quantity:1};
const secondDetail={...details[0],sourceLineId:'base-2',productRef:'product-2',description:'Camera',unitEquipmentValueCents:25000};
const multi={...source,baseLines:[...base,secondBase],equipmentDetails:[...details,secondDetail],sourceManifest:{...manifest,baseLineCount:2}};
const reordered={...multi,baseLines:[secondBase,...base],equipmentDetails:[{...secondDetail,diagnosticNote:'ignored'}, {...details[0],diagnosticNote:'ignored'}]};
assert.equal((await run(reordered,multi)).result.ok,true,'source row order and unrelated metadata are not equipment changes');
assert.equal((await run({...reordered,equipmentDetails:[{...secondDetail,unitEquipmentValueCents:26000},details[0]]},multi)).result.reason,'draft_content_changed_during_preflight');
const rejected=await preflight({connectionId:'bad id',orderId:'sales-1',readConsistentSource:async()=>{throw Error('must not read')}});
assert.equal(rejected.reason,'invalid_source_identity');
assert.equal((await preflight({connectionId:'conn-1',orderId:'sales-1'})).reason,'authoritative_reader_unavailable');
for(const failAt of [1,2]){
 let calls=0;
 const result=await preflight({connectionId:'conn-1',orderId:'sales-1',readConsistentSource:async()=>{
  calls++;
  if(calls===failAt)throw Error('database unavailable: secret connection info');
  return source;
 }});
 assert.equal(result.reason,'authoritative_read_failed');
 assert.equal(result.ok,false);assert.equal(result.authorized,false);assert.equal(result.snapshotReady,false);
 assert.equal(result.lines.length,0);
 assert.equal(calls,failAt);
 assert.ok(!JSON.stringify(result).includes('secret connection info'));
}
assert.equal((await run({...source,connectionProposalId:'other'})).result.ok,false);
assert.equal((await run({...source,ledgerGeneration:3})).result.ok,false);
console.log('Techsafe draft content freshness: PASS (inspection only, not certified)');
