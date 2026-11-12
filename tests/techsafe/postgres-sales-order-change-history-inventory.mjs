import assert from 'node:assert/strict';
import {createSalesOrderChangeHistoryInventory} from '../../src/lib/techsafe/postgresSalesOrderChangeHistoryInventory.mjs';
const ids=Array.from({length:7},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const scope={orderId:ids[0],organizationId:ids[1],proposalId:ids[2]};
const item={changeOrderId:ids[3],changeOrderLineId:ids[4]};
const row={id:ids[3],organization_id:ids[1],sales_order_id:ids[0],proposal_id:ids[2],
 status:'approved',is_active:true,is_locked:true,approval_date:'2026-11-12',
 requires_customer_approval:true,customer_approved:true,
 change_line_id:ids[4],line_organization_id:ids[1]};
async function run(rows,refs=[item]){
 const reader=createSalesOrderChangeHistoryInventory({async query(sql,args){
  assert.ok(sql.includes('LEFT JOIN public.change_order_line_items'));
  assert.ok(sql.includes('FOR SHARE OF co'));
  assert.deepEqual(args,[ids[1],ids[0],ids[2]]);
  return {rows};
 }});
 return reader({...scope,committedChangeProvenance:refs});
}
const valid=await run([row]);
assert.equal(valid.ok,true);assert.equal(valid.authorized,false);
assert.equal(valid.historyCompletenessCertified,false);
assert.equal(valid.changeOrderCount,1);assert.equal(valid.unreferencedChangeLines,0);
const unreferenced=await run([row],[]);
assert.equal(unreferenced.ok,true);
assert.equal(unreferenced.unreferencedChangeLines,1);
for(const rows of [[],[{...row,organization_id:ids[5]}],[{...row,sales_order_id:ids[5]}],
 [{...row,line_organization_id:ids[5]}],[row,row]]){
 const result=await run(rows);assert.equal(result.ok,false);assert.equal(result.authorized,false);
}
assert.equal((await run([row],[item,item])).ok,false);
assert.equal((await run([],[])).ok,true);
console.log('PASS: full current change-order inventory validates scope and references without certifying history');
