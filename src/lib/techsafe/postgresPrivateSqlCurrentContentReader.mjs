// Private PostgreSQL source adapter. Reuses MJV's existing SQL read model
// inside the SAME transaction. Version 1 is diagnostic only: never forge
// verified membership or resolved prices to pass the current-equipment gate.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hold=reason=>Object.freeze({ok:false,authorized:false,snapshotReady:false,quoteReady:false,reason});
export function createPrivateSqlCurrentContentReader(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 return async ({client:transactionClient,connectionId,orderId,organizationId,proposalId}={})=>{
  if(transactionClient!==client||![connectionId,orderId,organizationId,proposalId].every(uuid))
   return hold('private_sql_binding_unverified');
  try{
   const result=await client.query('SELECT techsafe_source.read_order_source($1::uuid,$2::uuid) AS source',[connectionId,orderId]);
   if(result?.rows?.length!==1||!result.rows[0]?.source)return hold('private_sql_source_unavailable');
   const raw=typeof result.rows[0].source==='string'?JSON.parse(result.rows[0].source):result.rows[0].source;
   if(raw?.readModelVersion!==1||raw.connectionId!==connectionId||raw.organizationId!==organizationId||
      raw.order?.id!==orderId||raw.order?.proposal_id!==proposalId||raw.order?.organization_id!==organizationId||
      !Array.isArray(raw.lines)||raw.lines.length>10000)return hold('private_sql_source_binding_mismatch');
   // Preserve the original read-model version and unverified price/scope facts.
   // A future independently attested source reader must supersede v1.
   return raw;
  }catch{return hold('private_sql_source_read_failed');}
 };
}
