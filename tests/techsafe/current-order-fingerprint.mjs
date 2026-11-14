import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fingerprintCurrentSalesOrder} from '../../supabase/functions/_shared/techsafe-current-order-fingerprint.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const binding={connection_id:'11111111-1111-4111-8111-111111111111',organization_id:'22222222-2222-4222-8222-222222222222',sales_order_id:'33333333-3333-4333-8333-333333333333',proposal_id:'44444444-4444-4444-8444-444444444444',connection_generation:1};
const product='55555555-5555-4555-8555-555555555555',line='66666666-6666-4666-8666-666666666666';
const base={binding,lines:[{id:line,product_id:product,product_organization_id:binding.organization_id,quantity:'2',unit_price:'129.99',item_type:'material',is_hidden:false}],changes:[]};
const a=await fingerprintCurrentSalesOrder(base,hash);
assert.equal(a.valid,true);assert.equal(a.fingerprint.length,64);
assert.equal(a.fingerprint,(await fingerprintCurrentSalesOrder({...base,changes:[{id:line,status:'draft'}]},hash)).fingerprint);
assert.notEqual(a.fingerprint,(await fingerprintCurrentSalesOrder({...base,lines:[{...base.lines[0],quantity:3}]},hash)).fingerprint);
assert.notEqual(a.fingerprint,(await fingerprintCurrentSalesOrder({...base,lines:[{...base.lines[0],is_hidden:true}]},hash)).fingerprint);
assert.equal((await fingerprintCurrentSalesOrder({...base,lines:[{...base.lines[0],product_organization_id:product}]},hash)).reason,'invalid_current_line');
assert.equal((await fingerprintCurrentSalesOrder({...base,changes:[{id:line,status:'approved',is_active:true,approval_date:'2026-11-10'}]},hash)).reason,'approved_change_not_applied');
assert.equal((await fingerprintCurrentSalesOrder({...base,changes:[{id:line,status:'unknown'}]},hash)).reason,'unknown_change_state');
assert.equal((await fingerprintCurrentSalesOrder(base,()=> 'bad')).reason,'digest_invalid');
assert.equal(a.projection.lines[0].cost,undefined);
console.log('Current-order diagnostic fingerprint regression checks passed');

for(const price of ['0','0.00','1','1.2','100.00','129.99',100]){
 assert.equal((await fingerprintCurrentSalesOrder({...base,lines:[{...base.lines[0],unit_price:price}]},hash)).valid,true,`valid price ${price}`);
}
for(const price of ['100x00','1e2','-1.00','NaN','Infinity','1.001','01.00',null]){
 assert.equal((await fingerprintCurrentSalesOrder({...base,lines:[{...base.lines[0],unit_price:price}]},hash)).valid,false,`invalid price ${price}`);
}

assert.notEqual(a.fingerprint,(await fingerprintCurrentSalesOrder({...base,lines:[{...base.lines[0],approved_removed:true}]},hash)).fingerprint);

const completed={...base,binding:{...binding,order_status:'completed',first_completion_date:'2026-01-15T17:00:00+00:00'}};
const completedFingerprint=await fingerprintCurrentSalesOrder(completed,hash);
assert.equal(completedFingerprint.valid,true);
assert.notEqual(a.fingerprint,completedFingerprint.fingerprint,'completion must invalidate earlier certificate');
assert.notEqual(completedFingerprint.fingerprint,(await fingerprintCurrentSalesOrder({...completed,binding:{...completed.binding,first_completion_date:'2026-01-16T17:00:00+00:00'}},hash)).fingerprint,'changed completion date must invalidate certificate');
assert.notEqual(completedFingerprint.fingerprint,(await fingerprintCurrentSalesOrder({...completed,binding:{...completed.binding,order_status:'planning'}},hash)).fingerprint,'reopened Sales Order must invalidate certificate');
