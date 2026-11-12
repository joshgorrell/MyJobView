// Isolated server-only Techsafe HTTP transport. Never import into a browser.
// The caller must first establish a trusted, fresh, monotonic source revision.
// This module neither issues source authority nor enables checkout/coverage.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
// Techsafe accepts approved change-order lines as change:<line-id>.
const sourceLineId=v=>id(v)||(typeof v==='string'&&v.startsWith('change:')&&id(v.slice(7)));
const revision=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v);
const held=reason=>({accepted:false,reason});
const validHost=hostname=>{
 const host=hostname.toLowerCase().replace(/[.]$/,'');
 if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
    host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid'))return false;
 // No IP literals: prevent direct calls to private, loopback or link-local ranges.
 if(host.startsWith('[')||/^[0-9.]+$/.test(host))return false;
 return host.includes('.')&&host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
};
const snapshotFields=new Set(['schemaVersion','environment','connectionId','sourceInstanceId','organizationId','orderId','eventId','generation','revision','complete','scopeState','orderStatus','currency','minimumUnitValueCents','customerRef','customerName','siteRef','lines']);
const lineFields=new Set(['sourceLineId','productRef','productKind','scope','customerSupplied','techsafeExcluded','quantity','unitEquipmentValueCents','manufacturer','model','sku','description','room','serialNumber','productCategory','originalPurchaseDate']);
const kinds=new Set(['equipment','miscellaneous','labor','fee','tax','consumable','subscription','unclassified']);
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
const validSnapshot=(content,binding,sourceRevision)=>{
 if(!object(content)||Object.keys(content).some(k=>!snapshotFields.has(k))||content.schemaVersion!==2||content.connectionId!==binding.connectionId||
   content.organizationId!==binding.organizationId||content.orderId!==binding.orderId||
   !Number.isSafeInteger(content.generation)||content.generation<1||
   !Number.isSafeInteger(content.revision)||String(content.revision)!==sourceRevision||
   content.complete!==true||content.scopeState!=='committed'||
   !id(content.eventId)||!id(content.sourceInstanceId)||
   !['production','sandbox'].includes(content.environment)||
   !['open','completed','cancelled','deleted'].includes(content.orderStatus)||
   content.currency!=='USD'||!nonnegative(content.minimumUnitValueCents)||
   !id(content.customerRef)||!id(content.siteRef)||
   typeof content.customerName!=='string'||!content.customerName.trim()||
   content.customerName.length>256||[...content.customerName].some(ch=>ch.charCodeAt(0)<32||ch.charCodeAt(0)===127)||
   (['cancelled','deleted'].includes(content.orderStatus)&&content.lines?.length>0)||
   !Array.isArray(content.lines)||content.lines.length>10000)return false;
 const seen=new Set();let total=0;
 for(const line of content.lines){
  if(!object(line)||Object.keys(line).some(k=>!lineFields.has(k))||
     !sourceLineId(line.sourceLineId)||seen.has(line.sourceLineId)||
     !kinds.has(line.productKind)||
     (line.productRef!==null&&!id(line.productRef))||
     (line.productKind==='equipment'&&!id(line.productRef))||
     !['included','removed'].includes(line.scope)||
     !nonnegative(line.quantity)||line.quantity>10000||
     !nonnegative(line.unitEquipmentValueCents)||
     typeof line.customerSupplied!=='boolean'||typeof line.techsafeExcluded!=='boolean')return false;
  seen.add(line.sourceLineId);
  total+=line.quantity*line.unitEquipmentValueCents;
  if(!Number.isSafeInteger(total))return false;
 }
 return true;
};
export async function sendTechsafeDraft({endpoint,token,binding,sourceRevision,content,fetchImpl=globalThis.fetch}={}){
 if(!object(binding)||!['connectionId','organizationId','orderId','proposalId'].every(k=>id(binding[k]))||
  !revision(sourceRevision)||!validSnapshot(content,binding,sourceRevision))
  return held('invalid_authorized_payload');
 // Strictly allow HTTPS and no embedded credentials, query or fragment.
 let url;
 try{url=new URL(endpoint);}catch{return held('invalid_endpoint');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!validHost(url.hostname))return held('invalid_endpoint');
 if(typeof token!=='string'||token.length<32||token.length>4096||/[\r\n]/.test(token))return held('credentials_unavailable');
 if(typeof fetchImpl!=='function')return held('transport_unavailable');
 // Techsafe mjv-import expects the full v2 snapshot at the HTTP root, not
 // a nested {content,sourceRevision} envelope. Proposal ID is MJV-only binding.
 const body=JSON.stringify(content);
 if(body.length>1048576)return held('payload_too_large');
 try{
  const response=await fetchImpl(url.toString(),{method:'POST',headers:{'Content-Type':'application/json',
   Authorization:'Bearer '+token,'Idempotency-Key':binding.connectionId+':'+binding.orderId+':'+sourceRevision},
   body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response||response.status!==200)return held('receiver_not_confirmed');
  const receipt=await response.json();
  if(!object(receipt)||receipt.accepted!==true||receipt.connectionId!==binding.connectionId||
   receipt.orderId!==binding.orderId||receipt.sourceRevision!==sourceRevision||
   receipt.generation!==content.generation||receipt.eventId!==content.eventId||
   !['created','updated','duplicate','ignore_older','preserve_coverage_snapshot','held','suppressed'].includes(receipt.action)||
   (['created','updated'].includes(receipt.action)&&!id(receipt.proposalId)))
   return held('receiver_receipt_unverified');
  // A committed receipt is not necessarily a materialized or editable draft.
  // Duplicate, older, suppressed and purchased-plan-preservation outcomes must
  // never be reported to a caller as successful draft creation.
  const materialized=['created','updated'].includes(receipt.action);
  const reason=materialized?'draft_materialized':({
   duplicate:'snapshot_duplicate',ignore_older:'snapshot_older',
   preserve_coverage_snapshot:'purchased_coverage_preserved',
   held:'source_held_by_receiver',suppressed:'draft_suppressed'
  })[receipt.action];
  return {accepted:true,materialized,reason,action:receipt.action,
   proposalId:materialized?receipt.proposalId:null,sourceRevision};
 }catch{return held('transport_failed');}
}
