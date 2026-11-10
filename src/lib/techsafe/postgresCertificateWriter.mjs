// Private server-side certificate persistence. Must be invoked only inside a
// trusted PostgreSQL SERIALIZABLE transaction AFTER authoritative source reads.
// Does not authorize dispatch; storage remains private and inert.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)&&x!=='0'.repeat(64);
const pos=x=>Number.isSafeInteger(x)&&x>0;
const held=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export async function persistSerializableEquipmentCertificate({client,evidence}={}) {
 if(!client||typeof client.query!=='function')return held('trusted_transaction_missing');
 if(!evidence||evidence.ok!==true||evidence.authorized!==false||
    evidence.snapshotReady!==false||
    ![evidence.connectionId,evidence.orderId,evidence.organizationId,evidence.proposalId].every(uuid)||
    !pos(evidence.connectionGeneration)||!pos(evidence.revision)||
    !hash(evidence.sourceFingerprint)||!hash(evidence.contentFingerprint)||
    !Number.isSafeInteger(evidence.lineCount)||evidence.lineCount<0||evidence.lineCount>10000)
  return held('invalid_complete_equipment_evidence');
 // Do not accept caller claims about transaction isolation.
 const isolation=await client.query('SHOW transaction_isolation');
 if(isolation?.rows?.[0]?.transaction_isolation!=='serializable')
  return held('serializable_transaction_required');
 // Lock in the same connection/ledger order as the source inspector.
 const connection=await client.query(
  `SELECT organization_id,proposal_id,connection_generation,enabled,status
     FROM techsafe_source.integration_connections
    WHERE connection_id=$1 AND sales_order_id=$2 FOR UPDATE`,
  [evidence.connectionId,evidence.orderId]);
 const c=connection.rows?.[0];
 if(!c||c.organization_id!==evidence.organizationId||
    c.proposal_id!==evidence.proposalId||
    Number(c.connection_generation)!==evidence.connectionGeneration||
    c.enabled!==true||c.status!=='active')
  return held('connection_scope_changed');
 const ledger=await client.query(
  `SELECT organization_id,proposal_id,connection_generation,revision,state,source_fingerprint
     FROM techsafe_source.order_revision_ledger
    WHERE connection_id=$1 AND sales_order_id=$2 FOR UPDATE`,
  [evidence.connectionId,evidence.orderId]);
 const l=ledger.rows?.[0];
 if(!l||l.organization_id!==evidence.organizationId||
    l.proposal_id!==evidence.proposalId||
    Number(l.connection_generation)!==evidence.connectionGeneration||
    Number(l.revision)!==evidence.revision||l.state!=='candidate'||
    l.source_fingerprint!==evidence.sourceFingerprint)
  return held('ledger_changed_before_certificate');
 // Unique revision conflicts must never silently replace existing evidence.
 // Caller must roll back the entire transaction if INSERT fails.
 const insert=await client.query(
  `INSERT INTO techsafe_source.equipment_snapshot_certificates
   (connection_id,sales_order_id,organization_id,proposal_id,
    connection_generation,source_revision,source_fingerprint,
    equipment_fingerprint,canonical_version,equipment_count,state,certified_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
    'mjv-techsafe-complete-equipment-v1',$9,'certified',clock_timestamp())
   RETURNING certificate_id`,
  [evidence.connectionId,evidence.orderId,evidence.organizationId,
   evidence.proposalId,evidence.connectionGeneration,evidence.revision,
   evidence.sourceFingerprint,evidence.contentFingerprint,evidence.lineCount]);
 if(!uuid(insert.rows?.[0]?.certificate_id))
  throw new Error('certificate_insert_not_confirmed');
 return {ok:true,authorized:false,snapshotReady:false,
  reason:'certificate_persisted_not_dispatch_authorized',
  certificateId:insert.rows[0].certificate_id};
}
