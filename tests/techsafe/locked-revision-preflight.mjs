import assert from 'node:assert/strict';
import {inspectLockedTechsafeRevision} from '../../src/lib/techsafe/lockedRevisionPreflight.mjs';
const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'];
const [connectionId,orderId,organizationId,proposalId]=ids;
const base={connectionId,orderId,organizationId,proposalId};
function fixture({isolation='serializable',mutate=false,duplicate=false,throwOnRead=false}={}){
 let reads=0,inspections=0;
 const client={async query(sql){
  if(sql==='SHOW transaction_isolation')return {rows:[{transaction_isolation:isolation}]};
  if(throwOnRead)throw Error('offline');
  if(sql.includes('integration_connections'))return {rows:Array.from({length:duplicate?2:1},()=>({
   organization_id:organizationId,proposal_id:proposalId,connection_generation:'2',enabled:true,status:'active'}))};
  if(sql.includes('order_revision_ledger')){reads++;return {rows:[{organization_id:organizationId,
   proposal_id:proposalId,connection_generation:'2',revision:mutate&&reads===2?'5':'4',
   source_fingerprint:'a'.repeat(64),state:'candidate'}]};}
  throw Error('unexpected_query');
 }};
 return {client,inspectSource:async()=>{inspections++;return {ok:true,authorized:false,snapshotReady:false};},
  getReads:()=>reads,getInspections:()=>inspections};
}
const good=fixture();
const result=await inspectLockedTechsafeRevision({...base,...good});
assert.equal(result.ok,true);
assert.equal(result.authorized,false);
assert.equal(result.snapshotReady,false);
assert.equal(result.revision,4);
assert.equal(good.getReads(),2);
assert.equal(good.getInspections(),1);
for(const [options,reason] of [
 [{isolation:'read committed'},'serializable_isolation_required'],
 [{mutate:true},'source_revision_changed'],
 [{duplicate:true},'source_revision_preflight_failed'],
 [{throwOnRead:true},'source_revision_preflight_failed']
]){
 const f=fixture(options);
 const outcome=await inspectLockedTechsafeRevision({...base,...f});
 assert.equal(outcome.reason,reason);
 assert.equal(outcome.authorized,false);
}
const scope=fixture();
assert.equal((await inspectLockedTechsafeRevision({...base,organizationId:ids[1],...scope})).reason,'source_scope_mismatch');
const invalid=fixture();
assert.equal((await inspectLockedTechsafeRevision({...base,connectionId:'bad',...invalid})).reason,'invalid_binding');
assert.equal(invalid.getReads(),0);
const unsafe=fixture();
assert.equal((await inspectLockedTechsafeRevision({...base,client:unsafe.client,inspectSource:async()=>({ok:true,authorized:true,snapshotReady:true})})).reason,'source_inspection_unverified');
console.log('PASS: Techsafe locked revision preflight remains non-authorizing and fails closed');
