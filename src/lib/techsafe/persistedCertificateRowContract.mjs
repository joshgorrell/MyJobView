// Server-only persisted SQL certificate row validation. Never a delivery grant.
// Rows MUST be loaded independently in a trusted transaction, not from a client.
import {checkPersistedEquipmentCertificate} from './persistedCertificateGate.mjs';
const fail=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)&&x!=='0'.repeat(64);
const version='mjv-techsafe-complete-equipment-v1';
export function inspectPersistedCertificateRow({row,connection,ledger,freshEvidence,lastDelivered=null}={}) {
 if(!row||typeof row!=='object'||Array.isArray(row))return fail('certificate_row_missing');
 if(!uuid(row.certificate_id)||!uuid(row.connection_id)||!uuid(row.sales_order_id)||
    !uuid(row.organization_id)||!uuid(row.proposal_id)||
    !positive(row.connection_generation)||!positive(row.source_revision)||
    !hash(row.source_fingerprint)||!hash(row.equipment_fingerprint)||
    row.canonical_version!==version||!Number.isSafeInteger(row.equipment_count)||
    row.equipment_count<0||row.equipment_count>10000)return fail('certificate_row_invalid');
 if(row.state!=='certified'||!row.certified_at)return fail('certificate_row_not_certified');
 // SQL storage lacks sourceCommitted, approvalVerified and transactionVerified.
 // NEVER manufacture these attestations from state='certified' or a timestamp.
 const certificate={connectionId:row.connection_id,orderId:row.sales_order_id,
  organizationId:row.organization_id,proposalId:row.proposal_id,
  generation:row.connection_generation,revision:row.source_revision,
  fingerprint:row.source_fingerprint,contentFingerprint:row.equipment_fingerprint,
  state:row.state,sourceCommitted:false,approvalVerified:false,transactionVerified:false};
 const result=checkPersistedEquipmentCertificate({connection,ledger,certificate,freshEvidence,lastDelivered});
 return result.ok?fail('certificate_row_lacks_trusted_transaction_attestation'):result;
}
