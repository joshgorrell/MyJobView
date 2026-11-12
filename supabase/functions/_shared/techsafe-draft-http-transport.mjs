// Isolated server-only Techsafe HTTP transport. Never import into a browser.
// The caller must first establish a trusted, fresh, monotonic source revision.
// This module neither issues source authority nor enables checkout/coverage.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const revision=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v);
const held=reason=>({accepted:false,reason});
const validHost=hostname=>{
 const host=hostname.toLowerCase().replace(/\\.$/,'');
 if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
    host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid'))return false;
 // No IP literals: prevent direct calls to private, loopback or link-local ranges.
 if(/^\\[/.test(host)||/^[0-9.]+$/.test(host))return false;
 return host.includes('.')&&host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
};
const validSnapshot=(content,binding,sourceRevision)=>{
 if(!object(content)||content.schemaVersion!==2||content.connectionId!==binding.connectionId||
   content.organizationId!==binding.organizationId||content.orderId!==binding.orderId||
   !Number.isSafeInteger(content.generation)||content.generation<1||
   !Number.isSafeInteger(content.revision)||String(content.revision)!==sourceRevision||
   content.complete!==true||content.scopeState!=='committed'||
   !['production','sandbox'].includes(content.environment)||
   !Array.isArray(content.lines)||content.lines.length>10000)return false;
 const seen=new Set();
 for(const line of content.lines){
  if(!object(line)||!id(line.sourceLineId)||seen.has(line.sourceLineId)||
     !['included','removed'].includes(line.scope)||
     !Number.isSafeInteger(line.quantity)||line.quantity<0||
     !Number.isSafeInteger(line.unitEquipmentValueCents)||line.unitEquipmentValueCents<0||
     typeof line.customerSupplied!=='boolean'||typeof line.techsafeExcluded!=='boolean')return false;
  seen.add(line.sourceLineId);
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
 const body=JSON.stringify({schemaVersion:2,connectionId:binding.connectionId,organizationId:binding.organizationId,
  orderId:binding.orderId,proposalId:binding.proposalId,sourceRevision,content});
 if(body.length>1048576)return held('payload_too_large');
 try{
  const response=await fetchImpl(url.toString(),{method:'POST',headers:{'Content-Type':'application/json',
   Authorization:'Bearer '+token,'Idempotency-Key':binding.connectionId+':'+binding.orderId+':'+sourceRevision},
   body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response||response.status!==200)return held('receiver_not_confirmed');
  const receipt=await response.json();
  if(!object(receipt)||receipt.accepted!==true||receipt.connectionId!==binding.connectionId||
   receipt.orderId!==binding.orderId||receipt.organizationId!==binding.organizationId||
   receipt.sourceRevision!==sourceRevision||!id(receipt.draftId))
   return held('receiver_receipt_unverified');
  return {accepted:true,reason:'draft_received',draftId:receipt.draftId,sourceRevision};
 }catch{return held('transport_failed');}
}
