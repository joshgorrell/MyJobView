// Server-only, fail-closed freshness preflight. This is NOT a certificate.
// A reader must use a trusted DB transaction and independently validate approval.
// No network, database mutation, export, or coverage authorization here.
import {buildSalesOrderEquipmentEvidence,compareSalesOrderEquipmentEvidence} from './canonicalEquipmentEvidence.mjs';
const held=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
function extract(e,connectionId,orderId) {
  if (!e||e.connectionId!==connectionId||e.orderId!==orderId||
      e.transactionConsistent!==true||e.ledgerRowLocked!==true||
      e.connectionActive!==true||e.sourceRevisionVerified!==true||
      e.sourceManifest?.complete!==true||e.sourceManifest?.approvalEvidenceVerified!==true||
      e.ledgerState!=='candidate'||!positive(e.connectionGeneration)||
      !positive(e.revision)||e.ledgerRevision!==e.revision||
      e.ledgerGeneration!==e.connectionGeneration||
      e.ledgerConnectionId!==connectionId||e.ledgerSalesOrderId!==orderId||
      e.ledgerOrganizationId!==e.salesOrder?.organizationId||
      e.ledgerProposalId!==e.salesOrder?.proposalId||
      e.connectionOrganizationId!==e.salesOrder?.organizationId||
      e.connectionProposalId!==e.salesOrder?.proposalId||
      e.salesOrder?.id!==orderId||
      !/^[0-9a-f]{64}$/.test(e.ledgerFingerprint)||
      e.ledgerFingerprint==='0'.repeat(64)||
      e.sourceFingerprint!==e.ledgerFingerprint)
    return held('source_authority_unverified');
  return buildSalesOrderEquipmentEvidence({
    connectionId,connectionGeneration:e.connectionGeneration,
    salesOrder:e.salesOrder,baseLines:e.baseLines,changeOrders:e.changeOrders,
    expectedRevision:e.revision,sourceManifest:e.sourceManifest
  });
}
/**
 * Compare two separately committed, trusted source reads. This catches stale
 * or changing source evidence but cannot close the race after the second read.
 * In particular, neither a callback nor a matching digest certifies export.
 */
export async function preflightSalesOrderEquipmentFreshness({connectionId,orderId,readConsistentSource}={}) {
  if (!id(connectionId)||!id(orderId)) return held('invalid_source_identity');
  if(typeof readConsistentSource!=='function') return held('authoritative_reader_unavailable');
  let first,second;
  try {
    first=extract(await readConsistentSource({connectionId,orderId}),connectionId,orderId);
    if(!first.ok) return held(first.reason);
    second=extract(await readConsistentSource({connectionId,orderId}),connectionId,orderId);
  } catch { return held('authoritative_read_failed'); }
  if(!second.ok) return held(second.reason);
  const comparison=compareSalesOrderEquipmentEvidence(first,second);
  if(!comparison.ok) return held(comparison.reason);
  if(comparison.changed) return held('source_changed_during_preflight');
  return {ok:true,authorized:false,snapshotReady:false,reason:'freshness_preflight_not_certified',
    fingerprint:second.fingerprint,revision:second.revision,connectionGeneration:second.connectionGeneration,
    items:second.items};
}
