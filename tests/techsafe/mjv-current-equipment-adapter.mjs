import assert from 'node:assert/strict';
import {inspectMjvCurrentSalesOrderEquipment as inspect} from '../../src/lib/techsafe/mjvCurrentEquipmentAdapter.mjs';
const source=()=>({trustedCurrentOrderRead:true,currentEquipmentComplete:true,approvedSalesOrder:true,
 organizationId:'org-1',currency:'USD',order:{id:'order-1',organization_id:'org-1',proposal_id:'proposal-1',contact_id:'customer-1',status:'complete',project_id:null},
 customer:{id:'customer-1',organization_id:'org-1',full_name:'Customer'},
 lines:[{line:{id:'line-1',organization_id:'org-1',proposal_id:'proposal-1',product_id:'product-1',item_type:'material',quantity:'2.00',is_customer_supplied:false,description:'Current MJV equipment'},
 product:{id:'product-1',organization_id:'org-1',item_type:'material',sku:'TV-1',name:'TV'},exclusion:null,
 membership:{sourceLineId:'line-1',orderId:'order-1',verified:true,scope:'included'},unitSalePrice:'750.00',salesPriceResolved:true}]});
const good=inspect({source:source()});
assert.equal(good.ok,true);assert.equal(good.authorized,false);assert.equal(good.snapshotReady,false);assert.equal(good.quoteReady,false);
assert.equal(good.lines.length,1);assert.equal(good.lines[0].quantity,2);assert.equal(good.lines[0].unitEquipmentValueCents,75000);
// MJV current rows are consumed as-is. There is no change-order replay.
const changed=source();changed.lines[0].line.quantity='3.00';
assert.equal(inspect({source:changed}).lines[0].quantity,3);
for(const key of ['trustedCurrentOrderRead','currentEquipmentComplete','approvedSalesOrder']){
 const bad=source();bad[key]=false;assert.equal(inspect({source:bad}).ok,false,key);
}
for(const mutate of [
 s=>{s.lines[0].salesPriceResolved=false},
 s=>{s.lines[0].membership.verified=false},
 s=>{s.lines[0].line.organization_id='other'},
 s=>{s.order.proposal_id='other'},
 s=>{s.customer.id='other'},
 s=>{s.lines[0].line.quantity='2.5'},
]){const bad=source();mutate(bad);const r=inspect({source:bad});assert.equal(r.ok,false);assert.equal(r.snapshotReady,false);}
// The already-existing SQL read_order_source returns diagnostic rows only.
// Even if a caller forges the adapter flags, raw read-model v1 cannot pass.
const raw=source();raw.readModelVersion=1;
assert.equal(inspect({source:raw}).reason,'private_read_model_requires_verified_scope_and_price');
raw.lines[0].salesPriceResolved=false;
raw.lines[0].membership.verified=false;
assert.equal(inspect({source:raw}).ok,false);
const removed=source();removed.lines[0].membership.scope='removed';
assert.deepEqual(inspect({source:removed}).lines,[]);
console.log('PASS: MJV current Sales Order equipment adapter reuses existing projection and never authorizes sync');
