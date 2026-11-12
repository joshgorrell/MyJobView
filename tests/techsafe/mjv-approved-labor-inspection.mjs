import assert from 'node:assert/strict';
import {inspectApprovedSalesOrderLabor as inspect} from '../../src/lib/techsafe/mjvApprovedLaborInspection.mjs';
const source=()=>({trustedCurrentOrderRead:true,currentEquipmentComplete:true,approvedSalesOrder:true,
 organizationId:'org',order:{id:'so',proposal_id:'proposal',organization_id:'org'},lines:[
 {line:{id:'labor1',organization_id:'org',proposal_id:'proposal',item_type:'labor',quantity:'2.00',product_id:null,is_customer_supplied:false},
  product:null,membership:{verified:true,orderId:'so',sourceLineId:'labor1',scope:'included'},
  salesPriceResolved:true,unitSalePrice:'125.50'}]});
const good=inspect({source:source()});
assert.equal(good.ok,true);assert.equal(good.authorized,false);assert.equal(good.snapshotReady,false);
assert.deepEqual(good.labor,[{sourceLineId:'labor1',productKind:'labor',quantity:2,unitEquipmentValueCents:12550}]);
const removed=source();removed.lines[0].membership.scope='removed';assert.deepEqual(inspect({source:removed}).labor,[]);
const supplied=source();supplied.lines[0].line.is_customer_supplied=true;
assert.deepEqual(inspect({source:supplied}).labor,[]);
const zero=source();zero.lines[0].unitSalePrice='0.00';assert.deepEqual(inspect({source:zero}).labor,[]);
const excluded=source();excluded.lines[0].exclusion={organization_id:'org',product_id:null,excluded:true,miscellaneous_placeholder:false};
assert.deepEqual(inspect({source:excluded}).labor,[]);
const foreign=source();foreign.lines[0].exclusion={organization_id:'other',product_id:null,excluded:true,miscellaneous_placeholder:false};
assert.equal(inspect({source:foreign}).ok,false);
const missing=source();delete missing.lines[0].line.is_customer_supplied;
assert.equal(inspect({source:missing}).ok,false);
const draft=source();draft.changeOrders=[{status:'draft',action_type:'add',labor_hours:100}];assert.deepEqual(inspect({source:draft}).labor,good.labor);
const unlocked=source();unlocked.changeOrders=[{status:'approved',is_locked:false,labor_hours:100}];assert.deepEqual(inspect({source:unlocked}).labor,good.labor);
for(const mutation of [s=>{s.readModelVersion=1},s=>{s.approvedSalesOrder=false},s=>{s.lines[0].membership.verified=false},s=>{s.lines[0].salesPriceResolved=false},s=>{s.lines[0].unitSalePrice='-1'},s=>{s.lines[0].line.quantity='1.5'},s=>{s.lines[0].line.organization_id='other'}]){
 const bad=source();mutation(bad);assert.equal(inspect({source:bad}).ok,false);
}
console.log('Approved Sales Order labor inspection is fail-closed and never authorizes Techsafe sync');
