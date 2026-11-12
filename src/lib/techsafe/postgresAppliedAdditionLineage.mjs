// Read-only lineage check for approved/applied MJV change-order additions.
// Legacy additions may lack committed_change_order_line_id on current rows.
// Missing links are diagnostic blockers, never proof that products are absent.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
const hold=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export function createAppliedAdditionLineageInspector(client){
 if(!client||typeof client.query!=='function')throw TypeError('trusted_postgres_client_required');
 return async ({orderId,organizationId,proposalId}={})=>{
  if(![orderId,organizationId,proposalId].every(uuid))return hold('invalid_scope');
  let result;
  try{
   result=await client.query(
    `SELECT li.id AS change_line_id,li.organization_id AS line_organization_id,
      co.organization_id AS change_organization_id,co.proposal_id AS change_proposal_id,
      co.status,co.is_active,co.is_locked,co.approval_date,
      co.requires_customer_approval,co.customer_approved,
      pli.id AS current_line_id,pli.organization_id AS current_organization_id,
      pli.proposal_id AS current_proposal_id
      FROM public.change_orders co
      JOIN public.change_order_line_items li ON li.change_order_id=co.id
      LEFT JOIN public.proposal_line_items pli
        ON pli.committed_change_order_line_id=li.id
      WHERE co.sales_order_id=$1 AND li.action_type='add'
      ORDER BY li.id`,[orderId]);
  }catch{return hold('applied_addition_lineage_read_failed');}
  if(!Array.isArray(result.rows)||result.rows.length>10000)
   return hold('applied_addition_lineage_count_invalid');
  const seen=new Set(),counts={appliedAdditions:0,linkedAppliedAdditions:0,
   unlinkedAppliedAdditions:0,draftAdditions:0,ambiguous:0};
  for(const row of result.rows){
   if(!uuid(row.change_line_id)||seen.has(row.change_line_id)||
      row.line_organization_id!==organizationId||
      row.change_organization_id!==organizationId||
      row.change_proposal_id!==proposalId)
    return hold('applied_addition_lineage_scope_mismatch');
   seen.add(row.change_line_id);
   const applied=row.status==='approved'&&row.is_active===false&&
    row.is_locked===true&&Boolean(row.approval_date)&&
    (row.requires_customer_approval!==true||row.customer_approved===true);
   if(applied){
    counts.appliedAdditions++;
    if(row.current_line_id===null)counts.unlinkedAppliedAdditions++;
    else if(uuid(row.current_line_id)&&
      row.current_organization_id===organizationId&&
      row.current_proposal_id===proposalId)counts.linkedAppliedAdditions++;
    else return hold('applied_addition_current_line_scope_mismatch');
   }else if(row.status==='draft'&&row.is_active===true&&row.current_line_id===null)
    counts.draftAdditions++;
   else counts.ambiguous++;
  }
  return {ok:true,authorized:false,snapshotReady:false,
   reason:counts.unlinkedAppliedAdditions?'legacy_applied_addition_lineage_unresolved':
    counts.ambiguous?'ambiguous_addition_lineage':'addition_lineage_inspected_not_certified',
   ...counts,requiresLegacyReconciliation:counts.unlinkedAppliedAdditions>0,
   lineageCertified:false};
 };
}
