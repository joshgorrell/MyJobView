// A clean current Sales Order can be matched to independently captured native
// approval facts. Never promote historical current rows into approval evidence.
// Use inside the same owned SERIALIZABLE transaction as the source/certificate.
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const held=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export function createNativeApprovalBasisVerifier(client){
 if(!client||typeof client.query!=='function')throw TypeError('trusted_postgres_client_required');
 return async ({orderId,organizationId,proposalId}={})=>{
  if(![orderId,organizationId,proposalId].every(uuid))return held('invalid_approval_scope');
  try{
   const isolation=await client.query('SHOW transaction_isolation');
   if(isolation.rows?.[0]?.transaction_isolation!=='serializable')return held('serializable_transaction_required');
   const result=await client.query(`SELECT b.sales_order_id,b.organization_id,b.proposal_id,
    b.approved_at,b.basis_hash,
    b.basis=techsafe_source.current_approval_equipment_basis($1) AS current_matches,
    b.basis_hash=encode(pg_catalog.sha256(pg_catalog.convert_to(b.basis::text,'UTF8')),'hex') AS hash_matches,
    EXISTS(SELECT 1 FROM public.change_orders co WHERE co.sales_order_id=$1
      AND co.organization_id=$2 AND co.status IN ('approved','completed')) AS has_applied_changes
    FROM techsafe_source.native_approval_equipment_basis b
    WHERE b.sales_order_id=$1 AND b.organization_id=$2 AND b.proposal_id=$3 FOR SHARE OF b`,
    [orderId,organizationId,proposalId]);
   if(result.rows?.length!==1)return held('native_approval_basis_missing');
   const row=result.rows[0];
   if(row.sales_order_id!==orderId||row.organization_id!==organizationId||row.proposal_id!==proposalId||
      !row.approved_at||row.hash_matches!==true||typeof row.basis_hash!=='string'||!/^[a-f0-9]{64}$/.test(row.basis_hash))
    return held('native_approval_basis_invalid');
   // Later approved changes need their own native committed boundary. Do not
   // replay a CO over current rows or substitute an original pre-change basis.
   if(row.has_applied_changes!==false)return held('committed_change_basis_required');
   if(row.current_matches!==true)return held('current_rows_differ_from_native_approval');
   return {ok:true,authorized:false,snapshotReady:false,
    reason:'native_approval_basis_matches_current_order',orderId,organizationId,proposalId,
    originalScopeVerified:true,pendingEditExclusionVerified:true,basisHash:row.basis_hash};
  }catch{return held('native_approval_basis_read_failed');}
 };
}
