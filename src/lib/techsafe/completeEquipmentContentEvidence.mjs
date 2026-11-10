// Deterministic complete-equipment content digest for a previously inspected
// approved Sales Order. NOT a persisted certificate, transaction, or dispatch grant.
import {createHash} from 'node:crypto';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const lineId=x=>id(x)||(typeof x==='string'&&x.startsWith('change:')&&id(x.slice(7)));
const positive=x=>Number.isSafeInteger(x)&&x>0;
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)&&x!=='0'.repeat(64);
const fail=reason=>({ok:false,authorized:false,snapshotReady:false,reason});
export function buildCompleteEquipmentContentEvidence({inspection,details,connectionId,connectionGeneration,orderId,organizationId,proposalId,sourceFingerprint}={}){
 if(inspection?.ok!==true||inspection.authorized!==false||inspection.snapshotReady!==false||
    !id(connectionId)||!id(orderId)||!id(organizationId)||!id(proposalId)||
    !positive(connectionGeneration)||!positive(inspection.revision)||!hash(sourceFingerprint))
  return fail('invalid_approved_source_evidence');
 if(!Array.isArray(inspection.items)||!Array.isArray(details)||
    inspection.items.length!==details.length||details.length>10000)
  return fail('incomplete_equipment_content');
 const source=new Map();
 for(const item of inspection.items){
  if(!item||!lineId(item.sourceLineId)||source.has(item.sourceLineId)||!id(item.productId)||
     !positive(item.quantity)||item.quantity>10000)return fail('invalid_source_line');
  source.set(item.sourceLineId,item);
 }
 const canonical=[],seen=new Set();
 for(const detail of details){
  if(!detail||!lineId(detail.sourceLineId)||seen.has(detail.sourceLineId)||
     !source.has(detail.sourceLineId)||!id(detail.productRef)||
     detail.productRef!==source.get(detail.sourceLineId).productId||
     detail.productKind!=='equipment'||typeof detail.description!=='string'||
     detail.description.length>4000||!Number.isSafeInteger(detail.unitEquipmentValueCents)||
     detail.unitEquipmentValueCents<0||typeof detail.customerSupplied!=='boolean'||
     typeof detail.techsafeExcluded!=='boolean')
    return fail('invalid_equipment_content');
  seen.add(detail.sourceLineId);
  canonical.push([detail.sourceLineId,detail.productRef,source.get(detail.sourceLineId).quantity,
   detail.description,detail.unitEquipmentValueCents,detail.customerSupplied,detail.techsafeExcluded]);
 }
 canonical.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 const serialized=JSON.stringify(['mjv-techsafe-complete-equipment-v1',connectionId,connectionGeneration,
  organizationId,orderId,proposalId,inspection.revision,sourceFingerprint,canonical]);
 return {ok:true,authorized:false,snapshotReady:false,reason:'content_digest_not_transaction_certified',
  connectionId,connectionGeneration,organizationId,orderId,proposalId,revision:inspection.revision,
  sourceFingerprint,contentFingerprint:createHash('sha256').update(serialized,'utf8').digest('hex'),
  lineCount:canonical.length};
}
export function compareCompleteEquipmentContentEvidence(previous,current){
 if(!previous?.ok||!current?.ok||
    !id(previous.connectionId)||!id(previous.orderId)||!id(previous.organizationId)||!id(previous.proposalId)||
    ['connectionId','orderId','organizationId','proposalId'].some(k=>previous[k]!==current[k]))
  return fail('content_scope_mismatch');
 if(!positive(previous.connectionGeneration)||!positive(current.connectionGeneration)||
    !positive(previous.revision)||!positive(current.revision)||
    !hash(previous.contentFingerprint)||!hash(current.contentFingerprint)||
    !hash(previous.sourceFingerprint)||!hash(current.sourceFingerprint))
  return fail('invalid_content_evidence');
 if(current.connectionGeneration<previous.connectionGeneration||
    (current.connectionGeneration===previous.connectionGeneration&&current.revision<previous.revision))
  return fail('content_revision_rollback');
 if(current.connectionGeneration===previous.connectionGeneration&&current.revision===previous.revision&&
    (current.contentFingerprint!==previous.contentFingerprint||
     current.sourceFingerprint!==previous.sourceFingerprint))
  return fail('same_revision_content_conflict');
 return {ok:true,authorized:false,snapshotReady:false,reason:'content_consistent_not_certified',
  changed:current.connectionGeneration!==previous.connectionGeneration||current.revision!==previous.revision};
}
