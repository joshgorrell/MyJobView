// Independently inspect the existing MJV approved proposal -> Sales Order binding.
// Approval timestamps and status alone do not certify original approved line membership.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const hold=reason=>Object.freeze({ok:false,authorized:false,snapshotReady:false,reason});
export function createSalesOrderApprovalEvidenceReader(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 return async ({orderId,organizationId,proposalId}={})=>{
  if(![orderId,organizationId,proposalId].every(uuid))return hold('invalid_approval_scope');
  let result;
  try{
   result=await client.query(
    `SELECT p.id,p.sales_order_id,p.status,p.approved_at,p.approval_completed_at,
       p.accepted_via_method,p.approved_by,p.contact_id,
       so.id AS order_id,so.organization_id,so.proposal_id,so.contact_id AS order_contact_id
       FROM public.proposals p JOIN public.sales_orders so
       ON so.proposal_id=p.id AND so.id=p.sales_order_id
       WHERE so.id=$1 AND so.organization_id=$2 AND p.id=$3
       FOR SHARE OF p,so`,
    [orderId,organizationId,proposalId]);
  }catch{return hold('approval_evidence_read_failed');}
  if(result?.rows?.length!==1)return hold('approved_sales_order_binding_missing');
  const p=result.rows[0];
  if(p.id!==proposalId||p.sales_order_id!==orderId||p.order_id!==orderId||
    p.organization_id!==organizationId||p.proposal_id!==proposalId||
    !uuid(p.contact_id)||p.order_contact_id!==p.contact_id)
   return hold('approved_sales_order_binding_mismatch');
  if(!p.approved_at&&!p.approval_completed_at)
   return hold('original_approval_timestamp_missing');
  if(typeof p.status!=='string'||!['approved','accepted','converted','sales_order'].includes(p.status.toLowerCase()))
   return hold('original_approval_status_unverified');
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,
   reason:'approval_metadata_present_original_line_membership_unverified',
   orderId,organizationId,proposalId,contactId:p.contact_id,
   approvalMetadataInspected:true,originalLineMembershipVerified:false});
 };
}
