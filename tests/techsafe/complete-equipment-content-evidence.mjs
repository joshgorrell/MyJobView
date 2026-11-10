import assert from 'node:assert/strict';
import {buildCompleteEquipmentContentEvidence as build,compareCompleteEquipmentContentEvidence as compare} from '../../src/lib/techsafe/completeEquipmentContentEvidence.mjs';
const inspection={ok:true,authorized:false,snapshotReady:false,revision:7,items:[
 {sourceLineId:'base-1',productId:'display',quantity:2},
 {sourceLineId:'change:co-1',productId:'camera',quantity:1}]};
const details=[
 {sourceLineId:'base-1',productRef:'display',productKind:'equipment',description:'Display',unitEquipmentValueCents:50000,customerSupplied:false,techsafeExcluded:false},
 {sourceLineId:'change:co-1',productRef:'camera',productKind:'equipment',description:'Camera',unitEquipmentValueCents:25000,customerSupplied:true,techsafeExcluded:true}];
const input={inspection,details,connectionId:'conn-1',connectionGeneration:3,orderId:'order-1',organizationId:'tenant-1',proposalId:'approved-1',sourceFingerprint:'a'.repeat(64)};
const baseline=build(input);
assert.equal(baseline.ok,true);assert.equal(baseline.authorized,false);assert.equal(baseline.snapshotReady,false);
assert.equal(baseline.lineCount,2);
assert.equal(build({...input,details:[...details].reverse(),inspection:{...inspection,items:[...inspection.items].reverse()}}).contentFingerprint,baseline.contentFingerprint);
for(const patch of [{description:'Updated'},{unitEquipmentValueCents:52000},{customerSupplied:true},{techsafeExcluded:true}]){
 const changed=build({...input,details:[{...details[0],...patch},details[1]]});
 assert.equal(changed.ok,true);
 assert.notEqual(changed.contentFingerprint,baseline.contentFingerprint);
 assert.equal(compare(baseline,changed).reason,'same_revision_content_conflict');
}
assert.equal(build({...input,details:[details[0]]}).reason,'incomplete_equipment_content');
assert.equal(build({...input,details:[details[0],details[0]]}).reason,'invalid_equipment_content');
assert.equal(build({...input,details:[{...details[0],productRef:'wrong'},details[1]]}).reason,'invalid_equipment_content');
assert.equal(build({...input,inspection:{...inspection,ok:false}}).ok,false);
assert.equal(build({...input,sourceFingerprint:'0'.repeat(64)}).ok,false);
assert.equal(compare(baseline,{...baseline,revision:6}).reason,'content_revision_rollback');
assert.equal(compare(baseline,{...baseline,connectionGeneration:2}).reason,'content_revision_rollback');
assert.equal(compare(baseline,{...baseline,proposalId:'other'}).reason,'content_scope_mismatch');
assert.equal(compare(baseline,{...baseline,revision:8}).ok,true);
assert.equal(compare(baseline,{...baseline,revision:8}).authorized,false);
console.log('Complete Techsafe equipment content evidence: PASS (not certified)');
