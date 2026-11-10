// Read-only diagnostic lookup of MJV's existing candidate revision ledger.
// Candidate means pending verification, NOT committed or delivery-authorized.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const fingerprint=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function createPersistedTechsafeFingerprintReader(client){
 if(!client||typeof client.query!=='function')throw new TypeError('private_postgres_client_required');
 return async function read({connectionId,organizationId,orderId,proposalId,generation}={}){
  if(![connectionId,organizationId,orderId,proposalId].every(uuid)||
     !Number.isSafeInteger(generation)||generation<1)throw Error('invalid_ledger_binding');
  const {rows}=await client.query(`SELECT l.source_fingerprint,l.state,l.hold_reason,l.revision
   FROM techsafe_source.order_revision_ledger l
   JOIN techsafe_source.integration_connections c
    ON c.connection_id=l.connection_id AND c.organization_id=l.organization_id
    AND c.sales_order_id=l.sales_order_id AND c.proposal_id=l.proposal_id
    AND c.connection_generation=l.connection_generation
   WHERE l.connection_id=$1::uuid AND l.organization_id=$2::uuid
    AND l.sales_order_id=$3::uuid AND l.proposal_id=$4::uuid
    AND l.connection_generation=$5::bigint AND c.enabled=true AND c.status='active'
   LIMIT 2`,[connectionId,organizationId,orderId,proposalId,generation]);
  if(rows.length===0)return null;
  if(rows.length!==1)throw Error('ambiguous_revision_baseline');
  const row=rows[0];
  // The live schema only supports held/candidate. A candidate fingerprint
  // is useful for diagnostics but MUST NOT be promoted into send authority.
  if(!fingerprint(row.source_fingerprint)||!Number.isSafeInteger(Number(row.revision))||
     Number(row.revision)<1||row.hold_reason!==null||row.state!=='candidate')
    throw Error('revision_candidate_untrusted');
  return row.source_fingerprint;
 };
}
