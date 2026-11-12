// Server-side Techsafe draft dispatch boundary. No HTTP, credentials or DB writes
// live here: callers must supply authenticated private reader, connection gate,
// and delivery implementations. Disabled by default; never runs in MJV workflows.
import {prepareTechsafeCandidateFromBundle} from './techsafe-bundle-composition.mjs';
import {compareTechsafeSourceReread} from './techsafe-source-reread.mjs';
import {prepareTechsafeTransportSnapshot} from './techsafe-transport-contract.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export const connectionValid=(connection,binding)=>object(connection)&&connection.enabled===true&&connection.status==='active'&&
 connection.connectionId===binding.connectionId&&connection.organizationId===binding.organizationId&&
 connection.proposalId===binding.proposalId&&connection.orderId===binding.orderId;
const epochSeconds=value=>typeof value==='string'&&/^\d{1,12}(?:\.\d{1,6})?$/.test(value)?Number(value):NaN;
export const freshSourceRead=(bundle,nowSeconds,maxAgeSeconds=30)=>{
 const at=epochSeconds(bundle?.readAtEpoch);
 return Number.isFinite(at)&&Number.isFinite(nowSeconds)&&Number.isFinite(maxAgeSeconds)&&
  maxAgeSeconds>0&&nowSeconds-at>=-5&&nowSeconds-at<=maxAgeSeconds;
};
export const sameConnectionGeneration=(before,after)=>
 Number.isSafeInteger(before?.generation)&&before.generation>=1&&
 Number.isSafeInteger(after?.generation)&&after.generation===before.generation;
const held=reason=>({status:'held',reason,delivered:false,quoteReady:false});
export async function dispatchTechsafeDraft({binding,enabled=false,loadConnection,readBundle,readCertifiedAuthority,deliverDraft,nowSeconds=()=>Date.now()/1000}={}){
 // Opt-in must be explicit. Do not touch source, credentials or network when off.
 if(enabled!==true)return held('integration_disabled');
 if(!object(binding)||!['connectionId','organizationId','orderId','proposalId'].every(k=>id(binding[k])))return held('invalid_binding');
 if([loadConnection,readBundle,deliverDraft].some(fn=>typeof fn!=='function'))return held('dispatch_dependencies_unavailable');
 try{
  // Server-only gate. The returned connection must be live, scoped and enabled.
  const connection=await loadConnection(binding);
  if(!connectionValid(connection,binding))
   return held('connection_inactive_or_unverified');
  const bundle=await readBundle(binding);
  const candidate=prepareTechsafeCandidateFromBundle(bundle,binding);
  if(!candidate.valid)return held(candidate.issues[0]?.code??'source_candidate_unverified');
  if(!freshSourceRead(bundle,nowSeconds()))return held('source_read_stale');
  // A second independent statement read detects intervening edits. It does not authorize transport.
  const latest=await readBundle(binding);
  if(!freshSourceRead(latest,nowSeconds()))return held('source_reread_stale');
  const reread=compareTechsafeSourceReread(bundle,latest,binding);
  if(!reread.matches)return held(reread.reason);
  // Pause, revoke, or rebind may occur during two independent source reads.
  // A final connection check is required even for diagnostic readiness.
  const currentConnection=await loadConnection(binding);
  if(!connectionValid(currentConnection,binding)||!sameConnectionGeneration(connection,currentConnection))
   return held('connection_changed_during_source_read');
  if(!freshSourceRead(latest,nowSeconds()))return held('source_reread_stale');
  // No certificate can be synthesized from the candidate, bundle or caller flags.
  // Only a trusted server-side certificate reader can supply authority.
  if(typeof readCertifiedAuthority!=='function')return held('source_transport_authority_not_implemented');
  const certificate=await readCertifiedAuthority(binding,currentConnection);
  if(!object(certificate)||!object(certificate.source)||!object(certificate.authority)||
     !Number.isSafeInteger(certificate.revision)||typeof certificate.eventId!=='string')
   return held('source_transport_authority_unavailable');
  const prepared=prepareTechsafeTransportSnapshot({
   source:certificate.source,authority:certificate.authority,binding,
   revision:certificate.revision,eventId:certificate.eventId});
  if(!prepared.ready)return held(prepared.reason);
  // Recheck connection immediately before network delivery; do not send after
  // pause, revoke, or credential-generation rotation.
  const finalConnection=await loadConnection(binding);
  if(!connectionValid(finalConnection,binding)||
     !sameConnectionGeneration(currentConnection,finalConnection))
   return held('connection_changed_before_delivery');
  const delivery=await deliverDraft({
   binding,sourceRevision:String(certificate.revision),
   content:prepared.snapshot,connection:finalConnection});
  if(!object(delivery)||delivery.accepted!==true)
   return held(delivery?.reason||'receiver_not_confirmed');
  return {status:delivery.materialized===true?'delivered':'acknowledged',
   delivered:delivery.materialized===true,quoteReady:false,
   reason:delivery.reason||'receiver_acknowledged',action:delivery.action||null};
 }catch{
  // Integration outages must not propagate into MJV sales/order operations.
  return held('integration_unavailable');
 }
}
