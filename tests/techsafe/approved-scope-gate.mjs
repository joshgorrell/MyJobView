import assert from 'node:assert/strict';
import {reconcileTechsafeApprovedScope as reconcile} from '../../src/lib/techsafe/reconcileApprovedScope.mjs';
const ids=['837c4be8-4d88-4852-8c42-38eb98c2520c','dc758ebe-4547-4759-9e9e-07e2dfa17ff3','7a34774a-47d5-404e-ba31-1b88be5297d6','77fb33c9-3446-4427-8b4f-098eb260ee0b'];
const source=[{id:ids[0],productId:'b8fd83ac-ff9e-4224-9db0-de6b24148b86',catalogOwned:true,quantity:1,unitPrice:799.95,soldLabor:100},
 {id:ids[1],productId:'715017c5-c899-4cc0-8b83-b2c2a634c380',catalogOwned:true,quantity:1,unitPrice:449.95,soldLabor:67.5,committedChangeLineId:ids[3]}];
const remove={id:ids[2],actionType:'remove',sourceLineId:ids[0],removeScope:'parts_and_labor',originalQuantity:1,newQuantity:0};
const add={id:ids[3],actionType:'add'};
const ok=reconcile({sourceLines:source,approvedChanges:[remove,add],minimumEligibleUnitPrice:250});
assert.equal(ok.certifiable,true);assert.equal(ok.equipmentCents,44995);assert.equal(ok.soldLaborCents,6750);
assert.deepEqual(ok.removedLineIds,[ids[0]]);
assert.equal(reconcile({sourceLines:source,approvedChanges:[remove,{...add,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}],minimumEligibleUnitPrice:250}).reason,'approved_addition_unreconciled');
assert.equal(reconcile({sourceLines:source,approvedChanges:[{...remove,newQuantity:0.5},add],minimumEligibleUnitPrice:250}).reason,'approved_removal_unreconciled');
assert.equal(reconcile({sourceLines:[{...source[0],productId:null},source[1]],approvedChanges:[remove,add],minimumEligibleUnitPrice:250}).reason,'invalid_source_line');
assert.equal(reconcile({sourceLines:source,approvedChanges:[remove,add],minimumEligibleUnitPrice:0}).reason,'invalid_reconciliation_input');
console.log('PASS approved scope reconciliation gate');
