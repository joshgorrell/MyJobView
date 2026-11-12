// Read-only, private diagnostic for the actual MJV source certification gate.
// It does NOT issue authority, create ledger rows, change connection state,
// read secrets or dispatch snapshots. Call with a trusted Postgres client.
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
const held=(reason,checks={})=>({ready:false,authorized:false,reason,checks});
export function createTechsafeCertificationReadinessInspector(client){
 if(!client||typeof client.query!=='function')throw TypeError('trusted_postgres_client_required');
 return async ({connectionId,orderId}={})=>{
  if(!uuid(connectionId)||!uuid(orderId))return held('invalid_binding');
  let connection,ledger,certificate,order;
  try{
   const result=await client.query(
    `SELECT c.connection_id,c.organization_id,c.sales_order_id,c.proposal_id,
      c.connection_generation,c.enabled,c.status,
      so.proposal_id AS actual_proposal_id,p.status AS approval_status,
      p.approved_at,p.approval_completed_at
      FROM techsafe_source.integration_connections c
      LEFT JOIN public.sales_orders so ON so.id=c.sales_order_id
       AND so.organization_id=c.organization_id
      LEFT JOIN public.proposals p ON p.id=so.proposal_id
       AND p.organization_id=c.organization_id
      WHERE c.connection_id=$1 AND c.sales_order_id=$2`,
    [connectionId,orderId]);
   if(result.rows?.length!==1)return held('connection_not_found');
   connection=result.rows[0];
   const revisions=await client.query(
    `SELECT revision,connection_generation,state,source_fingerprint
      FROM techsafe_source.order_revision_ledger
      WHERE connection_id=$1 AND sales_order_id=$2`,[connectionId,orderId]);
   ledger=revisions.rows?.[0]??null;
   const certificates=await client.query(
    `SELECT source_revision,connection_generation,state,source_fingerprint,
      equipment_fingerprint,canonical_version,certified_at
      FROM techsafe_source.equipment_snapshot_certificates
      WHERE connection_id=$1 AND sales_order_id=$2
      ORDER BY source_revision DESC LIMIT 1`,[connectionId,orderId]);
   certificate=certificates.rows?.[0]??null;
  }catch{return held('private_source_inspection_failed');}
  const generation=Number(connection.connection_generation);
  const checks={
   connectionActive:connection.enabled===true&&connection.status==='active',
   approvedSalesOrder:connection.actual_proposal_id===connection.proposal_id&&
    connection.approval_status==='approved'&&
    Boolean(connection.approved_at||connection.approval_completed_at),
   revisionPresent:Boolean(ledger),
   revisionCandidate:Boolean(ledger&&ledger.state==='candidate'&&
    Number(ledger.connection_generation)===generation&&Number.isSafeInteger(Number(ledger.revision))&&Number(ledger.revision)>0),
   certificatePresent:Boolean(certificate),
   certificateMatchesRevision:Boolean(ledger&&certificate&&
    certificate.state==='certified'&&certificate.certified_at&&
    Number(certificate.source_revision)===Number(ledger.revision)&&
    Number(certificate.connection_generation)===generation&&
    certificate.source_fingerprint===ledger.source_fingerprint&&
    certificate.canonical_version==='mjv-techsafe-complete-equipment-v1'),
   // Current SQL authorization function deliberately always denies. A matching
   // certificate alone must never be mistaken for source delivery authority.
   deliveryAuthorityImplemented:false
  };
  const firstMissing=Object.entries(checks).find(([,ok])=>!ok)?.[0]??'deliveryAuthorityImplemented';
  return held('certification_gate_'+firstMissing,checks);
 };
}
