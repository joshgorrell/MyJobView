// Server-side orchestration contract for an authoritative, single-transaction
// MJV source read. Does not create trust from caller-supplied flags or send data.
import {reconcileApprovedSalesOrderEquipment} from './equipmentReconciliation.mjs';
const held=reason=>({ok:false,authorized:false,snapshotReady:false,reason,items:[]});
const isId=x=>typeof x==='string'&&x.length>0;
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
    evidence.transactionConsistent!==true || evidence.ledgerHeld!==true ||
    evidence.connectionActive!==true || evidence.sourceRevisionVerified!==true ||
    !positiveInt(evidence.connectionGeneration) ||
    !positiveInt(evidence.revision) || evidence.ledgerRevision!==evidence.revision ||
    evidence.ledgerGeneration!==evidence.connectionGeneration ||
    evidence.ledgerOrganizationId!==evidence.salesOrder?.organizationId ||
    evidence.ledgerProposalId!==evidence.salesOrder?.proposalId ||
    evidence.salesOrder?.id!==orderId ||
    evidence.sourceManifest?.complete!==true || evidence.sourceManifest?.approvalEvidenceVerified!==true)
    return held('authoritative_evidence_unverified');
  const result=reconcileApprovedSalesOrderEquipment({
    salesOrder:evidence.salesOrder,baseLines:evidence.baseLines,
    changeOrders:evidence.changeOrders,expectedRevision:evidence.revision,
    sourceManifest:evidence.sourceManifest
  });
  // No matter what a caller or adapter returns, this operation is inspection
  // only. Certification requires a separate persisted, authenticated snapshot.
  return {...result,authorized:false,snapshotReady:false};
}
