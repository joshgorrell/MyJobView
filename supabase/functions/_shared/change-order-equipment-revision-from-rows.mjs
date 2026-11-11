import {snapshotChangeOrderLines} from './change-order-committed-source-snapshot.mjs';
import {reconcileCommittedEquipmentAdditions} from './change-order-equipment-reconciliation.mjs';

// Bridges actual database rows to the committed equipment delta calculator.
// Rejects every unsupported action rather than silently omitting financial changes.
// The SQL transaction must independently validate tenant, approvals, ledger and
// proposal-line provenance. This pure plan must never be used as commit authority.
function equipment(lines,label) {
  const out=[];
  for(const line of lines) {
    if(line.action!=='add') throw new Error(label+': non-add change-order actions require transactional proposal baseline');
    if(line.itemType==='labor') throw new Error(label+': labor additions require separate reconciliation');
    if(line.laborHours!==null || line.laborRateCents!==null ||
       line.laborTotalCents!==null || line.originalLaborTotalCents!==null ||
       line.newLaborTotalCents!==null)
      throw new Error(label+': mixed equipment/labor lines require separate reconciliation');
    if(line.modifierAdjustments!==null) throw new Error(label+': modifiers require separate reconciliation');
    if(!line.productId) throw new Error(label+': product identity missing');
    if(!/^\d+$/.test(line.newQuantity??'') || !Number.isSafeInteger(Number(line.newQuantity)))
      throw new Error(label+': fractional or unsafe equipment quantity');
    const price=BigInt(line.newUnitPriceCents??'-1');
    if(price<0n || price>BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error(label+': invalid equipment unit price');
    const qty=Number(line.newQuantity);
    const computed=BigInt(qty)*price;
    if(line.newTotalCents!==null && BigInt(line.newTotalCents)!==computed)
      throw new Error(label+': equipment total disagrees with quantity times price');
    out.push({lineId:line.lineId,productId:line.productId,quantity:qty,unitPriceCents:Number(price)});
  }
  return out;
}
export function planEquipmentRevisionFromRows({changeOrderId,organizationId,committedRows,stagedRows}) {
  const committed=snapshotChangeOrderLines({changeOrderId,organizationId,rows:committedRows});
  const staged=snapshotChangeOrderLines({changeOrderId,organizationId,rows:stagedRows});
  return reconcileCommittedEquipmentAdditions({
    committed:equipment(committed,'committed'),
    staged:equipment(staged,'staged')
  });
}
