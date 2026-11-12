// Private transactional audit of current (post-change) Sales Order equipment.
// Explicitly NOT the authoritative source reader: no approval attestation,
// change-order completeness, equipment valuation, certificate or delivery.
import {createLockedRevisionReader} from './postgresLockedRevisionReader.mjs';
import {createPostgresBaseEquipmentScanner} from './postgresBaseEquipmentScanner.mjs';
import {createCommittedChangeProvenanceReader} from './postgresCommittedChangeProvenance.mjs';
import {createSalesOrderApprovalEvidenceReader} from './postgresSalesOrderApprovalEvidence.mjs';
import {createSalesOrderChangeHistoryInventory} from './postgresSalesOrderChangeHistoryInventory.mjs';
const hold=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export function createTransactionalBaseEquipmentAudit(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 const readRevision=createLockedRevisionReader(client);
 const scanBase=createPostgresBaseEquipmentScanner(client);
 const inspectChanges=createCommittedChangeProvenanceReader(client);
 const inspectApproval=createSalesOrderApprovalEvidenceReader(client);
 const inspectHistory=createSalesOrderChangeHistoryInventory(client);
 return async ({connectionId,orderId}={})=>{
  // Lock connection then ledger, before reading the approved-order base rows.
  // This must run inside the caller's SERIALIZABLE transaction.
  const isolation=await client.query('SHOW transaction_isolation');
  if(isolation?.rows?.[0]?.transaction_isolation!=='serializable')
   return hold('serializable_transaction_required');
  let first;
  try{first=await readRevision({connectionId,orderId});}
  catch{return hold('locked_revision_unverified');}
  // A held/malformed revision must never be promoted by a successful base scan.
  if(first?.ok===false||!Number.isSafeInteger(first?.revision)||first.revision<1||
     !Number.isSafeInteger(first?.connectionGeneration)||first.connectionGeneration<1||
     typeof first.organizationId!=='string'||typeof first.proposalId!=='string'||
     !/^[0-9a-f]{64}$/.test(first.sourceFingerprint||'')||
     first.sourceFingerprint==='0'.repeat(64)||first.state!=='candidate')
   return hold('locked_revision_unverified');
  let base;
  try{base=await scanBase({orderId,organizationId:first.organizationId,proposalId:first.proposalId});}
  catch{return hold('base_equipment_read_failed');}
  if(base.ok!==true)return hold(base.reason||'base_equipment_unverified');
  // Source-owned change-order provenance is checked in the SAME transaction
  // as current lines and the locked revision, never in an independent read.
  let approval;
  try{approval=await inspectApproval({orderId,organizationId:first.organizationId,
    proposalId:first.proposalId});}
  catch{return hold('approval_evidence_read_failed');}
  if(approval.ok!==true)return hold(approval.reason||'approval_evidence_unverified');
  let changes;
  try{changes=await inspectChanges({orderId,organizationId:first.organizationId,
    proposalId:first.proposalId,baseLines:base.baseLines});}
  catch{return hold('committed_change_provenance_read_failed');}
  if(changes.ok!==true)return hold(changes.reason||'committed_change_provenance_unverified');
  let history;
  try{history=await inspectHistory({orderId,organizationId:first.organizationId,
    proposalId:first.proposalId,committedChangeProvenance:changes.provenance});}
  catch{return hold('change_history_inventory_read_failed');}
  if(history.ok!==true)return hold(history.reason||'change_history_inventory_unverified');
  let last;
  try{last=await readRevision({connectionId,orderId});}
  catch{return hold('locked_revision_changed');}
  if(last?.ok===false||!Number.isSafeInteger(last?.revision)||last.revision<1||
     !Number.isSafeInteger(last?.connectionGeneration)||last.connectionGeneration<1||
     last.state!=='candidate'||
     first.connectionGeneration!==last.connectionGeneration||
     first.revision!==last.revision||
     first.sourceFingerprint!==last.sourceFingerprint||
     first.organizationId!==last.organizationId||
     first.proposalId!==last.proposalId)
   return hold('source_changed_during_base_scan');
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,
   reason:'base_equipment_audited_change_orders_and_approval_unverified',
   connectionId,orderId,organizationId:first.organizationId,proposalId:first.proposalId,
   connectionGeneration:first.connectionGeneration,revision:first.revision,
   sourceFingerprint:first.sourceFingerprint,baseLinesAreCurrent:true,
   baseLineSource:'current_proposal_line_items',baseLines:base.baseLines,
   baseLineCount:base.baseLineCount,committedChangeProvenance:changes.provenance,
   committedChangeProvenanceInspected:true,approvalMetadataInspected:true,
   originalLineMembershipVerified:false,changeHistoryInventoryInspected:true,
   changeOrderCount:history.changeOrderCount,changeLineCount:history.changeLineCount,
   unreferencedChangeLines:history.unreferencedChangeLines,
   approvedUnreferencedLines:history.approvedUnreferencedLines,
   unresolvedChangeOrders:history.unresolvedChangeOrders,
   needsHistoricalReconciliation:history.needsHistoricalReconciliation,
   historyCompletenessCertified:false,approvalVerified:false,
   sourceManifestComplete:false});
 };
}
