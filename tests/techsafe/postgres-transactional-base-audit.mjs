import assert from 'node:assert/strict';
import {createTransactionalBaseEquipmentAudit} from '../../src/lib/techsafe/postgresTransactionalBaseAudit.mjs';
const ids=Array.from({length:5},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const scope={connectionId:ids[0],orderId:ids[1]};
function fixture({isolation='serializable',active=true,revision=3,changed=false,product=ids[4],orderPresent=true,baseReadThrows=false,fingerprint='a'.repeat(64),ledgerState='candidate',committedChange=false,changeValid=true,approvalValid=true}={}){
 const calls=[];let reads=0;
 const client={async query(sql,params){
  calls.push({sql,params});
  if(sql.includes('SHOW transaction_isolation'))return {rows:[{transaction_isolation:isolation}]};
  if(sql.includes('integration_connections'))return {rows:[{organization_id:ids[2],proposal_id:ids[3],connection_generation:'2',enabled:active,status:'active'}]};
  if(sql.includes('order_revision_ledger')){reads++;return {rows:[{organization_id:ids[2],proposal_id:ids[3],connection_generation:'2',revision:String(changed&&reads===2?revision+1:revision),state:ledgerState,source_fingerprint:fingerprint}]};}
  if(sql.includes('public.proposals p JOIN public.sales_orders so'))return {rows:approvalValid?[{
   id:ids[3],sales_order_id:ids[1],status:'approved',approved_at:'2026-11-12',
   approval_completed_at:null,accepted_via_method:'portal',approved_by:ids[4],
   contact_id:ids[4],order_id:ids[1],organization_id:ids[2],
   proposal_id:ids[3],order_contact_id:ids[4]
  }]:[]};
  if(sql.includes('public.sales_orders'))return {rows:orderPresent?[{id:ids[1],organization_id:ids[2],proposal_id:ids[3]}]:[]};
  if(sql.includes('public.proposal_line_items')&&baseReadThrows)throw Error('database read failed');
  if(sql.includes('public.proposal_line_items'))return {rows:[{id:ids[0],organization_id:ids[2],proposal_id:ids[3],product_id:product,quantity:2,committed_change_order_line_id:committedChange?ids[4]:null}]};
  if(sql.includes('public.change_order_line_items'))return {rows:changeValid?[{
   id:ids[4],organization_id:ids[2],change_order_id:ids[4],proposal_line_item_id:ids[0],
   order_organization_id:ids[2],sales_order_id:ids[1],proposal_id:ids[3],
   status:'approved',approval_date:'2026-11-12',customer_approved:true,
   requires_customer_approval:true,is_active:true,is_locked:true
  }]:[]};
  throw Error('unexpected query');
 }};
 return {calls,audit:createTransactionalBaseEquipmentAudit(client)};
}
const f=fixture(),result=await f.audit(scope);
assert.equal(result.ok,true);assert.equal(result.authorized,false);
assert.equal(result.snapshotReady,false);assert.equal(result.approvalVerified,false);
assert.equal(result.baseLinesAreCurrent,true);
assert.equal(result.baseLineSource,'current_proposal_line_items');
assert.equal(result.sourceManifestComplete,false);
assert.equal(result.committedChangeProvenanceInspected,true);
assert.equal(result.approvalMetadataInspected,true);
assert.equal(result.originalLineMembershipVerified,false);
assert.deepEqual(result.committedChangeProvenance,[]);
assert.equal(result.baseLineCount,1);assert.equal(result.revision,3);
assert.equal(f.calls.filter(c=>c.sql.includes('order_revision_ledger')).length,2);
assert.equal(f.calls.filter(c=>c.sql.includes('integration_connections')).length,2);
assert.ok(f.calls.filter(c=>c.sql.includes('FOR UPDATE')).length===4);
for(const bad of [
 {isolation:'read committed'},{active:false},{revision:0},
 {changed:true},{ledgerState:'held'},{fingerprint:'0'.repeat(64)},{orderPresent:false},{baseReadThrows:true}
]){
 const x=fixture(bad);
 const v=await x.audit(scope);
 assert.equal(v.ok,false);assert.equal(v.authorized,false);
}
const applied=fixture({committedChange:true});
const appliedResult=await applied.audit(scope);
assert.equal(appliedResult.ok,true);
assert.equal(appliedResult.committedChangeProvenance.length,1);
assert.equal(appliedResult.committedChangeProvenance[0].sourceLineId,ids[0]);
assert.equal(appliedResult.authorized,false);
assert.equal(applied.calls.filter(x=>x.sql.includes('order_revision_ledger')).length,2);
const invalidApproval=await fixture({approvalValid:false}).audit(scope);
assert.equal(invalidApproval.ok,false);
assert.equal(invalidApproval.reason,'approved_sales_order_binding_missing');
const invalidChange=await fixture({committedChange:true,changeValid:false}).audit(scope);
assert.equal(invalidChange.ok,false);
assert.equal(invalidChange.reason,'committed_change_provenance_incomplete');
const standaloneLabor=await fixture({product:null}).audit(scope);
assert.equal(standaloneLabor.ok,true,'Standalone labor without catalog product is a valid current Sales Order row');
assert.equal(standaloneLabor.authorized,false);
assert.equal(standaloneLabor.baseLines[0].productId,null);
assert.equal((await fixture({baseReadThrows:true}).audit(scope)).reason,'base_equipment_read_failed');
for(const opts of [{ledgerState:'held'},{fingerprint:'0'.repeat(64)}]){
 const x=fixture(opts),v=await x.audit(scope);
 assert.equal(v.ok,false);
 assert.equal(x.calls.some(c=>c.sql.includes('public.proposal_line_items')),false,'held ledger must not scan equipment');
}
const unsafe=fixture({isolation:'read committed'});
assert.equal((await unsafe.audit(scope)).reason,'serializable_transaction_required');
assert.equal(unsafe.calls.length,1);
console.log('PASS: serializable Sales Order base audit checks locked revision twice, never certifies incomplete source');
