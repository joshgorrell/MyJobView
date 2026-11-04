// Isolated server-only Techsafe HTTP transport. Never import into a browser.
// The caller must first establish a trusted, fresh, monotonic source revision.
// This module neither issues source authority nor enables checkout/coverage.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const revision=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v);
const held=reason=>({accepted:false,reason});
export async function sendTechsafeDraft({endpoint,token,binding,sourceRevision,content,fetchImpl=globalThis.fetch}={}){
 if(!object(binding)||!['connectionId','organizationId','orderId','proposalId'].every(k=>id(binding[k]))||
  !revision(sourceRevision)||!object(content)||content.schemaVersion!==2||
  content.organizationId!==binding.organizationId||content.orderId!==binding.orderId||
  !Array.isArray(content.lines)||content.lines.length===0||content.lines.length>10000)
  return held('invalid_authorized_payload');
 // Strictly allow HTTPS and no embedded credentials, query or fragment.
 let url;
 try{url=new URL(endpoint);}catch{return held('invalid_endpoint');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return held('invalid_endpoint');
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
   receipt.orderId!==binding.orderId||receipt.sourceRevision!==sourceRevision||!id(receipt.draftId))
   return held('receiver_receipt_unverified');
  return {accepted:true,reason:'draft_received',draftId:receipt.draftId,sourceRevision};
 }catch{return held('transport_failed');}
}
