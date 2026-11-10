// Server-side orchestration contract for an authoritative, single-transaction
// MJV source read. Does not create trust from caller-supplied flags or send data.
import {reconcileApprovedSalesOrderEquipment} from './equipmentReconciliation.mjs';
const held=reason=>({ok:false,authorized:false,snapshotReady:false,reason,items:[]});
// Match the Techsafe receiver and equipment reconciler's strict transport IDs.
const isId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const positiveInt=x=>Number.isSafeInteger(x)&&x>0;
export async function inspectVerifiedSalesOrderEquipment({connectionId,orderId,readConsistentSource}={}) {
  if (!isId(connectionId)||!isId(orderId)) return held('invalid_source_identity');
  if (typeof readConsistentSource!=='function') return held('authoritative_reader_unavailable');
  let evidence;
  try {
    // Must be implemented by a trusted server-only DB transaction. A public
    // endpoint, arbitrary callback, or user-supplied JSON is NOT a valid reader.
    evidence=await readConsistentSource({connectionId,orderId});
  } catch { return held('authoritative_read_failed'); }
  if (!evidence || evidence.connectionId!==connectionId || evidence.orderId!==orderId ||
    // A row lock and a ledger in the 'held' state are different concepts.
    // The reader must prove it owns the row lock while ledgerState is candidate.
    evidence.transactionConsistent!==true || evidence.ledgerRowLocked!==true ||
    evidence.connectionActive!==true || evidence.sourceRevisionVerified!==true ||
    !positiveInt(evidence.connectionGeneration) ||
    !positiveInt(evidence.revision) || evidence.ledgerRevision!==evidence.revision ||
    evidence.ledgerGeneration!==evidence.connectionGeneration ||
    evidence.ledgerConnectionId!==connectionId ||
    evidence.ledgerSalesOrderId!==orderId ||
    evidence.connectionOrganizationId!==evidence.salesOrder?.organizationId ||
    evidence.connectionProposalId!==evidence.salesOrder?.proposalId ||
    evidence.ledgerOrganizationId!==evidence.salesOrder?.organizationId ||
    evidence.ledgerProposalId!==evidence.salesOrder?.proposalId ||
    evidence.ledgerState!=='candidate' ||
    typeof evidence.ledgerFingerprint!=='string' ||
    !/^[0-9a-f]{64}$/.test(evidence.ledgerFingerprint) ||
    evidence.ledgerFingerprint==='0'.repeat(64) ||
    evidence.sourceFingerprint!==evidence.ledgerFingerprint ||
    evidence.salesOrder?.id!==orderId ||
    evidence.sourceManifest?.complete!==true || evidence.sourceManifest?.approvalEvidenceVerified!==true)
    return held('authoritative_evidence_unverified');
  // MJV's apply_change_order mutates current proposal_line_items. Never
  // replay approved change orders over rows that are already post-application.
  if (evidence.baseLinesAreCurrent===true ||
      evidence.sourceManifest?.baseLineSource==='current_proposal_line_items' ||
      evidence.sourceManifest?.baseLineSource==='post_application_current')
    return held('current_equipment_must_not_replay_change_orders');
  // Unknown provenance is not an original baseline. Current MJV equipment
  // already includes applied changes; only a trusted reader's independently
  // verified approval-time rows can be used by this legacy history reducer.
  if (Array.isArray(evidence.changeOrders) && evidence.changeOrders.length>0 &&
      (evidence.sourceManifest?.baseLineSource!=='verified_original_approval_rows' ||
       evidence.sourceManifest?.originalBasisVerified!==true))
    return held('original_equipment_baseline_unverified');
  let result;
  try {
    result=reconcileApprovedSalesOrderEquipment({
      salesOrder:evidence.salesOrder,baseLines:evidence.baseLines,
      changeOrders:evidence.changeOrders,expectedRevision:evidence.revision,
      sourceManifest:evidence.sourceManifest
    });
  } catch {
    // A malformed authoritative row must hold, not crash the inspection caller.
    // Inspection is never a dispatch or coverage authorization.
    return held('authoritative_reconciliation_failed');
  }
  // No matter what a caller or adapter returns, this operation is inspection
  // only. Certification requires a separate persisted, authenticated snapshot.
  return {...result,authorized:false,snapshotReady:false};
}
