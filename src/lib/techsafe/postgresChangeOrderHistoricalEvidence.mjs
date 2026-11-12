// Existing MJV change_order_history is evidence, not a replayable ledger.
// Read within the caller's locked SERIALIZABLE transaction. Never export
// snapshots or infer that 'modified' means a change was applied to the order.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const hold=reason=>Object.freeze({ok:false,authorized:false,snapshotReady:false,reason});
export function createChangeOrderHistoricalEvidenceReader(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 return async ({orderId,organizationId,proposalId}={})=>{
  if(![orderId,organizationId,proposalId].every(uuid))return hold('invalid_historical_evidence_scope');
  let response;
  try{response=await client.query(
   `SELECT co.id AS change_order_id,co.organization_id AS order_organization_id,
       co.sales_order_id,co.proposal_id,
       h.id AS history_id,h.organization_id AS history_organization_id,
       h.action,h.created_at,h.snapshot IS NOT NULL AS has_snapshot
     FROM public.change_orders co
     LEFT JOIN public.change_order_history h ON h.change_order_id=co.id
     WHERE co.sales_order_id=$1
     ORDER BY co.id,h.created_at,h.id FOR SHARE OF co`,
   [orderId]);}
  catch{return hold('historical_evidence_read_failed');}
  if(!Array.isArray(response?.rows)||response.rows.length>10000)
   return hold('historical_evidence_count_invalid');
  const historyIds=new Set(),changeOrders=new Set(),actions=new Map();
  let historyEvents=0,eventsWithSnapshot=0,ordersWithoutHistory=0;
  for(const row of response.rows){
   if(!uuid(row.change_order_id)||row.order_organization_id!==organizationId||
      row.sales_order_id!==orderId||row.proposal_id!==proposalId)
    return hold('historical_evidence_order_scope_mismatch');
   changeOrders.add(row.change_order_id);
   if(row.history_id===null){
    ordersWithoutHistory++;
    continue;
   }
   if(!uuid(row.history_id)||historyIds.has(row.history_id)||
      row.history_organization_id!==organizationId||
      typeof row.action!=='string'||!row.action||!row.created_at||
      typeof row.has_snapshot!=='boolean')
    return hold('historical_evidence_event_unverified');
   historyIds.add(row.history_id);historyEvents++;
   if(row.has_snapshot)eventsWithSnapshot++;
   actions.set(row.action,(actions.get(row.action)||0)+1);
  }
  // This table has created/modified/status_changed events, but no
  // guaranteed before/after approved equipment membership or applied order.
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,
   reason:'historical_events_inspected_not_original_approval_or_application_proof',
   changeOrderCount:changeOrders.size,historyEvents,eventsWithSnapshot,
   ordersWithoutHistory,actionCounts:Object.freeze(Object.fromEntries(actions)),
   originalApprovedMembershipCertified:false,
   historicalApplicationCertified:false});
 };
}
