// Enumerate every change order attached to the actual Sales Order.
// Do not replay change orders: current proposal_line_items already include applied changes.
// This diagnostic does not certify historical membership or permit delivery.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const hold=reason=>Object.freeze({ok:false,authorized:false,snapshotReady:false,reason});
export function createSalesOrderChangeHistoryInventory(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 return async ({orderId,organizationId,proposalId,committedChangeProvenance}={})=>{
  if(![orderId,organizationId,proposalId].every(uuid)||!Array.isArray(committedChangeProvenance)||
     committedChangeProvenance.length>10000)return hold('invalid_change_history_scope');
  // Query by Sales Order ID alone. Filtering by tenant/proposal in SQL
  // would silently hide mis-scoped change orders and falsely report
  // a complete history. Validate every returned row below instead.
  let response;
  try{response=await client.query(
   `SELECT co.id,co.organization_id,co.sales_order_id,co.proposal_id,
     co.status,co.is_active,co.is_locked,co.approval_date,
     co.requires_customer_approval,co.customer_approved,
     li.id AS change_line_id,li.organization_id AS line_organization_id
    FROM public.change_orders co
    LEFT JOIN public.change_order_line_items li ON li.change_order_id=co.id
    WHERE co.sales_order_id=$1
    ORDER BY co.id,li.id FOR SHARE OF co`,
   [orderId]);
  }catch{return hold('change_history_inventory_read_failed');}
  if(!Array.isArray(response.rows)||response.rows.length>10000)
   return hold('change_history_inventory_count_invalid');
  const orders=new Map(),lines=new Map();
  for(const row of response.rows){
   if(!uuid(row.id)||row.organization_id!==organizationId||row.sales_order_id!==orderId||
      row.proposal_id!==proposalId||typeof row.status!=='string')
    return hold('change_history_inventory_scope_mismatch');
   if(!orders.has(row.id))orders.set(row.id,{status:row.status,active:row.is_active,locked:row.is_locked,
    approvedAt:row.approval_date,requiresCustomerApproval:row.requires_customer_approval,
    customerApproved:row.customer_approved,lineCount:0});
   const prior=orders.get(row.id);
   if(prior.status!==row.status||prior.active!==row.is_active||prior.locked!==row.is_locked||
      prior.approvedAt!==row.approval_date||
      prior.requiresCustomerApproval!==row.requires_customer_approval||
      prior.customerApproved!==row.customer_approved)return hold('change_history_inventory_inconsistent');
   if(row.change_line_id!==null){
    if(!uuid(row.change_line_id)||row.line_organization_id!==organizationId||lines.has(row.change_line_id))
     return hold('change_history_line_scope_mismatch');
    lines.set(row.change_line_id,row.id);prior.lineCount++;
   }
  }
  const referenced=new Set();
  for(const item of committedChangeProvenance){
   if(!uuid(item?.changeOrderId)||!uuid(item?.changeOrderLineId)||
      referenced.has(item.changeOrderLineId)||lines.get(item.changeOrderLineId)!==item.changeOrderId)
    return hold('committed_change_missing_from_full_inventory');
   referenced.add(item.changeOrderLineId);
  }
  // A complete inventory of CURRENT records is not proof that historical
  // applied removals/edits survived in the current line list.
  const unreferencedLines=lines.size-referenced.size;
  const unreferencedByOrder=new Map();
  for(const [lineId,changeOrderId] of lines)
   if(!referenced.has(lineId))
    unreferencedByOrder.set(changeOrderId,(unreferencedByOrder.get(changeOrderId)||0)+1);
  let approvedUnreferencedLines=0,unresolvedChangeOrders=0;
  for(const [changeOrderId,order] of orders){
   const approved=order.active===true&&order.locked===true&&
    Boolean(order.approvedAt)&&
    (order.requiresCustomerApproval!==true||order.customerApproved===true);
   if(approved)approvedUnreferencedLines+=unreferencedByOrder.get(changeOrderId)||0;
   else unresolvedChangeOrders++;
  }
  // Unreferenced lines may be removals, replacements or history not present
  // in the current equipment list. They must NOT be counted as current stock.
  const needsHistoricalReconciliation=approvedUnreferencedLines>0||
   unresolvedChangeOrders>0;
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,
   reason:'change_history_enumerated_original_application_history_unverified',
   changeOrderCount:orders.size,changeLineCount:lines.size,
   committedLineReferences:referenced.size,unreferencedChangeLines:unreferencedLines,
   approvedUnreferencedLines,unresolvedChangeOrders,needsHistoricalReconciliation,
   historyCompletenessCertified:false});
 };
}
