// Private diagnostic coordinator. Uses the existing approved Sales Order reader
// and current-equipment fingerprint; does NOT create a source certificate,
// monotonic revision, dispatch authority, or send any customer data.
import {createLiveSalesOrderPreflight} from './techsafe-live-sales-order-preflight.mjs';
import {fingerprintCurrentSalesOrder} from './techsafe-current-order-fingerprint.mjs';
const held=(reason)=>({ready:false,reason,fingerprint:null,changed:null});
export function createTechsafeOrderChangeInspection({client,digest,loadPersistedFingerprint}={}){
 if(!client||typeof client.query!=='function'||typeof digest!=='function'||
  typeof loadPersistedFingerprint!=='function')throw new TypeError('private_inspection_dependencies_required');
 const preflight=createLiveSalesOrderPreflight(client);
 return async function inspect({connectionId,orderId}={}){
  const observed=await preflight({connectionId,orderId});
  // The preflight deliberately never asserts readiness. Its one diagnostic
  // result is the only permitted input to this inspection.
  if(observed.reason!=='source_certificate_and_revision_required'||!observed.source)
   return held(observed.reason);
  const current=await fingerprintCurrentSalesOrder(observed.source,digest);
  if(!current.valid)return held(current.reason);
  let previous;
  try{previous=await loadPersistedFingerprint({connectionId,orderId,
   organizationId:observed.source.binding.organization_id,
   proposalId:observed.source.binding.proposal_id,
   generation:Number(observed.source.binding.connection_generation)});}catch{return held('persisted_revision_unavailable');}
  // A missing ledger is not equivalent to a first authorized delivery. It
  // requires enrollment and an independently approved baseline.
  if(previous===null||previous===undefined)return held('revision_baseline_not_enrolled');
  if(typeof previous!=='string'||!/^[a-f0-9]{64}$/.test(previous))return held('persisted_revision_invalid');
  return {ready:false,reason:'source_certificate_and_revision_required',
   fingerprint:current.fingerprint,changed:previous!==current.fingerprint};
 };
}
