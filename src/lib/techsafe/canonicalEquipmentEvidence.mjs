// Deterministic, non-authorizing equipment evidence for approved Sales Orders.
// Digest is NOT a transaction certificate, approval proof, or dispatch grant.
import {createHash} from 'node:crypto';
import {reconcileApprovedSalesOrderEquipment} from './equipmentReconciliation.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const fail=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export function buildSalesOrderEquipmentEvidence(input={}) {
  const {salesOrder,baseLines,changeOrders,expectedRevision,sourceManifest,connectionId,connectionGeneration}=input;
  if (!id(connectionId)||!positive(connectionGeneration)||!id(salesOrder?.id)||
      !id(salesOrder?.organizationId)||!id(salesOrder?.proposalId)||!positive(expectedRevision))
    return fail('invalid_source_identity');
  const reconciled=reconcileApprovedSalesOrderEquipment({salesOrder,baseLines,changeOrders,expectedRevision,sourceManifest});
  if (!reconciled.ok) return fail(reconciled.reason);
  // Canonical, explicitly ordered fields. Never hash arbitrary caller JSON or
  // optional metadata: its key order and provenance are not source authority.
  const lines=reconciled.items.map(x=>[x.sourceLineId,x.productId,x.quantity]);
  for(let i=0;i<lines.length;i++) {
    if (!id(lines[i][0]) && !(typeof lines[i][0]==='string'&&lines[i][0].startsWith('change:')&&id(lines[i][0].slice(7))))
      return fail('invalid_line_identity');
    if (!id(lines[i][1])||!Number.isSafeInteger(lines[i][2])||lines[i][2]<=0)
      return fail('invalid_equipment');
    if(i>0&&lines[i-1][0]>=lines[i][0]) return fail('ambiguous_equipment_order');
  }
  const canonical=JSON.stringify(['mjv-techsafe-equipment-evidence-v1',connectionId,connectionGeneration,
    salesOrder.organizationId,salesOrder.id,salesOrder.proposalId,expectedRevision,lines]);
  const fingerprint=createHash('sha256').update(canonical,'utf8').digest('hex');
  return {ok:true,authorized:false,snapshotReady:false,reason:'digest_not_transaction_certified',
    connectionId,connectionGeneration,orderId:salesOrder.id,organizationId:salesOrder.organizationId,
    proposalId:salesOrder.proposalId,revision:expectedRevision,fingerprint,items:reconciled.items};
}
export function compareSalesOrderEquipmentEvidence(previous,current) {
  if (!previous?.ok||!current?.ok||!id(previous.connectionId)||!id(current.connectionId)||
      previous.connectionId!==current.connectionId||previous.orderId!==current.orderId||
      previous.organizationId!==current.organizationId||previous.proposalId!==current.proposalId)
    return fail('evidence_scope_mismatch');
  if (!positive(previous.connectionGeneration)||!positive(current.connectionGeneration)||
      !positive(previous.revision)||!positive(current.revision)||
      !/^[0-9a-f]{64}$/.test(previous.fingerprint)||!/^[0-9a-f]{64}$/.test(current.fingerprint))
    return fail('invalid_evidence');
  if (current.connectionGeneration<previous.connectionGeneration) return fail('stale_connection_generation');
  if (current.connectionGeneration===previous.connectionGeneration) {
    if(current.revision<previous.revision) return fail('stale_source_revision');
    if(current.revision===previous.revision&&current.fingerprint!==previous.fingerprint)
      return fail('revision_content_conflict');
  }
  return {ok:true,authorized:false,snapshotReady:false,reason:'evidence_consistent_not_certified',
    changed:current.connectionGeneration!==previous.connectionGeneration||
      current.revision!==previous.revision};
}
