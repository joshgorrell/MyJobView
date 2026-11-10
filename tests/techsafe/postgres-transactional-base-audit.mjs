import assert from 'node:assert/strict';
import {createTransactionalBaseEquipmentAudit} from '../../src/lib/techsafe/postgresTransactionalBaseAudit.mjs';
const ids=Array.from({length:5},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const scope={connectionId:ids[0],orderId:ids[1]};
function fixture({isolation='serializable',active=true,revision=3,changed=false,product=ids[4],orderPresent=true}={}){
 const calls=[];let reads=0;
 const client={async query(sql,params){
  calls.push({sql,params});
  if(sql.includes('SHOW transaction_isolation'))return {rows:[{transaction_isolation:isolation}]};
  if(sql.includes('integration_connections'))return {rows:[{organization_id:ids[2],proposal_id:ids[3],connection_generation:'2',enabled:active,status:'active'}]};
  if(sql.includes('order_revision_ledger')){reads++;return {rows:[{organization_id:ids[2],proposal_id:ids[3],connection_generation:'2',revision:String(changed&&reads===2?revision+1:revision),state:'candidate',source_fingerprint:'a'.repeat(64)}]};}
  if(sql.includes('public.sales_orders'))return {rows:orderPresent?[{id:ids[1],organization_id:ids[2],proposal_id:ids[3]}]:[]};
  if(sql.includes('public.proposal_line_items'))return {rows:[{id:ids[0],organization_id:ids[2],proposal_id:ids[3],product_id:product,quantity:2}]};
  throw Error('unexpected query');
 }};
 return {calls,audit:createTransactionalBaseEquipmentAudit(client)};
}
const f=fixture(),result=await f.audit(scope);
assert.equal(result.ok,true);assert.equal(result.authorized,false);
assert.equal(result.snapshotReady,false);assert.equal(result.approvalVerified,false);
assert.equal(result.sourceManifestComplete,false);
assert.equal(result.baseLineCount,1);assert.equal(result.revision,3);
assert.equal(f.calls.filter(c=>c.sql.includes('order_revision_ledger')).length,2);
assert.equal(f.calls.filter(c=>c.sql.includes('integration_connections')).length,2);
assert.ok(f.calls.filter(c=>c.sql.includes('FOR UPDATE')).length===4);
for(const bad of [
 {isolation:'read committed'},{active:false},{revision:0},
 {changed:true},{product:null},{orderPresent:false}
]){
 const x=fixture(bad);
 const v=await x.audit(scope);
 assert.equal(v.ok,false);assert.equal(v.authorized,false);
}
const unsafe=fixture({isolation:'read committed'});
assert.equal((await unsafe.audit(scope)).reason,'serializable_transaction_required');
assert.equal(unsafe.calls.length,1);
console.log('PASS: serializable Sales Order base audit checks locked revision twice, never certifies incomplete source');
