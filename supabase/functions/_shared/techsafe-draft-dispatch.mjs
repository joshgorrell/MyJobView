// Server-side Techsafe draft dispatch boundary. No HTTP, credentials or DB writes
// live here: callers must supply authenticated private reader, connection gate,
// and delivery implementations. Disabled by default; never runs in MJV workflows.
import {prepareTechsafeCandidateFromBundle} from './techsafe-bundle-composition.mjs';
import {compareTechsafeSourceReread} from './techsafe-source-reread.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const held=reason=>({status:'held',reason,delivered:false,quoteReady:false});
export async function dispatchTechsafeDraft({binding,enabled=false,loadConnection,readBundle,deliverDraft}={}){
 // Opt-in must be explicit. Do not touch source, credentials or network when off.
 if(enabled!==true)return held('integration_disabled');
 if(!object(binding)||!['connectionId','organizationId','orderId','proposalId'].every(k=>id(binding[k])))return held('invalid_binding');
 if([loadConnection,readBundle,deliverDraft].some(fn=>typeof fn!=='function'))return held('dispatch_dependencies_unavailable');
 try{
  // Server-only gate. The returned connection must be live, scoped and enabled.
  const connection=await loadConnection(binding);
  if(!object(connection)||connection.enabled!==true||connection.status!=='active'||
   connection.connectionId!==binding.connectionId||connection.organizationId!==binding.organizationId||
   connection.proposalId!==binding.proposalId||connection.orderId!==binding.orderId)
   return held('connection_inactive_or_unverified');
  const bundle=await readBundle(binding);
  const candidate=prepareTechsafeCandidateFromBundle(bundle,binding);
  if(!candidate.valid)return held(candidate.issues[0]?.code??'source_candidate_unverified');
  // A second independent statement read can detect intervening edits before
  // transport authority is built. It is diagnostic, never authorization.
  const latest=await readBundle(binding);
  const reread=compareTechsafeSourceReread(bundle,latest,binding);
  if(!reread.matches)return held(reread.reason);
  // A business candidate is not yet source-authorized: no transport until
  // independent authenticated revision, history, provenance and freshness
  // authority exists. Never infer readiness from bundle/client fields.
  return held('source_transport_authority_not_implemented');
 }catch{
  // Integration outages must not propagate into MJV sales/order operations.
  return held('integration_unavailable');
 }
}
