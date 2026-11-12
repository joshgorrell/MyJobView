import assert from 'node:assert/strict';
import {createChangeOrderHistoricalEvidenceReader} from '../../src/lib/techsafe/postgresChangeOrderHistoricalEvidence.mjs';
const ids=Array.from({length:7},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const scope={orderId:ids[0],organizationId:ids[1],proposalId:ids[2]};
const row={change_order_id:ids[3],order_organization_id:ids[1],sales_order_id:ids[0],
 proposal_id:ids[2],history_id:ids[4],history_organization_id:ids[1],
 action:'modified',created_at:'2026-11-12T00:00:00Z',has_snapshot:true};
async function read(rows){
 const fn=createChangeOrderHistoricalEvidenceReader({async query(sql,args){
  assert.ok(sql.includes('public.change_order_history'));
  assert.ok(sql.includes('WHERE co.sales_order_id=$1'));
  assert.ok(!sql.includes('WHERE co.organization_id'));
  assert.deepEqual(args,[ids[0]]);
  return {rows};
 }});
 return fn(scope);
}
const good=await read([row,{...row,history_id:ids[5],action:'status_changed',has_snapshot:false}]);
assert.equal(good.ok,true);assert.equal(good.authorized,false);
assert.equal(good.snapshotReady,false);assert.equal(good.historyEvents,2);
assert.equal(good.eventsWithSnapshot,1);
assert.equal(good.changeOrderCount,1);
assert.equal(good.originalApprovedMembershipCertified,false);
const empty=await read([{...row,history_id:null,history_organization_id:null,action:null,created_at:null,has_snapshot:false}]);
assert.equal(empty.ok,true);assert.equal(empty.ordersWithoutHistory,1);
for(const bad of [
 [{...row,order_organization_id:ids[6]}],
 [{...row,history_organization_id:ids[6]}],
 [{...row,proposal_id:ids[6]}],
 [{...row,sales_order_id:ids[6]}],
 [{...row,action:null}],
 [{...row,has_snapshot:null}],
 [row,row]
])assert.equal((await read(bad)).ok,false);
console.log('PASS: historical event evidence stays scoped, nonauthorizing and distinct from approved membership');
