import assert from 'node:assert/strict';
import {buildSalesOrderEquipmentEvidence as build,compareSalesOrderEquipmentEvidence as compare} from '../../src/lib/techsafe/canonicalEquipmentEvidence.mjs';
const order={id:'sales-1',organizationId:'org-1',proposalId:'proposal-1',approved:true,revision:4};
const lines=[{id:'z-1',organizationId:'org-1',proposalId:'proposal-1',productId:'product-1',quantity:2},
{id:'a-1',organizationId:'org-1',proposalId:'proposal-1',productId:'product-2',quantity:1}];
const manifest={complete:true,approvalEvidenceVerified:true,salesOrderId:'sales-1',organizationId:'org-1',proposalId:'proposal-1',revision:4,baseLineCount:2,changeOrderCount:0,totalChangeOrderCount:0,unapprovedChangeOrderCount:0,changeLineCount:0};
const args={connectionId:'connection-1',connectionGeneration:2,salesOrder:order,baseLines:lines,changeOrders:[],expectedRevision:4,sourceManifest:manifest};
const good=build(args);
assert.equal(good.ok,true);assert.equal(good.authorized,false);assert.equal(good.snapshotReady,false);
assert.match(good.fingerprint,/^[0-9a-f]{64}$/);
assert.equal(build({...args,baseLines:[...lines].reverse()}).fingerprint,good.fingerprint);
for(const change of [
 {connectionId:'connection-2'}, {connectionGeneration:3},
 {salesOrder:{...order,id:'sales-2'},sourceManifest:{...manifest,salesOrderId:'sales-2'}},
 {salesOrder:{...order,organizationId:'org-2'},sourceManifest:{...manifest,organizationId:'org-2'},baseLines:lines.map(x=>({...x,organizationId:'org-2'}))},
 {salesOrder:{...order,proposalId:'proposal-2'},sourceManifest:{...manifest,proposalId:'proposal-2'},baseLines:lines.map(x=>({...x,proposalId:'proposal-2'}))},
 {baseLines:[{...lines[0],quantity:3},lines[1]]},
 {baseLines:[{...lines[0],productId:'product-3'},lines[1]]},
]) {const altered=build({...args,...change});assert.equal(altered.ok,true,JSON.stringify(change));assert.notEqual(altered.fingerprint,good.fingerprint);}
for(const change of [{salesOrder:{...order,approved:false}},{sourceManifest:{...manifest,approvalEvidenceVerified:false}},{baseLines:[lines[0]]},{connectionId:'bad space'},{connectionGeneration:0}]) {
 const result=build({...args,...change});assert.equal(result.ok,false);assert.equal(result.authorized,false);
}
assert.equal(compare(good,good).changed,false);
const revised=build({...args,salesOrder:{...order,revision:5},expectedRevision:5,sourceManifest:{...manifest,revision:5}});
assert.equal(compare(good,revised).changed,true);
assert.equal(compare(revised,good).reason,'stale_source_revision');
const conflict=build({...args,baseLines:[{...lines[0],quantity:3},lines[1]]});
assert.equal(compare(good,conflict).reason,'revision_content_conflict');
const newGeneration=build({...args,connectionGeneration:3});
assert.equal(compare(good,newGeneration).changed,true);
assert.equal(compare(newGeneration,good).reason,'stale_connection_generation');
assert.equal(compare(good,build({...args,connectionId:'other'})).reason,'evidence_scope_mismatch');
assert.equal(compare(good,{}).ok,false);
console.log('Canonical equipment evidence and monotonic comparison: PASS (non-authorizing)');
