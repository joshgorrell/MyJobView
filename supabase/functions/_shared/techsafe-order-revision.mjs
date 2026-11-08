// Pure fail-closed state transition contract for a future private, transactional
// per-Sales-Order revision store. This module does not persist revisions, issue
// transport authorization, or enable Techsafe synchronization.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const revision=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
const fingerprint=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const hold=reason=>({accepted:false,reason,next:null,scopeVerified:false,snapshotReady:false,quoteReady:false});
const keys=['connectionId','organizationId','orderId','proposalId'];
export function advanceTechsafeOrderRevision({current,binding,nextFingerprint,connectionGeneration,action}={}){
 if(!object(binding)||!keys.every(k=>id(binding[k]))||!fingerprint(nextFingerprint)||
  !Number.isSafeInteger(connectionGeneration)||connectionGeneration<1||
  !['source_changed','connection_changed','source_unavailable'].includes(action))
  return hold('invalid_revision_transition');
 if(current!==null&&current!==undefined){
  if(!object(current)||!keys.every(k=>current[k]===binding[k])||!revision(current.revision)||
   !Number.isSafeInteger(current.connectionGeneration)||current.connectionGeneration<1||
   !fingerprint(current.fingerprint)||!['held','candidate'].includes(current.status))
   return hold('revision_binding_or_state_invalid');
  if(connectionGeneration<current.connectionGeneration)return hold('stale_connection_generation');
  if(BigInt(current.revision)===9223372036854775807n)return hold('revision_exhausted');
 }
 if(action==='source_changed'&&current&&connectionGeneration===current.connectionGeneration&&
  nextFingerprint===current.fingerprint)return hold('unchanged_source_requires_no_revision');
 // A changed connection generation invalidates old snapshots even when the
 // equipment fingerprint is identical. Missing source always creates a hold.
 if(action==='connection_changed'&&current&&connectionGeneration<=current.connectionGeneration)
  return hold('connection_generation_not_advanced');
 const nextRevision=current?(BigInt(current.revision)+1n).toString():'1';
 return {accepted:true,reason:'revision_transition_candidate',next:{
  ...Object.fromEntries(keys.map(k=>[k,binding[k]])),
  revision:nextRevision,connectionGeneration,fingerprint:nextFingerprint,
  status:action==='source_changed'?'candidate':'held'
 },scopeVerified:false,snapshotReady:false,quoteReady:false};
}
export function isTechsafeRevisionCurrent(stored,expected,binding){
 if(!object(stored)||!object(expected)||!object(binding)||!keys.every(k=>id(binding[k])&&stored[k]===binding[k]&&expected[k]===binding[k]))
  return false;
 return revision(stored.revision)&&stored.revision===expected.revision&&
  fingerprint(stored.fingerprint)&&stored.fingerprint===expected.fingerprint&&
  Number.isSafeInteger(stored.connectionGeneration)&&stored.connectionGeneration>=1&&
  stored.connectionGeneration===expected.connectionGeneration&&stored.status==='candidate';
}
