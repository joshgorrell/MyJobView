// Trusted PostgreSQL reader for the actual connection/revision ledger.
// Only usable from the same SERIALIZABLE transaction client as the equipment
// source reader and certificate writer. This is NOT a complete source reader.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const integer=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x)&&BigInt(x)<=BigInt(Number.MAX_SAFE_INTEGER);
const validNumber=x=>(typeof x==='string'||(typeof x==='number'&&Number.isSafeInteger(x)))&&integer(String(x));
export function createLockedRevisionReader(client) {
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 return async function readCurrentRevision({connectionId,orderId}={}) {
  if(!uuid(connectionId)||!uuid(orderId))throw new Error('invalid_source_identity');
  // Always acquire connection lock before ledger lock, as required by the
  // certificate writer. No caller-supplied status or revision is trusted.
  const connection=await client.query(
   `SELECT organization_id,proposal_id,connection_generation,enabled,status
      FROM techsafe_source.integration_connections
     WHERE connection_id=$1 AND sales_order_id=$2 FOR UPDATE`,
   [connectionId,orderId]);
  const c=connection.rows?.[0];
  if(connection.rows?.length!==1||!c||c.enabled!==true||c.status!=='active'||!uuid(c.organization_id)||
     !uuid(c.proposal_id)||!validNumber(c.connection_generation))
   throw new Error('connection_not_active_or_unverified');
  const ledger=await client.query(
   `SELECT organization_id,proposal_id,connection_generation,revision,
           source_fingerprint,state
      FROM techsafe_source.order_revision_ledger
     WHERE connection_id=$1 AND sales_order_id=$2 FOR UPDATE`,
   [connectionId,orderId]);
  const l=ledger.rows?.[0];
  if(ledger.rows?.length!==1||!l||l.organization_id!==c.organization_id||l.proposal_id!==c.proposal_id||
     String(l.connection_generation)!==String(c.connection_generation)||
     !validNumber(l.revision)||l.state!=='candidate'||
     typeof l.source_fingerprint!=='string'||
     !/^[0-9a-f]{64}$/.test(l.source_fingerprint)||
     l.source_fingerprint==='0'.repeat(64))
   throw new Error('ledger_held_or_scope_mismatch');
  return Object.freeze({
   connectionGeneration:Number(c.connection_generation),
   revision:Number(l.revision),sourceFingerprint:l.source_fingerprint,
   state:'candidate',
   organizationId:c.organization_id,proposalId:c.proposal_id
  });
 };
}
