// Server-only, inspection-only bridge from the actual locked MJV Sales Order
// current rows to the existing MJV equipment projection. No CO replay.
// Caller owns the SERIALIZABLE transaction and must supply private readers.
import {createTransactionalBaseEquipmentAudit} from './postgresTransactionalBaseAudit.mjs';
import {createLockedRevisionReader} from './postgresLockedRevisionReader.mjs';
import {inspectMjvCurrentSalesOrderEquipment} from './mjvCurrentEquipmentAdapter.mjs';
const hold=reason=>Object.freeze({ok:false,authorized:false,snapshotReady:false,quoteReady:false,reason});
const exactQuantity=v=>{const s=String(v);if(!/^(?:0|[1-9]\\d*)(?:\\.0+)?$/.test(s))return null;const n=Number(s);return Number.isSafeInteger(n)?n:null;};
const sameRevision=(a,b)=>a.connectionGeneration===b.connectionGeneration&&a.revision===b.revision&&
 a.sourceFingerprint===b.sourceFingerprint&&a.organizationId===b.organizationId&&a.proposalId===b.proposalId&&b.state==='candidate';
export function createTransactionalCurrentEquipmentInspection(client,readPrivateCurrentContent){
 if(!client||typeof client.query!=='function'||typeof readPrivateCurrentContent!=='function')
  throw new TypeError('trusted_client_and_private_reader_required');
 const audit=createTransactionalBaseEquipmentAudit(client),revision=createLockedRevisionReader(client);
 return async ({connectionId,orderId}={})=>{
  try{
   const current=await audit({connectionId,orderId});
   if(current.ok!==true||current.baseLinesAreCurrent!==true||current.baseLineSource!=='current_proposal_line_items')
    return hold(current.reason||'current_equipment_audit_unverified');
   // Private content reader MUST use this same client/transaction. It may
   // resolve catalog/eligibility/prices, but must not replay change orders.
   const source=await readPrivateCurrentContent({client,connectionId,orderId,
    organizationId:current.organizationId,proposalId:current.proposalId,
    revision:current.revision,sourceFingerprint:current.sourceFingerprint});
   if(!source||source.readModelVersion===1||source.organizationId!==current.organizationId||
      source.order?.id!==orderId||source.order?.proposal_id!==current.proposalId||
      !Array.isArray(source.lines)||source.lines.length!==current.baseLineCount)
    return hold('private_current_content_unverified');
   const scanned=new Map();
   for(const line of current.baseLines){
    if(scanned.has(line.id))return hold('current_equipment_identity_ambiguous');
    scanned.set(line.id,line);
   }
   const observed=new Set();
   for(const entry of source.lines){
    const line=entry?.line,expected=scanned.get(line?.id);
    if(!expected||observed.has(line.id)||line.organization_id!==current.organizationId||
       line.proposal_id!==current.proposalId||line.product_id!==expected.productId||
       exactQuantity(line.quantity)!==expected.quantity)
     return hold('current_equipment_rows_differ_from_locked_scan');
    observed.add(line.id);
   }
   if(observed.size!==scanned.size)return hold('current_equipment_rows_differ_from_locked_scan');
   const projected=inspectMjvCurrentSalesOrderEquipment({source});
   if(projected.ok!==true)return hold(projected.reason||'current_equipment_projection_unverified');
   const last=await revision({connectionId,orderId});
   if(!sameRevision(current,last))return hold('current_equipment_revision_changed');
   // Source flags and a matching revision do not prove approval provenance,
   // sold membership, all price facts or a persisted receiver certificate.
   return Object.freeze({ok:true,authorized:false,snapshotReady:false,quoteReady:false,
    reason:'transactional_current_equipment_inspected_not_authorized',
    orderId,organizationId:current.organizationId,revision:current.revision,
    sourceFingerprint:current.sourceFingerprint,lines:projected.lines,
    excluded:projected.excluded,baseLinesAreCurrent:true});
  }catch{return hold('transactional_current_equipment_inspection_failed');}
 };
}
