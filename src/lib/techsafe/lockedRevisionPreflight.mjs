// Server-only, non-authorizing Sales Order revision preflight.
// Uses the existing PostgreSQL locked revision reader. Never returns transport authority.
import {createLockedRevisionReader} from './postgresLockedRevisionReader.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const held=reason=>Object.freeze({ok:false,authorized:false,snapshotReady:false,reason});
const same=(a,b)=>a.organizationId===b.organizationId&&a.proposalId===b.proposalId&&
 a.connectionGeneration===b.connectionGeneration&&a.revision===b.revision&&
 a.sourceFingerprint===b.sourceFingerprint;
export async function inspectLockedTechsafeRevision({client,connectionId,orderId,organizationId,proposalId,inspectSource}={}){
 if(![connectionId,orderId,organizationId,proposalId].every(uuid))return held('invalid_binding');
 if(!client||typeof client.query!=='function'||typeof inspectSource!=='function')
  return held('trusted_dependencies_missing');
 try{
  // Caller must own a SERIALIZABLE transaction; this helper does not start or commit one.
  const isolation=await client.query('SHOW transaction_isolation');
  if(isolation?.rows?.length!==1||isolation.rows[0]?.transaction_isolation!=='serializable')
   return held('serializable_isolation_required');
  const reader=createLockedRevisionReader(client);
  const before=await reader({connectionId,orderId});
  if(before.organizationId!==organizationId||before.proposalId!==proposalId)
   return held('source_scope_mismatch');
  // The source inspector is trusted server code; its result is never sufficient
  // to authorize network delivery or a Techsafe purchase.
  const inspected=await inspectSource({client,connectionId,orderId,organizationId,proposalId});
  if(!inspected||inspected.ok!==true||inspected.authorized!==false||
     inspected.snapshotReady!==false)return held('source_inspection_unverified');
  const after=await reader({connectionId,orderId});
  if(!same(before,after))return held('source_revision_changed');
  return Object.freeze({ok:true,authorized:false,snapshotReady:false,
   reason:'revision_consistent_diagnostic_only',revision:after.revision,
   connectionGeneration:after.connectionGeneration,sourceFingerprint:after.sourceFingerprint});
 }catch{return held('source_revision_preflight_failed');}
}
