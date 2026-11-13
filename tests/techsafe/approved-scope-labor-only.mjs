import assert from 'node:assert/strict';
import {reconcileTechsafeApprovedScope as reconcile} from '../../src/lib/techsafe/reconcileApprovedScope.mjs';
const source=[
{id:'11111111-1111-4111-8111-111111111111',productId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',catalogOwned:true,quantity:1,unitPrice:400,soldLabor:50},
{id:'22222222-2222-4222-8222-222222222222',laborOnly:true,productId:null,quantity:1,unitPrice:0,soldLabor:150},
{id:'33333333-3333-4333-8333-333333333333',productId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',catalogOwned:true,customerSupplied:true,quantity:1,unitPrice:0,soldLabor:75}
];
const result=reconcile({sourceLines:source,approvedChanges:[],minimumEligibleUnitPrice:250});
assert.equal(result.certifiable,true);assert.equal(result.items.length,1);assert.equal(result.eligibleItems.length,1);
assert.equal(result.equipmentCents,40000);assert.equal(result.soldLaborCents,27500);
assert.equal(reconcile({sourceLines:[{...source[0],productId:null},...source.slice(1)],approvedChanges:[],minimumEligibleUnitPrice:250}).reason,'invalid_source_line');
console.log('PASS labor-only and customer-supplied labor without equipment eligibility');
