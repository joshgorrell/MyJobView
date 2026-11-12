import assert from 'node:assert/strict';
import {createCommittedChangeProvenanceReader} from '../../src/lib/techsafe/postgresCommittedChangeProvenance.mjs';
const ids=Array.from({length:8},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const scope={orderId:ids[0],organizationId:ids[1],proposalId:ids[2]};
const line={id:ids[3],organizationId:ids[1],proposalId:ids[2],committedChangeOrderLineId:ids[4]};
const row={id:ids[4],organization_id:ids[1],change_order_id:ids[5],proposal_line_item_id:ids[3],
 order_organization_id:ids[1],sales_order_id:ids[0],proposal_id:ids[2],
 status:'approved',approval_date:'2026-11-12T00:00:00Z',
 customer_approved:true,requires_customer_approval:true,is_active:true,is_locked:true};
async function check(rows,baseLines=[line]){
 let calls=0;
 const read=createCommittedChangeProvenanceReader({async query(sql,params){
  calls++;
  assert.ok(sql.includes('public.change_order_line_items'));
  assert.ok(sql.includes('public.change_orders'));
  assert.deepEqual(params,[[ids[4]],ids[1]]);
  return {rows};
 }});
 return {result:await read({...scope,baseLines}),calls};
}
const good=await check([row]);
assert.equal(good.result.ok,true);
assert.equal(good.result.authorized,false);
assert.equal(good.result.snapshotReady,false);
assert.equal(good.result.provenance[0].sourceLineId,ids[3]);
for(const bad of [
 [],[{...row,organization_id:ids[7]}],[{...row,sales_order_id:ids[7]}],
 [{...row,proposal_id:ids[7]}],[{...row,proposal_line_item_id:ids[7]}],
 [{...row,is_locked:false}],[{...row,approval_date:null}],
 [{...row,customer_approved:false}],[row,row]
]){
 const x=await check(bad);assert.equal(x.result.ok,false);
 assert.equal(x.result.authorized,false);
}
const none=await check([],[{...line,committedChangeOrderLineId:null}]);
assert.equal(none.result.ok,true);
assert.equal(none.calls,0);
const duplicate=await check([],[line,{...line,id:ids[6]}]);
assert.equal(duplicate.result.ok,false);
assert.equal(duplicate.calls,0);
console.log('PASS: source-scoped committed change provenance is read-only, fail-closed and never authorizes delivery');
