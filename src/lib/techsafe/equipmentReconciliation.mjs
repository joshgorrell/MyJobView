// Pure, non-authorizing equipment reconciliation for an approved MJV Sales Order.
// No database access, credentials, dispatch, or network side effects.
const MAX_QUANTITY = 10000;
const MAX_LINES = 10000;
function fail(reason) { return {ok:false,reason,items:[]}; }
function quantity(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_QUANTITY) throw Error('invalid_quantity');
  return value;
}
function id(value) { if (typeof value !== 'string' || !value.trim()) throw Error('missing_identifier'); return value; }
export function reconcileApprovedSalesOrderEquipment({salesOrder,baseLines,changeOrders,expectedRevision,sourceManifest}) {
  try {
    if (!salesOrder || salesOrder.approved !== true || !salesOrder.id || !salesOrder.organizationId || !salesOrder.proposalId)
      return fail('approved_sales_order_unverified');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || salesOrder.revision !== expectedRevision)
      return fail('stale_source_revision');
    if (!Array.isArray(baseLines) || !Array.isArray(changeOrders)) return fail('source_incomplete');
    if (baseLines.length > MAX_LINES || changeOrders.length > MAX_LINES) return fail('source_too_large');
    // Bound aggregate change lines before manifest validation so oversized input
    // cannot be misclassified as merely a mismatched source manifest.
    let inputChangeLines=0;
    for (const change of changeOrders) {
      if (!Array.isArray(change?.lines)) continue;
      inputChangeLines += change.lines.length;
      if (inputChangeLines > MAX_LINES) return fail('source_too_large');
    }
    // Never accept a manifest merely because counts match a caller-filtered list.
    // The trusted DB reader must explicitly assert an exhaustive source scan.
    if (sourceManifest?.complete !== true || sourceManifest?.approvalEvidenceVerified !== true)
      return fail('source_not_authoritatively_verified');
    // A complete, trusted DB read must supply counts from the same transaction.
    // Without it, filtering out pending orders or missing lines looks valid.
    if (!sourceManifest || sourceManifest.salesOrderId !== salesOrder.id ||
      sourceManifest.organizationId !== salesOrder.organizationId ||
      sourceManifest.proposalId !== salesOrder.proposalId ||
      sourceManifest.revision !== expectedRevision ||
      !Number.isSafeInteger(sourceManifest.baseLineCount) || sourceManifest.baseLineCount < 0 ||
      !Number.isSafeInteger(sourceManifest.changeOrderCount) || sourceManifest.changeOrderCount < 0 ||
      !Number.isSafeInteger(sourceManifest.changeLineCount) || sourceManifest.changeLineCount < 0 ||
      sourceManifest.changeLineCount > MAX_LINES ||
      sourceManifest.baseLineCount !== baseLines.length ||
      sourceManifest.changeOrderCount !== changeOrders.length ||
      sourceManifest.changeLineCount !== changeOrders.reduce((n,co)=>n+(Array.isArray(co.lines)?co.lines.length:0),0))
      return fail('source_manifest_incomplete');
    const items = new Map();
    const baseIds = new Set();
    for (const line of baseLines) {
      if (line.organizationId !== salesOrder.organizationId || line.proposalId !== salesOrder.proposalId) return fail('source_scope_mismatch');
      const key=id(line.id), productId=id(line.productId), qty=quantity(line.quantity);
      if (items.has(key)) return fail('duplicate_base_line');
      baseIds.add(key);
      items.set(key,{sourceLineId:key,productId,quantity:qty});
    }
    const seenOrders=new Set(), seenChanges=new Set();
    let processedChangeLines=0;
    // Caller must supply authoritative, complete change-order history in
    // immutable revision order; a missing/ambiguous sequence fails closed.
    let lastRevision=0;
    for (const order of changeOrders) {
      if (order.salesOrderId !== salesOrder.id || order.organizationId !== salesOrder.organizationId)
        return fail('change_order_scope_mismatch');
      if (order.status !== 'approved' || order.customerApproved !== true) return fail('change_order_not_customer_approved');
      const orderId=id(order.id);
      if (seenOrders.has(orderId)) return fail('duplicate_change_order');
      seenOrders.add(orderId);
      if (!Number.isSafeInteger(order.revision) || order.revision <= lastRevision || order.revision > expectedRevision)
        return fail('ambiguous_change_order_sequence');
      lastRevision=order.revision;
      if (!Array.isArray(order.lines) || order.lines.length === 0) return fail('missing_change_order_lines');
      processedChangeLines+=order.lines.length;
      if (processedChangeLines > MAX_LINES) return fail('source_too_large');
      for (const line of order.lines) {
        if (line.organizationId !== salesOrder.organizationId || line.changeOrderId !== orderId)
          return fail('change_line_scope_mismatch');
        const lineId=id(line.id);
        if (seenChanges.has(lineId)) return fail('duplicate_change_line');
        seenChanges.add(lineId);
        const qty=quantity(line.newQuantity);
        if (line.actionType === 'add') {
          const productId=id(line.productId), key='change:'+lineId;
          items.set(key,{sourceLineId:key,productId,quantity:qty});
        } else if (line.actionType === 'remove' || line.actionType === 'modify_quantity' || line.actionType === 'modify_price') {
          const key=id(line.proposalLineItemId), previous=items.get(key);
          if (!previous || !baseIds.has(key)) return fail('changed_item_not_in_sales_order');
          if (line.productId && line.productId !== previous.productId) return fail('changed_product_mismatch');
          if (line.actionType === 'remove') {
            if (qty !== 0) return fail('remove_must_zero_quantity');
            items.delete(key);
          } else if (line.actionType === 'modify_quantity') {
            items.set(key,{...previous,quantity:qty});
          } else if (qty !== previous.quantity) return fail('price_change_cannot_change_quantity');
        } else return fail('unsupported_change_action');
      }
    }
    // Never emit an equipment set whose aggregate quantity exceeds the
    // bounded source contract, even when each individual line is valid.
    const totalQuantity=[...items.values()].reduce((sum,item)=>sum+item.quantity,0);
    if (totalQuantity > MAX_LINES) return fail('equipment_quantity_limit_exceeded');
    const output=[...items.values()].filter(x=>x.quantity>0).sort((a,b)=>a.sourceLineId.localeCompare(b.sourceLineId));
    // The pure result is diagnostic evidence only; downstream consumers must
    // not confuse a successfully computed list with a certified export.
    return {ok:true,authorized:false,snapshotReady:false,reason:'reconciled_not_certified',revision:expectedRevision,
      items:output};
  } catch (error) { return fail(error instanceof Error ? error.message : 'invalid_source'); }
}
