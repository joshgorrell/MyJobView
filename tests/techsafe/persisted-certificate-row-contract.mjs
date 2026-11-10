import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectPersistedCertificateRow as inspect} from '../../src/lib/techsafe/persistedCertificateRowContract.mjs';
const ids=Array.from({length:5},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const [connectionId,orderId,organizationId,proposalId,certificateId]=ids;
const source='a'.repeat(64),content='b'.repeat(64);
const row={certificate_id:certificateId,connection_id:connectionId,sales_order_id:orderId,organization_id:organizationId,proposal_id:proposalId,connection_generation:2,source_revision:5,source_fingerprint:source,equipment_fingerprint:content,canonical_version:'mjv-techsafe-complete-equipment-v1',equipment_count:2,state:'certified',certified_at:'2026-11-10T12:00:00Z'};
const connection={connectionId,salesOrderId:orderId,organizationId,proposalId,generation:2,active:true,enabled:true};
const ledger={connectionId,orderId,organizationId,proposalId,generation:2,revision:5,state:'candidate',fingerprint:source};
const freshEvidence={ok:true,authorized:false,snapshotReady:false,connectionId,orderId,organizationId,proposalId,connectionGeneration:2,revision:5,fingerprint:source,contentFingerprint:content};
const args={row,connection,ledger,freshEvidence};
const good=inspect(args);
assert.equal(good.ok,false);assert.equal(good.authorized,false);assert.equal(good.snapshotReady,false);
assert.equal(good.reason,'certificate_not_committed');
for(const patch of [{equipment_fingerprint:'c'.repeat(64)},{equipment_fingerprint:undefined},{source_fingerprint:'c'.repeat(64)},{source_revision:4},{connection_generation:3},{organization_id:ids[4]},{canonical_version:'unknown'},{equipment_count:-1},{state:'held'},{certified_at:null},{certificate_id:'bad'}]){
 const result=inspect({...args,row:{...row,...patch}});
 assert.equal(result.ok,false,JSON.stringify(patch));assert.equal(result.authorized,false);assert.equal(result.snapshotReady,false);
}
assert.equal(inspect({...args,row:null}).reason,'certificate_row_missing');
assert.equal(inspect({...args,ledger:{...ledger,revision:4}}).ok,false);
assert.equal(inspect({...args,freshEvidence:{...freshEvidence,contentFingerprint:'c'.repeat(64)}}).ok,false);
const migration=readFileSync(new URL('../../supabase/migrations/20261109183000_techsafe_equipment_certificate_storage.sql',import.meta.url),'utf8');
for(const field of ['certificate_id','connection_id','sales_order_id','organization_id','proposal_id','connection_generation','source_revision','source_fingerprint','equipment_fingerprint','canonical_version','equipment_count','state','certified_at'])assert.ok(migration.includes(field),field);
assert.match(migration,/REVOKE ALL ON TABLE techsafe_source\.equipment_snapshot_certificates/);
assert.match(migration,/FORCE ROW LEVEL SECURITY/);
console.log('PASS: SQL certificate row mapping cannot fabricate trusted approval or dispatch authority');
