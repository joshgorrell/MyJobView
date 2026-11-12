import assert from 'node:assert/strict';
import {createSalesOrderChangeHistoryInventory} from '../../src/lib/techsafe/postgresSalesOrderChangeHistoryInventory.mjs';
const ids=Array.from({length:7},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const scope={orderId:ids[0],organizationId:ids[1],proposalId:ids[2]};
const item={changeOrderId:ids[3],changeOrderLineId:ids[4]};
const row={id:ids[3],organization_id:ids[1],sales_order_id:ids[0],proposal_id:ids[2],
 status:'approved',is_active:false,is_locked:true,approval_date:'2026-11-12',
 requires_customer_approval:true,customer_approved:true,
 change_line_id:ids[4],line_organization_id:ids[1]};
async function run(rows,refs=[item]){
 const reader=createSalesOrderChangeHistoryInventory({async query(sql,args){
  assert.ok(sql.includes('LEFT JOIN public.change_order_line_items'));
  assert.ok(sql.includes('FOR SHARE OF co'));
  assert.deepEqual(args,[ids[0]]);
  assert.ok(sql.includes('WHERE co.sales_order_id=$1'));
  assert.ok(!sql.includes('WHERE co.organization_id='));
  return {rows};
 }});
 return reader({...scope,committedChangeProvenance:refs});
}
const valid=await run([row]);
assert.equal(valid.ok,true);assert.equal(valid.authorized,false);
assert.equal(valid.historyCompletenessCertified,false);
assert.equal(valid.changeOrderCount,1);assert.equal(valid.unreferencedChangeLines,0);
assert.equal(valid.needsHistoricalReconciliation,false);
assert.equal(valid.approvedUnreferencedLines,0);
const unreferenced=await run([row],[]);
assert.equal(unreferenced.ok,true);
assert.equal(unreferenced.unreferencedChangeLines,1);
assert.equal(unreferenced.approvedUnreferencedLines,1);
assert.equal(unreferenced.needsHistoricalReconciliation,true);
const pending=await run([{...row,is_active:true,is_locked:false,approval_date:null}],[]);
assert.equal(pending.ok,true);
assert.equal(pending.unresolvedChangeOrders,1);
assert.equal(pending.approvedUnreferencedLines,0);
assert.equal(pending.needsHistoricalReconciliation,true);
const staleDraft=await run([{...row,status:'draft',is_active:true}],[]);
assert.equal(staleDraft.ok,true);
assert.equal(staleDraft.unresolvedChangeOrders,1);
assert.equal(staleDraft.approvedUnreferencedLines,0);
assert.equal(staleDraft.needsHistoricalReconciliation,true);
assert.equal((await run([row,{...row,customer_approved:false}])).ok,false);
const notApplied=await run([{...row,is_active:true}],[]);
assert.equal(notApplied.unresolvedChangeOrders,1);
assert.equal(notApplied.approvedUnreferencedLines,0);
for(const rows of [[],[{...row,organization_id:ids[5]}],[{...row,sales_order_id:ids[5]}],
 [{...row,line_organization_id:ids[5]}],[row,row]]){
 const result=await run(rows);assert.equal(result.ok,false);assert.equal(result.authorized,false);
}
assert.equal((await run([row],[item,item])).ok,false);
assert.equal((await run([],[])).ok,true);
console.log('PASS: full current change-order inventory validates scope and references without certifying history');
