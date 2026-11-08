// Server-only, opt-in HTTP delivery for a separately authorized Techsafe v2 snapshot.
// The receiver must independently authenticate, validate, and stage the event.
// This adapter never grants authority, activates coverage, or assumes HTTP 200 means staging.
import {prepareTechsafeTransportSnapshot} from './techsafe-transport-contract.mjs';
const held=reason=>({accepted:false,reason});
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export async function sendTechsafeV2Snapshot({endpoint,token,binding,source,authority,revision,eventId,enabled=false,allowedOrigin,authorizeForDelivery,fetchImpl=globalThis.fetch}={}){
 if(enabled!==true)return held('integration_disabled');
 const prepared=prepareTechsafeTransportSnapshot({source,authority,binding,revision,eventId});
 if(!prepared.ready)return held(prepared.reason);
 if(!id(prepared.snapshot.sourceInstanceId)||!id(prepared.snapshot.eventId)||
  !Number.isSafeInteger(prepared.snapshot.generation)||prepared.snapshot.generation<1)
  return held('invalid_snapshot_identity');
 let url;
 try{url=new URL(endpoint);}catch{return held('invalid_endpoint');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port&&url.port!=='443')return held('invalid_endpoint');
 // Endpoint must be pinned by trusted server configuration, not merely HTTPS:
 // otherwise a caller could exfiltrate an authorized customer snapshot to any host.
 // Compare exact origin, not suffixes (techsafe.example.evil is not Techsafe).
 if(typeof allowedOrigin!=='string'||!/^https:\/\/[^/?#]+$/.test(allowedOrigin)||
  url.origin!==allowedOrigin)return held('endpoint_not_allowlisted');
 if(typeof token!=='string'||token.length<32||token.length>4096||/[\r\n]/.test(token))
  return held('credentials_unavailable');
 if(typeof fetchImpl!=='function')return held('transport_unavailable');
 // The authority object is just data. A separate server-only transactional gate
 // must validate the persisted active binding, generation, held/candidate ledger,
 // approved Sales Order scope, revision and fingerprint immediately before delivery.
 if(typeof authorizeForDelivery!=='function')return held('transactional_authority_unavailable');
 let permitted;
 try{
  permitted=await authorizeForDelivery({binding:{...binding},revision,eventId,
   generation:prepared.snapshot.generation,snapshot:structuredClone(prepared.snapshot)});
 }catch{return held('transactional_authority_failed');}
 if(!permitted||permitted.authorized!==true||
  permitted.connectionId!==binding.connectionId||permitted.orderId!==binding.orderId||
  permitted.organizationId!==binding.organizationId||permitted.proposalId!==binding.proposalId||
  permitted.generation!==prepared.snapshot.generation||permitted.revision!==revision||
  permitted.eventId!==eventId)return held('transactional_authority_denied');
 // Never send the raw SQL evidence or the authority object, which may contain private data.
 const body=JSON.stringify(prepared.snapshot);
 if(body.length>1048576)return held('payload_too_large');
 try{
  const response=await fetchImpl(url.toString(),{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,
    'Idempotency-Key':binding.connectionId+':'+binding.orderId+':'+revision},
   body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  // A 2xx response is only transport acknowledgement; never treat it as
  // proof of source authority, accepted staging, or enabled coverage.
  if(!response||response.status<200||response.status>=300)return held('receiver_not_confirmed');
  let receipt;
  try{receipt=await response.json();}catch{return held('receiver_receipt_unverified');}
  if(!receipt||receipt.accepted!==true||receipt.connectionId!==binding.connectionId||
   receipt.orderId!==binding.orderId||String(receipt.sourceRevision)!==String(revision)||
   receipt.eventId!==eventId||receipt.generation!==authority.generation)
   return held('receiver_receipt_unverified');
  return {accepted:true,reason:'receiver_acknowledged',sourceRevision:String(revision)};
 }catch{return held('transport_failed');}
}
