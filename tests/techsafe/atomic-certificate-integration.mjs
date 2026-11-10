// End-to-end server coordinator + transaction executor + certificate writer.
// Uses a deterministic PostgreSQL protocol fixture; real PostgreSQL race tests
// are separate. No network, production connection, or live synchronization.
import assert from 'node:assert/strict';
import {inspectSerializableEquipmentCandidate} from '../../src/lib/techsafe/serializableEquipmentCandidate.mjs';
import {createSerializableSourceTransaction} from '../../src/lib/techsafe/postgresSerializableTransaction.mjs';
import {persistSerializableEquipmentCertificate} from '../../src/lib/techsafe/postgresCertificateWriter.mjs';
const ids=Array.from({length:5},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const [connectionId,orderId,organizationId,proposalId,certificateId]=ids;
const fingerprint='a'.repeat(64);
const salesOrder={id:orderId,organizationId,proposalId,approved:true,revision:4};
const baseLines=[{id:ids[4],organizationId,proposalId,productId:ids[0],quantity:2}];
const details=[{sourceLineId:ids[4],productRef:ids[0],productKind:'equipment',
 description:'Display',unitEquipmentValueCents:50000,customerSupplied:false,techsafeExcluded:false}];
const evidence={
 connectionId,orderId,transactionConsistent:true,ledgerRowLocked:true,
 connectionActive:true,sourceRevisionVerified:true,connectionGeneration:2,
 ledgerGeneration:2,ledgerConnectionId:connectionId,ledgerSalesOrderId:orderId,
 connectionOrganizationId:organizationId,connectionProposalId:proposalId,
 ledgerRevision:4,ledgerOrganizationId:organizationId,ledgerProposalId:proposalId,
 ledgerState:'candidate',ledgerFingerprint:fingerprint,sourceFingerprint:fingerprint,
 revision:4,salesOrder,baseLines,changeOrders:[],
 sourceManifest:{complete:true,approvalEvidenceVerified:true,salesOrderId:orderId,
 organizationId,proposalId,revision:4,baseLineCount:1,changeOrderCount:0,
 totalChangeOrderCount:0,unapprovedChangeOrderCount:0,changeLineCount:0}
};
function fixture({held=false,stale=false,missingDetails=false,writerError=false,serializationFailure=false,
 approvalRevoked=false,duplicateCertificate=false}={}){
 const statements=[],releases=[];let inserted=false,committed=false;
 const client={
  async query(sql,params){
   statements.push({sql,params});
   if(sql.startsWith('BEGIN')||sql==='ROLLBACK')return {rows:[]};
   if(sql==='COMMIT'){
    if(serializationFailure)throw Object.assign(Error('serialization failure'),{code:'40001'});
    committed=true;return {rows:[]};
   }
   if(sql==='SHOW transaction_isolation')return {rows:[{transaction_isolation:'serializable'}]};
   if(sql.includes('integration_connections'))return {rows:[{
    organization_id:organizationId,proposal_id:proposalId,
    connection_generation:2,enabled:true,status:'active'
   }]};
   if(sql.includes('order_revision_ledger'))return {rows:[{
    organization_id:organizationId,proposal_id:proposalId,
    connection_generation:2,revision:stale?5:4,
    state:held?'held':'candidate',source_fingerprint:fingerprint
   }]};
   if(sql.includes('INSERT INTO techsafe_source.equipment_snapshot_certificates')){
    if(writerError||duplicateCertificate)throw Object.assign(Error('certificate insert rejected'),{code:duplicateCertificate?'23505':'XX000'});
    inserted=true;return {rows:[{certificate_id:certificateId}]};
   }
   throw Error('unexpected database statement: '+sql);
  },
  release(error){releases.push(error)}
 };
 const pool={connect:async()=>client};
 const makeReader=()=>({
  readConsistentSource:async()=>({...evidence,salesOrder:{...salesOrder,approved:!approvalRevoked}}),
  readCompleteEquipmentDetails:async()=>missingDetails?[]:details,
  readCurrentRevision:async()=>({connectionGeneration:2,revision:stale?5:4,
   sourceFingerprint:fingerprint,state:held?'held':'candidate',
   organizationId,proposalId})
 });
 const transact=createSerializableSourceTransaction(pool,makeReader,persistSerializableEquipmentCertificate);
 return {statements,releases,run:()=>inspectSerializableEquipmentCandidate({
  connectionId,orderId,certify:true,withSerializableSourceTransaction:transact
 }),get inserted(){return inserted},get committed(){return committed}};
}
const good=fixture(),result=await good.run();
assert.equal(result.ok,true);assert.equal(result.authorized,false);
assert.equal(result.snapshotReady,false);assert.equal(result.certificateId,certificateId);
assert.equal(good.inserted,true);assert.equal(good.committed,true);
assert.equal(good.statements.filter(x=>x.sql.includes('INSERT INTO techsafe_source.equipment_snapshot_certificates')).length,1);
assert.equal(good.statements.at(-1).sql,'COMMIT');
assert.equal(good.releases.length,1);assert.equal(good.releases[0],undefined);
for(const [label,opts] of Object.entries({
 held:{held:true},stale:{stale:true},missingDetails:{missingDetails:true},
 writerError:{writerError:true},duplicateCertificate:{duplicateCertificate:true},
 serializationFailure:{serializationFailure:true},approvalRevoked:{approvalRevoked:true}
})){
 const x=fixture(opts),v=await x.run();
 assert.equal(v.ok,false,label);assert.equal(v.authorized,false,label);
 assert.equal(v.snapshotReady,false,label);assert.equal(x.committed,false,label);
 assert.equal(x.statements.at(-1).sql,'ROLLBACK',label);
 assert.equal(x.releases.length,1,label);
 assert.ok(x.releases[0] instanceof Error,label);
 if(label==='held'||label==='stale'||label==='missingDetails'||label==='approvalRevoked')
  assert.equal(x.inserted,false,label);
}
console.log('PASS: complete approved-source coordinator, SERIALIZABLE executor and private certificate writer commit only on valid evidence; all negative cases roll back');
