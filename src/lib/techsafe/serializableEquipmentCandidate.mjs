// Server-only transaction coordinator for approved Sales Order equipment.
// Deliberately does not write certificates, send drafts, or authorize checkout.
// The supplied adapter must be a trusted server-owned SERIALIZABLE transaction.
import {inspectVerifiedSalesOrderEquipment} from './verifiedSourceRead.mjs';
import {buildCompleteEquipmentContentEvidence} from './completeEquipmentContentEvidence.mjs';
const hold=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)&&x!=='0'.repeat(64);
const positive=x=>Number.isSafeInteger(x)&&x>0;
export async function inspectSerializableEquipmentCandidate({
 connectionId,orderId,withSerializableSourceTransaction,certify=false
}={}) {
 if(!id(connectionId)||!id(orderId))return hold('invalid_source_identity');
 if(typeof withSerializableSourceTransaction!=='function')return hold('serializable_transaction_unavailable');
 if(typeof certify!=='boolean')return hold('invalid_certification_mode');
 try {
  let callbackInvocations=0;
  let callbackResult;
  const result=await withSerializableSourceTransaction(async tx=>{
   callbackInvocations++;
   if(callbackInvocations!==1)return hold('transaction_callback_replayed');
   callbackResult=await (async()=>{
   // A server adapter must attest the actual isolation level, row locks and
   // immutable transaction context; these flags alone are not DB proof.
   if(!tx||tx.isolationLevel!=='serializable'||tx.serverOwned!==true||
      typeof tx.readConsistentSource!=='function'||
      typeof tx.readCompleteEquipmentDetails!=='function'||
      typeof tx.readCurrentRevision!=='function')
    return hold('transaction_adapter_unverified');
   let source;
   const inspection=await inspectVerifiedSalesOrderEquipment({
    connectionId,orderId,
    readConsistentSource:async scope=>{
     source=await tx.readConsistentSource(scope);
     return source;
    }
   });
   if(inspection.ok!==true||inspection.authorized!==false||inspection.snapshotReady!==false)
    return hold('approved_sales_order_inspection_failed');
   if(!source||source.connectionId!==connectionId||source.orderId!==orderId||
      !id(source.connectionOrganizationId)||!id(source.connectionProposalId)||
      !positive(source.connectionGeneration)||!positive(source.revision)||
      !hash(source.sourceFingerprint))
    return hold('transaction_source_incomplete');
   const details=await tx.readCompleteEquipmentDetails({
    connectionId,orderId,organizationId:source.connectionOrganizationId,
    proposalId:source.connectionProposalId,revision:source.revision
   });
   const evidence=buildCompleteEquipmentContentEvidence({
    inspection,details,connectionId,orderId,
    organizationId:source.connectionOrganizationId,
    proposalId:source.connectionProposalId,
    connectionGeneration:source.connectionGeneration,
    sourceFingerprint:source.sourceFingerprint
   });
   if(evidence.ok!==true)return hold('complete_equipment_evidence_failed');
   // Check the ledger again *inside* the same transaction, after every line read.
   // A concurrent writer must cause a serialization retry/abort, not a certificate.
   const current=await tx.readCurrentRevision({connectionId,orderId});
   if(!current||current.connectionGeneration!==source.connectionGeneration||
      current.revision!==source.revision||current.sourceFingerprint!==source.sourceFingerprint||
      current.state!=='candidate')
    return hold('source_changed_during_transaction');
   if(certify){
    if(typeof tx.persistCertificate!=='function')throw new Error('trusted_certificate_writer_unavailable');
    const persisted=await tx.persistCertificate(evidence);
    // Throw rather than return a hold: the enclosing transaction must roll back
    // if a writer cannot confirm the certificate insertion.
    if(persisted?.ok!==true||persisted.authorized!==false||
       persisted.snapshotReady!==false||
       persisted.reason!=='certificate_persisted_not_dispatch_authorized')
     throw new Error('certificate_persistence_unverified');
    return {...evidence,certificateId:persisted.certificateId,
     authorized:false,snapshotReady:false,reason:'certificate_persisted_not_dispatch_authorized'};
   }
   return {...evidence,authorized:false,snapshotReady:false,
    reason:'serializable_candidate_not_certified'};
   })();
   return callbackResult;
  });
  // The adapter must invoke the callback exactly once and return its exact
  // result. It must not substitute a fabricated candidate or bypass inspection.
  if(callbackInvocations!==1||!callbackResult||result!==callbackResult||
     !result||result.authorized!==false||result.snapshotReady!==false)
   return hold('invalid_transaction_result');
  return result;
 } catch {
  // Includes PostgreSQL 40001 serialization failures; caller must retry the
  // entire transaction with a fresh read, never reuse an old digest.
  return hold('serializable_transaction_aborted');
 }
}
