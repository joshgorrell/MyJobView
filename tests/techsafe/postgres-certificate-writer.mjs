import assert from 'node:assert/strict';
import {persistSerializableEquipmentCertificate as persist} from '../../src/lib/techsafe/postgresCertificateWriter.mjs';
const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'];
const evidence={ok:true,authorized:false,snapshotReady:false,connectionId:ids[0],orderId:ids[1],organizationId:ids[2],proposalId:ids[3],connectionGeneration:1,revision:2,sourceFingerprint:'a'.repeat(64),contentFingerprint:'b'.repeat(64),lineCount:1};
function fixture({isolation='serializable',active=true,revision=2,fingerprint=evidence.sourceFingerprint,duplicate=false}={}){
 const calls=[];
 const client={async query(sql,params){calls.push({sql,params});
  if(sql==='SHOW transaction_isolation')return {rows:[{transaction_isolation:isolation}]};
  if(sql.includes('integration_connections'))return {rows:[{organization_id:ids[2],proposal_id:ids[3],connection_generation:'1',enabled:active,status:'active'}]};
  if(sql.includes('order_revision_ledger'))return {rows:[{organization_id:ids[2],proposal_id:ids[3],connection_generation:'1',revision:String(revision),state:'candidate',source_fingerprint:fingerprint}]};
  if(duplicate)throw Object.assign(Error('unique violation'),{code:'23505'});
  return {rows:[{certificate_id:ids[0]}]};
 }};
 return {client,calls};
}
const f=fixture();
const result=await persist({client:f.client,evidence});
assert.equal(result.ok,true);assert.equal(result.authorized,false);assert.equal(result.snapshotReady,false);
assert.equal(f.calls.length,4);
assert.match(f.calls[1].sql,/FOR UPDATE/);assert.match(f.calls[2].sql,/FOR UPDATE/);
assert.match(f.calls[3].sql,/INSERT INTO techsafe_source\.equipment_snapshot_certificates/);
assert.deepEqual(f.calls[3].params,[ids[0],ids[1],ids[2],ids[3],1,2,'a'.repeat(64),'b'.repeat(64),1]);
for(const options of [{isolation:'read committed'},{active:false},{revision:3},{fingerprint:'c'.repeat(64)}]){
 const x=fixture(options);const output=await persist({client:x.client,evidence});
 assert.equal(output.ok,false);assert.equal(output.authorized,false);
 assert.ok(!x.calls.some(c=>c.sql.includes('INSERT INTO')));
}
const duplicate=fixture({duplicate:true});
await assert.rejects(()=>persist({client:duplicate.client,evidence}),{code:'23505'});
for(const bad of [{...evidence,contentFingerprint:'0'.repeat(64)},{...evidence,authorized:true},{...evidence,lineCount:-1}]){
 const x=fixture();assert.equal((await persist({client:x.client,evidence:bad})).ok,false);
 assert.equal(x.calls.length,0);
}
console.log('PASS: private certificate writer enforces serializable isolation, locked scope, strict evidence and no dispatch authorization');
