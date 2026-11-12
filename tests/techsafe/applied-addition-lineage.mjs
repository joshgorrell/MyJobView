import assert from 'node:assert/strict';
import {createAppliedAdditionLineageInspector} from '../../src/lib/techsafe/postgresAppliedAdditionLineage.mjs';
const ids=Array.from({length:7},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const [orderId,organizationId,proposalId]=ids;
const base={change_line_id:ids[3],line_organization_id:organizationId,
 change_organization_id:organizationId,change_proposal_id:proposalId,
 status:'approved',is_active:false,is_locked:true,approval_date:'2026-11-12',
 requires_customer_approval:true,customer_approved:true,current_line_id:null,
 current_organization_id:null,current_proposal_id:null};
async function check(rows){
 const read=createAppliedAdditionLineageInspector({async query(sql,params){
  assert.deepEqual(params,[orderId]);assert.match(sql,/committed_change_order_line_id/);
  return {rows};
 }});
 return read({orderId,organizationId,proposalId});
}
const legacy=await check([base,{...base,change_line_id:ids[4]},
 {...base,change_line_id:ids[5],status:'draft',is_active:true,is_locked:false,approval_date:null}]);
assert.equal(legacy.ok,true);assert.equal(legacy.unlinkedAppliedAdditions,2);
assert.equal(legacy.draftAdditions,1);assert.equal(legacy.authorized,false);
assert.equal(legacy.lineageCertified,false);
const linked=await check([{...base,current_line_id:ids[6],
 current_organization_id:organizationId,current_proposal_id:proposalId}]);
assert.equal(linked.linkedAppliedAdditions,1);
assert.equal(linked.requiresLegacyReconciliation,false);
assert.equal((await check([{...base,line_organization_id:ids[6]}])).ok,false);
assert.equal((await check([base,base])).ok,false);
assert.equal((await check([])).ok,true);
const unavailable=createAppliedAdditionLineageInspector({query:async()=>{throw Error('private')}});
assert.equal((await unavailable({orderId,organizationId,proposalId})).reason,'applied_addition_lineage_read_failed');
console.log('PASS: applied addition lineage flags missing legacy links without authorizing export');
