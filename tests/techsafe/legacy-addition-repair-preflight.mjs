import assert from 'node:assert/strict';
import {createLegacyAdditionRepairPreflight} from '../../src/lib/techsafe/postgresLegacyAdditionRepairPreflight.mjs';
const ids=Array.from({length:6},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const [orderId,organizationId,proposalId]=ids;
const base={change_line_id:ids[3],line_organization_id:organizationId,
 change_organization_id:organizationId,change_proposal_id:proposalId,
 status:'approved',is_active:false,is_locked:true,approval_date:'2026-04-08',
 requires_customer_approval:true,customer_approved:true,
 product_name:'85 inch TV',product_description:null,quantity:'1.00',
 unit_price:'1999.95',linked_line_id:null,exact_current_matches:0};
async function run(rows){
 let calls=0;
 const inspect=createLegacyAdditionRepairPreflight({async query(sql,args){
  calls++;assert.deepEqual(args,[orderId,organizationId,proposalId]);
  assert.match(sql,/candidate\.description=COALESCE/);
  assert.match(sql,/candidate\.quantity=li\.new_quantity/);
  assert.doesNotMatch(sql,/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  return {rows};
 }});
 const result=await inspect({orderId,organizationId,proposalId});
 assert.equal(calls,1);return result;
}
const missing=await run([base]);
assert.equal(missing.ok,true);assert.equal(missing.repairReady,false);
assert.equal(missing.findings[0].state,'missing_current_addition_requires_manual_review');
assert.equal(missing.noWritesPerformed,true);
const possible=await run([{...base,exact_current_matches:1}]);
assert.equal(possible.findings[0].state,'possible_legacy_match_requires_manual_review');
const linked=await run([{...base,linked_line_id:ids[4],exact_current_matches:1}]);
assert.equal(linked.findings[0].state,'already_linked');
const draft=await run([{...base,status:'draft',is_active:true,is_locked:false,approval_date:null}]);
assert.equal(draft.findings[0].state,'not_proven_applied');
assert.equal((await run([{...base,change_organization_id:ids[5]}])).ok,false);
assert.equal((await run([base,base])).ok,false);
const error=createLegacyAdditionRepairPreflight({query:async()=>{throw Error('private')}});
assert.equal((await error({orderId,organizationId,proposalId})).ok,false);
console.log('PASS: legacy addition repair preflight detects missing and possible duplicate lines without writes');
