// Private transactional audit of actual Sales Order base equipment.
// Explicitly NOT the authoritative source reader: no approval attestation,
// change-order completeness, equipment valuation, certificate or delivery.
import {createLockedRevisionReader} from './postgresLockedRevisionReader.mjs';
import {createPostgresBaseEquipmentScanner} from './postgresBaseEquipmentScanner.mjs';
const hold=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export function createTransactionalBaseEquipmentAudit(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 const readRevision=createLockedRevisionReader(client);
 const scanBase=createPostgresBaseEquipmentScanner(client);
 return async ({connectionId,orderId}={})=>{
  // Lock connection then ledger, before reading the approved-order base rows.
  // This must run inside the caller's SERIALIZABLE transaction.
  const isolation=await client.query('SHOW transaction_isolation');
  if(isolation?.rows?.[0]?.transaction_isolation!=='serializable')
   return hold('serializable_transaction_required');
  let first;
  try{first=await readRevision({connectionId,orderId});}
  catch{return hold('locked_revision_unverified');}
  const base=await scanBase({orderId,organizationId:first.organizationId,proposalId:first.proposalId});
  if(base.ok!==true)return hold(base.reason||'base_equipment_unverified');
  let last;
  try{last=await readRevision({connectionId,orderId});}
  catch{return hold('locked_revision_changed');}
  if(first.connectionGeneration!==last.connectionGeneration||
     first.revision!==last.revision||
     first.sourceFingerprint!==last.sourceFingerprint||
     first.organizationId!==last.organizationId||
     first.proposalId!==last.proposalId)
   return hold('source_changed_during_base_scan');
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,
   reason:'base_equipment_audited_change_orders_and_approval_unverified',
   connectionId,orderId,organizationId:first.organizationId,proposalId:first.proposalId,
   connectionGeneration:first.connectionGeneration,revision:first.revision,
   sourceFingerprint:first.sourceFingerprint,baseLines:base.baseLines,
   baseLineCount:base.baseLineCount,approvalVerified:false,
   sourceManifestComplete:false});
 };
}
