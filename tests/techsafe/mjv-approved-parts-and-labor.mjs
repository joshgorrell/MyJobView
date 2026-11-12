import assert from 'node:assert/strict';
import {inspectMjvApprovedPartsAndLabor as inspect} from '../../src/lib/techsafe/mjvApprovedPartsAndLabor.mjs';
const source=()=>({trustedCurrentOrderRead:true,currentEquipmentComplete:true,approvedSalesOrder:true,
 organizationId:'org',currency:'USD',minimumUnitValueCents:0,
 order:{id:'so',organization_id:'org',proposal_id:'proposal',contact_id:'customer',status:'active'},
 customer:{id:'customer',organization_id:'org',full_name:'Customer'},
 lines:[
 {line:{id:'part',organization_id:'org',proposal_id:'proposal',product_id:'p',item_type:'material',quantity:'4.00',is_customer_supplied:false,description:'Speaker'},product:{id:'p',organization_id:'org',item_type:'material',sku:'SPK',name:'Speaker'},exclusion:null,membership:{sourceLineId:'part',orderId:'so',verified:true,scope:'included'},salesPriceResolved:true,unitSalePrice:'100.00'},
 {line:{id:'labor',organization_id:'org',proposal_id:'proposal',product_id:null,item_type:'labor',quantity:'2.00',is_customer_supplied:false,description:'Install'},product:null,exclusion:null,membership:{sourceLineId:'labor',orderId:'so',verified:true,scope:'included'},salesPriceResolved:true,unitSalePrice:'125.50'}
 ]});
const good=inspect({source:source()});
assert.equal(good.ok,true);assert.equal(good.authorized,false);assert.equal(good.snapshotReady,false);
assert.deepEqual(good.lines.map(x=>[x.sourceLineId,x.productKind,x.quantity,x.unitEquipmentValueCents]),[['labor','labor',2,12550],['part','equipment',4,10000]]);
// Dealer minimum applies to each product unit, never to extended quantities or labor.
const minimum=inspect({source:source(),minimumUnitValueCents:25000});
assert.equal(minimum.ok,true);
assert.deepEqual(minimum.lines.map(x=>x.productKind),['labor']);
assert.equal(minimum.lines[0].unitEquipmentValueCents,12550);
const expensive=source();expensive.lines[0].unitSalePrice='250.00';
assert.deepEqual(inspect({source:expensive,minimumUnitValueCents:25000}).lines.map(x=>x.productKind),['labor','equipment']);
const changed=source();changed.lines[0].line.quantity='6.00';assert.equal(inspect({source:changed}).lines[1].quantity,6);
const pending=source();pending.changeOrders=[{status:'draft',action_type:'add',new_quantity:99}];assert.deepEqual(inspect({source:pending}).lines,good.lines);
const editing=source();editing.changeOrders=[{status:'approved',is_locked:false,new_quantity:99}];assert.deepEqual(inspect({source:editing}).lines,good.lines);
const removed=source();removed.lines[0].membership.scope='removed';assert.deepEqual(inspect({source:removed}).lines.map(x=>x.productKind),['labor']);
const bad=source();bad.lines[1].salesPriceResolved=false;assert.equal(inspect({source:bad}).ok,false);
const raw=source();raw.readModelVersion=1;assert.equal(inspect({source:raw}).ok,false);
const dup=source();dup.lines[1].line.id='part';dup.lines[1].membership.sourceLineId='part';assert.equal(inspect({source:dup}).ok,false);
console.log('Committed Sales Order parts and labor combined without replaying change orders');
