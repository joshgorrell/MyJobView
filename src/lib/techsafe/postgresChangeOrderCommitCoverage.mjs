// Read-only inspection of actual MJV change-order commit evidence.
// Older approved/applied change orders may predate change_order_commit.revisions.
// Classify them explicitly; never fabricate a missing revision or authorize export.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
const hold=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export function createChangeOrderCommitCoverageInspector(client){
 if(!client||typeof client.query!=='function')throw TypeError('trusted_postgres_client_required');
 return async ({orderId,organizationId}={})=>{
  if(!uuid(orderId)||!uuid(organizationId))return hold('invalid_scope');
  let result;
  try{
   result=await client.query(
    `SELECT co.id,co.organization_id,co.sales_order_id,co.status,
      co.is_active,co.is_locked,co.approval_date,
      co.requires_customer_approval,co.customer_approved,
      count(DISTINCT li.id)::integer AS line_count,
      count(DISTINCT rev.id)::integer AS revision_count
      FROM public.change_orders co
      LEFT JOIN public.change_order_line_items li
        ON li.change_order_id=co.id
      LEFT JOIN change_order_commit.revisions rev
        ON rev.change_order_id=co.id
      WHERE co.sales_order_id=$1
      GROUP BY co.id,co.organization_id,co.sales_order_id,co.status,
        co.is_active,co.is_locked,co.approval_date,
        co.requires_customer_approval,co.customer_approved
      ORDER BY co.id`,[orderId]);
  }catch{return hold('commit_coverage_read_failed');}
  if(!Array.isArray(result.rows)||result.rows.length>10000)
   return hold('commit_coverage_invalid');
  const counts={appliedWithRevision:0,appliedLegacyWithoutRevision:0,
   draftOrUnapplied:0,ambiguous:0,total:result.rows.length};
  for(const row of result.rows){
   if(!uuid(row.id)||row.organization_id!==organizationId||
      row.sales_order_id!==orderId||!Number.isSafeInteger(Number(row.line_count))||
      !Number.isSafeInteger(Number(row.revision_count))||
      Number(row.line_count)<0||Number(row.revision_count)<0)
    return hold('commit_coverage_scope_mismatch');
   const applied=row.status==='approved'&&row.is_active===false&&
    row.is_locked===true&&Boolean(row.approval_date)&&
    (row.requires_customer_approval!==true||row.customer_approved===true);
   const draft=['draft','pending_approval'].includes(row.status)&&
    row.is_active===true&&Number(row.revision_count)===0;
   if(applied){
    if(Number(row.revision_count)>0)counts.appliedWithRevision++;
    else counts.appliedLegacyWithoutRevision++;
   }else if(draft)counts.draftOrUnapplied++;
   else counts.ambiguous++;
  }
  return {ok:true,authorized:false,snapshotReady:false,
   reason:counts.ambiguous?'ambiguous_change_order_state':
    counts.appliedLegacyWithoutRevision?'legacy_applied_change_orders_require_reconciliation':
    'commit_coverage_inspected_not_certified',
   ...counts,requiresLegacyReconciliation:counts.appliedLegacyWithoutRevision>0,
   historyCompletenessCertified:false};
 };
}
