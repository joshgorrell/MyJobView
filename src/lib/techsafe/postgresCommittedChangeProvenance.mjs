// Read-only provenance of change-order lines already applied to current Sales Orders.
// This is NOT a change-order replay or an authorization to deliver to Techsafe.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const hold=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export function createCommittedChangeProvenanceReader(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 return async ({orderId,organizationId,proposalId,baseLines}={})=>{
  if(![orderId,organizationId,proposalId].every(uuid)||!Array.isArray(baseLines)||baseLines.length>10000)
   return hold('invalid_source_scope');
  const applied=baseLines.filter(x=>x?.committedChangeOrderLineId!==null&&x?.committedChangeOrderLineId!==undefined);
  if(applied.some(x=>!uuid(x.id)||x.organizationId!==organizationId||x.proposalId!==proposalId||
     !uuid(x.committedChangeOrderLineId)))
   return hold('invalid_committed_change_reference');
  const references=[...new Set(applied.map(x=>x.committedChangeOrderLineId))];
  if(references.length!==applied.length)return hold('duplicate_committed_change_reference');
  if(!references.length)return Object.freeze({ok:true,authorized:false,snapshotReady:false,provenance:[],reason:'no_applied_change_lines'});
  let response;
  try{
   response=await client.query(
    `SELECT li.id,li.organization_id,li.change_order_id,li.proposal_line_item_id,
       co.organization_id AS order_organization_id,co.sales_order_id,co.proposal_id,
       co.status,co.approval_date,co.customer_approved,co.requires_customer_approval,
       co.is_active,co.is_locked
      FROM public.change_order_line_items li
      JOIN public.change_orders co ON co.id=li.change_order_id
      WHERE li.id=ANY($1::uuid[]) AND li.organization_id=$2
      ORDER BY li.id FOR SHARE OF li,co`,
    [references,organizationId]);
  }catch{return hold('committed_change_provenance_read_failed');}
  if(!Array.isArray(response.rows)||response.rows.length!==references.length)
   return hold('committed_change_provenance_incomplete');
  const byId=new Map();
  for(const row of response.rows){
   if(!uuid(row.id)||byId.has(row.id)||!references.includes(row.id)||
      row.organization_id!==organizationId||row.order_organization_id!==organizationId||
      row.sales_order_id!==orderId||row.proposal_id!==proposalId||
      !uuid(row.change_order_id)||!uuid(row.proposal_line_item_id))
    return hold('committed_change_scope_unverified');
   // The live MJV change-order workflow uses approved vs draft status.
   // MJV apply_change_order marks an applied approved change is_active=false.
   // A draft or an approved-but-not-yet-applied change must never qualify.
   if(row.status!=='approved'||row.is_active!==false||row.is_locked!==true||
      !row.approval_date||row.requires_customer_approval===true&&row.customer_approved!==true)
    return hold('committed_change_approval_unverified');
   byId.set(row.id,row);
  }
  const provenance=[];
  for(const line of applied){
   const row=byId.get(line.committedChangeOrderLineId);
   if(!row||row.proposal_line_item_id!==line.id)return hold('committed_change_line_binding_unverified');
   provenance.push(Object.freeze({sourceLineId:line.id,changeOrderLineId:row.id,
    changeOrderId:row.change_order_id,status:row.status}));
  }
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,
   reason:'committed_change_provenance_inspected_not_approval_certified',
   provenance:Object.freeze(provenance)});
 };
}
