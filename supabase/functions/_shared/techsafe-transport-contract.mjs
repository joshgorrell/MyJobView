// Techsafe receiver v2 transport contract boundary. No network, secrets or DB access.
// A private diagnostic source read is NOT authorization to transmit.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&v.length>0&&v.length<=128&&/^[A-Za-z0-9_-]+$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>=1;
const held=reason=>({ready:false,reason,snapshot:null});
const lineKeys=new Set(['sourceLineId','productRef','productKind','scope','customerSupplied','techsafeExcluded','quantity','unitEquipmentValueCents','manufacturer','model','sku','description','room','serialNumber','productCategory','originalPurchaseDate']);
const allowed=new Set(['schemaVersion','environment','connectionId','sourceInstanceId','organizationId','orderId','eventId','generation','revision','complete','scopeState','orderStatus','currency','minimumUnitValueCents','customerRef','customerName','siteRef','lines']);
export function prepareTechsafeTransportSnapshot({source,authority,binding,revision,eventId}={}){
 if(!object(binding)||!['connectionId','organizationId','orderId','proposalId'].every(k=>id(binding[k])))
  return held('binding_unverified');
 // Explicit trusted server authority must be independently established, never inferred from
 // a SQL evidence payload, business candidate, or caller-provided readiness flags.
 if(!object(authority)||authority.verified!==true||authority.sourceAuthorized!==true||
  authority.scopeVerified!==true||authority.snapshotReady!==true||
  authority.connectionId!==binding.connectionId||authority.organizationId!==binding.organizationId||
  authority.orderId!==binding.orderId||authority.proposalId!==binding.proposalId||
  !integer(authority.generation)||!integer(authority.revision)||
  authority.revision!==revision||!id(eventId))return held('source_authority_unverified');
 if(!object(source)||source.valid!==true||source.sales_order_id!==binding.orderId||
  source.approved_proposal_id!==binding.proposalId||
  source.organization_id!==binding.organizationId||
  source.connection_id!==binding.connectionId||!Array.isArray(source.equipment))
  return held('source_evidence_mismatch');
 // No field spreading: SQL source records contain cost, margin, internal notes,
 // personnel identifiers, tax and other private information.
 const snapshot=authority.snapshot;
 if(!object(snapshot)||Object.keys(snapshot).some(k=>!allowed.has(k))||
  snapshot.schemaVersion!==2||snapshot.connectionId!==binding.connectionId||
  snapshot.organizationId!==binding.organizationId||snapshot.orderId!==binding.orderId||
  snapshot.generation!==authority.generation||snapshot.revision!==revision||
  snapshot.eventId!==eventId||snapshot.complete!==true||
  snapshot.scopeState!=='committed'||!Array.isArray(snapshot.lines)||
  snapshot.lines.some(l=>!object(l)||Object.keys(l).some(k=>!lineKeys.has(k))||
   !id(l.sourceLineId)||!['included','excluded'].includes(l.scope)))
  return held('snapshot_contract_unverified');
 // Do not infer equipment membership from the raw SQL rows: the independent
 // approved-basis and applied-change history gate must prove it first.
 const result={};
 for(const k of allowed)if(Object.hasOwn(snapshot,k))result[k]=snapshot[k];
 result.lines=snapshot.lines.map(l=>{const row={};for(const k of lineKeys)if(Object.hasOwn(l,k))row[k]=l[k];return row;});
 return {ready:true,reason:null,snapshot:result};
}
