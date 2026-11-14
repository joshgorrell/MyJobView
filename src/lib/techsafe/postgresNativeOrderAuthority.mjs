// Server-owned source certification for NEW native-approved Sales Orders.
// Legacy and applied-change orders remain held until independently reconciled.
// No request can supply approval evidence, source rows, SQL or a certificate.
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createNativeApprovalBasisVerifier} from './postgresNativeApprovalBasis.mjs';
import {normalizeTechsafeCompletionDate} from './normalizeCompletionDate.mjs';
import {createCurrentSalesOrderSourceReader} from './postgresCurrentSalesOrderSource.mjs';
import {buildCompleteEquipmentContentEvidence} from './completeEquipmentContentEvidence.mjs';
import {persistSerializableEquipmentCertificate} from './postgresCertificateWriter.mjs';
import {createLiveSalesOrderPreflight} from '../../../supabase/functions/_shared/techsafe-live-sales-order-preflight.mjs';
import {fingerprintCurrentSalesOrder} from '../../../supabase/functions/_shared/techsafe-current-order-fingerprint.mjs';
import {prepareCurrentSalesOrderTechsafeSnapshot} from '../../../supabase/functions/_shared/techsafe-current-order-snapshot.mjs';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const hash=x=>createHash('sha256').update(x).digest('hex');
class Hold extends Error{}
const requireFact=(fact,reason)=>{if(!fact)throw new Hold(reason);};
const denied=reason=>({authorized:false,verified:false,reason});
export function createNativeOrderAuthority(pool,{sourceInstanceId,environment='sandbox',minimumUnitValueCents=0}={}){
 if(typeof pool?.connect!=='function'||!id(sourceInstanceId)||!['sandbox','production'].includes(environment)||
    !Number.isSafeInteger(minimumUnitValueCents)||minimumUnitValueCents<0)
  throw TypeError('trusted_pool_and_source_configuration_required');
 const transaction=async operation=>{
  let client,begun=false,committed=false;
  try{
   client=await pool.connect();
   requireFact(typeof client?.query==='function'&&typeof client?.release==='function','trusted_postgres_client_required');
   await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');begun=true;
   const result=await operation(client);
   await client.query('COMMIT');committed=true;return result;
  }catch(error){
   if(client&&begun&&!committed)try{await client.query('ROLLBACK');}catch{}
   return denied(error instanceof Hold?error.message:'native_source_transaction_aborted');
  }finally{if(client?.release)client.release(committed?undefined:new Error('techsafe_transaction_discarded'));}
 };
 const context=async(client,{binding,generation})=>{
  requireFact(binding&&['connectionId','organizationId','orderId','proposalId'].every(k=>uuid(binding[k]))&&positive(generation),'invalid_native_binding');
  const connections=await client.query(`SELECT organization_id,proposal_id,connection_generation,enabled,status
   FROM techsafe_source.integration_connections WHERE connection_id=$1 AND sales_order_id=$2 FOR UPDATE`,
   [binding.connectionId,binding.orderId]);
  const c=connections.rows?.[0];
  requireFact(connections.rows?.length===1&&c.enabled===true&&c.status==='active'&&
   c.organization_id===binding.organizationId&&c.proposal_id===binding.proposalId&&Number(c.connection_generation)===generation,
   'connection_scope_or_generation_changed');
  const scope={orderId:binding.orderId,organizationId:binding.organizationId,proposalId:binding.proposalId};
  const basis=await createNativeApprovalBasisVerifier(client)(scope);
  requireFact(basis.ok===true,basis.reason||'native_approval_basis_unverified');
  const observed=await createLiveSalesOrderPreflight(client)({connectionId:binding.connectionId,orderId:binding.orderId});
  requireFact(observed.reason==='source_certificate_and_revision_required'&&observed.source,'native_current_source_unavailable');
  const fingerprint=await fingerprintCurrentSalesOrder(observed.source,hash);
  requireFact(fingerprint.valid===true,fingerprint.reason||'native_fingerprint_invalid');
  const source=await createCurrentSalesOrderSourceReader(client)(scope);
  requireFact(source.ok===true&&source.issues.length===0,'native_sold_components_unresolved');
  const status=observed.source.binding.order_status;
  requireFact(!['cancelled','canceled','deleted'].includes(status),'native_order_not_active');
  const completed=['complete','completed'].includes(status);
  const completion=observed.source.binding.first_completion_date;
  const completedOn=completed?normalizeTechsafeCompletionDate(completion):undefined;
  requireFact(!completed||completedOn!==null,'sales_order_completion_date_unverified');
  return {source,basis,observedFingerprint:fingerprint.fingerprint,
   sourceFingerprint:hash(JSON.stringify([basis.basisHash,fingerprint.fingerprint])),
   orderStatus:completed?'completed':'open',completedOn,
   customerName:observed.source.binding.full_name||observed.source.binding.contact_name};
 };
 const snapshotFor=(ctx,binding,generation,revision,eventId)=>{
  const result=prepareCurrentSalesOrderTechsafeSnapshot({source:ctx.source,
   connection:{...binding,generation},revision,eventId,sourceInstanceId,environment,
   orderStatus:ctx.orderStatus,completedOn:ctx.completedOn,customerName:ctx.customerName,siteRef:binding.orderId,minimumUnitValueCents});
  requireFact(result.ready===true,result.reason||'native_export_snapshot_invalid');return result.snapshot;
 };
 const evidenceFor=(ctx,binding,generation,revision,snapshot)=>{
  const evidence=buildCompleteEquipmentContentEvidence({
   inspection:{ok:true,authorized:false,snapshotReady:false,revision,
    items:ctx.source.equipment.map(x=>({sourceLineId:x.sourceLineId,productId:x.productRef,quantity:x.quantity}))},
   details:snapshot.lines.map(x=>({...x,description:x.description??''})),
   ...binding,connectionGeneration:generation,sourceFingerprint:ctx.sourceFingerprint});
  requireFact(evidence.ok===true,evidence.reason||'native_equipment_evidence_incomplete');return evidence;
 };
 const authority=(binding,generation,revision,eventId,fingerprint,snapshot)=>({verified:true,sourceAuthorized:true,
  scopeVerified:true,snapshotReady:true,...binding,generation,revision,eventId,fingerprint,snapshot});
 return Object.freeze({
  certifySource:args=>transaction(async client=>{
   const {binding,generation,fingerprint}=args||{};
   const ctx=await context(client,{binding,generation});
   requireFact(fingerprint===ctx.observedFingerprint,'source_changed_before_certification');
   const prior=(await client.query(`SELECT revision,connection_generation,state,source_fingerprint
    FROM techsafe_source.order_revision_ledger WHERE connection_id=$1 AND sales_order_id=$2 FOR UPDATE`,
    [binding.connectionId,binding.orderId])).rows[0];
   if(prior?.state==='candidate'&&Number(prior.connection_generation)===generation&&prior.source_fingerprint===ctx.sourceFingerprint){
    const existing=(await client.query(`SELECT source_revision,event_id,export_snapshot,equipment_fingerprint,canonical_version FROM techsafe_source.equipment_snapshot_certificates
     WHERE connection_id=$1 AND sales_order_id=$2 AND connection_generation=$3 AND source_revision=$4
       AND state='certified' AND source_fingerprint=$5 AND certified_at IS NOT NULL FOR SHARE`,
     [binding.connectionId,binding.orderId,generation,prior.revision,ctx.sourceFingerprint])).rows;
    if(existing.length===1&&uuid(existing[0].event_id)){
     const revision=Number(existing[0].source_revision);
     requireFact(positive(revision),'invalid_persisted_revision');
     const snapshot=snapshotFor(ctx,binding,generation,revision,existing[0].event_id);
     // Settings/customer/completion changes require a fresh revision/event too.
     if(isDeepStrictEqual(snapshot,existing[0].export_snapshot)&&
      existing[0].canonical_version==='mjv-techsafe-complete-equipment-v1'&&
      existing[0].equipment_fingerprint===evidenceFor(ctx,binding,generation,revision,snapshot).contentFingerprint)return authority(binding,generation,revision,existing[0].event_id,fingerprint,snapshot);
    }
   }
   const revision=prior?Number(prior.revision)+1:1;
   requireFact(positive(revision),'native_revision_overflow');
   await client.query(`INSERT INTO techsafe_source.order_revision_ledger
    (connection_id,organization_id,sales_order_id,proposal_id,revision,connection_generation,source_fingerprint,state,hold_reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,'candidate',NULL)
    ON CONFLICT(connection_id,sales_order_id) DO UPDATE SET revision=EXCLUDED.revision,
      connection_generation=EXCLUDED.connection_generation,source_fingerprint=EXCLUDED.source_fingerprint,
      state='candidate',hold_reason=NULL,updated_at=clock_timestamp()`,
    [binding.connectionId,binding.organizationId,binding.orderId,binding.proposalId,revision,generation,ctx.sourceFingerprint]);
   const eventId=randomUUID(),snapshot=snapshotFor(ctx,binding,generation,revision,eventId);
   const evidence=evidenceFor(ctx,binding,generation,revision,snapshot);
   const persisted=await persistSerializableEquipmentCertificate({client,evidence});
   requireFact(persisted.ok===true&&uuid(persisted.certificateId),'native_certificate_persistence_failed');
   const stored=await client.query(`UPDATE techsafe_source.equipment_snapshot_certificates SET export_snapshot=$2::jsonb,event_id=$3
    WHERE certificate_id=$1 AND state='certified' RETURNING export_snapshot,event_id`,
    [persisted.certificateId,JSON.stringify(snapshot),eventId]);
   requireFact(stored.rows?.length===1&&stored.rows[0].event_id===eventId&&isDeepStrictEqual(stored.rows[0].export_snapshot,snapshot),
    'native_export_persistence_failed');
   return authority(binding,generation,revision,eventId,fingerprint,snapshot);
  }),
  authorizeForDelivery:args=>transaction(async client=>{
   const {binding,generation,revision,eventId,snapshot}=args||{};
   requireFact(positive(revision)&&uuid(eventId),'invalid_native_delivery_identity');
   const ctx=await context(client,{binding,generation});
   const expected=snapshotFor(ctx,binding,generation,revision,eventId);
   requireFact(isDeepStrictEqual(snapshot,expected),'native_delivery_content_changed');
   const evidence=evidenceFor(ctx,binding,generation,revision,expected);
   const matches=await client.query(`SELECT c.certificate_id FROM techsafe_source.equipment_snapshot_certificates c
    JOIN techsafe_source.order_revision_ledger l ON l.connection_id=c.connection_id AND l.sales_order_id=c.sales_order_id
      AND l.revision=c.source_revision AND l.connection_generation=c.connection_generation
      AND l.source_fingerprint=c.source_fingerprint AND l.state='candidate'
    WHERE c.connection_id=$1 AND c.sales_order_id=$2 AND c.organization_id=$3 AND c.proposal_id=$4
      AND c.connection_generation=$5 AND c.source_revision=$6 AND c.event_id=$7
      AND c.state='certified' AND c.certified_at IS NOT NULL AND c.source_fingerprint=$8
      AND c.export_snapshot=$9::jsonb AND c.equipment_fingerprint=$10
      AND c.canonical_version='mjv-techsafe-complete-equipment-v1' AND c.equipment_count=$11 FOR SHARE OF c,l`,
    [binding.connectionId,binding.orderId,binding.organizationId,binding.proposalId,generation,revision,eventId,
     ctx.sourceFingerprint,JSON.stringify(snapshot),evidence.contentFingerprint,evidence.lineCount]);
   requireFact(matches.rows?.length===1,'persisted_native_delivery_authority_missing');
   return {authorized:true,...binding,generation,revision,eventId};
  })
 });
}
