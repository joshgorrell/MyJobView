import assert from 'node:assert/strict';
import {createChangeOrderCommitCoverageInspector} from '../../src/lib/techsafe/postgresChangeOrderCommitCoverage.mjs';
const ids=Array.from({length:5},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const [orderId,organizationId]=ids;
const base={id:ids[2],organization_id:organizationId,sales_order_id:orderId,
 status:'approved',is_active:false,is_locked:true,approval_date:'2026-11-12',
 requires_customer_approval:true,customer_approved:true,line_count:4,revision_count:0};
async function inspect(rows){
 const reader=createChangeOrderCommitCoverageInspector({async query(sql,params){
  assert.deepEqual(params,[orderId]);assert.match(sql,/change_order_commit.revisions/);
  return {rows};
 }});
 return reader({orderId,organizationId});
}
const legacy=await inspect([base,{...base,id:ids[3],line_count:2},
 {...base,id:ids[4],status:'draft',is_active:true,is_locked:false,
 approval_date:null,revision_count:0}]);
assert.equal(legacy.ok,true);assert.equal(legacy.authorized,false);
assert.equal(legacy.appliedLegacyWithoutRevision,2);
assert.equal(legacy.draftOrUnapplied,1);
assert.equal(legacy.requiresLegacyReconciliation,true);
assert.equal(legacy.historyCompletenessCertified,false);
const modern=await inspect([{...base,revision_count:1}]);
assert.equal(modern.appliedWithRevision,1);
assert.equal(modern.appliedLegacyWithoutRevision,0);
const ambiguous=await inspect([{...base,is_active:true}]);
assert.equal(ambiguous.ambiguous,1);
assert.equal(ambiguous.authorized,false);
assert.equal((await inspect([{...base,organization_id:ids[4]}])).ok,false);
assert.equal((await inspect([])).ok,true);
const unavailable=createChangeOrderCommitCoverageInspector({query:async()=>{throw Error('secret')}});
assert.equal((await unavailable({orderId,organizationId})).reason,'commit_coverage_read_failed');
console.log('PASS: legacy MJV applied change orders are identified, never silently certified');
