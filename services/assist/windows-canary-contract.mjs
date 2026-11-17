/** Contract for a future independent Windows desktop/control verifier.
 * No default verifier exists; this module cannot manufacture a passing probe.
 */
import {dealerDomain} from './control-core.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const nonce=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateCanaryRequest(body,{now=Date.now()}={}){
 if(!body||typeof body!=='object'||!uuid.test(body.organization_id)||!Number.isSafeInteger(body.generation)||body.generation<1||
 body.mesh_domain!==dealerDomain(body.organization_id)||!nonce.test(body.probe_nonce)||
 !Number.isSafeInteger(body.probe_requested_at)||Math.abs(now-body.probe_requested_at)>15000||
 typeof body.mesh_id!=='string'||!body.mesh_id.startsWith('mesh/'+body.mesh_domain+'/')||
 typeof body.server_origin!=='string')throw new Error('invalid_canary_request');
 let origin;try{origin=new URL(body.server_origin);}catch{throw new Error('invalid_canary_request');}
 if(origin.protocol!=='https:'||origin.origin!==body.server_origin||origin.username||origin.password)throw new Error('invalid_canary_request');
 return body;
}
export function createWindowsCanaryHandler({verify,now=Date.now}={}){
 if(typeof verify!=='function')throw new Error('independent_windows_verifier_required');
 const used=new Map();
 const replayWindowMs=30000;
 const maxNonces=4096;
 return async body=>{
  const request=validateCanaryRequest(body,{now:now()});
  // Retain nonces after completion (including failure): a completed probe must
  // not be replayable while its timestamp is still within the accepted window.
  for(const [key,expires] of used)if(expires<=now())used.delete(key);
  if(used.has(request.probe_nonce))throw new Error('duplicate_probe');
  if(used.size>=maxNonces)throw new Error('canary_busy');
  used.set(request.probe_nonce,now()+replayWindowMs);
  try{
   // The verifier must operate real Windows endpoints and produce independent
   // observations. It must not derive success from request flags or mocks.
   const proof=await verify(request);
   if(!proof||proof.organization_id!==request.organization_id||proof.generation!==request.generation||
    proof.probe_nonce!==request.probe_nonce||proof.mesh_domain!==request.mesh_domain||
    proof.desktop_control!==true||proof.consent_enforced!==true||proof.cross_tenant_denied!==true||
    !Number.isSafeInteger(proof.checked_at)||proof.checked_at<request.probe_requested_at||
    proof.checked_at>now()+5000||proof.windows_host_verified!==true||
    proof.actual_input_observed!==true||proof.denied_consent_observed!==true||
    proof.second_dealer_denied_observed!==true)throw new Error('canary_proof_rejected');
   return {organization_id:request.organization_id,generation:request.generation,probe_nonce:request.probe_nonce,
    checked_at:proof.checked_at,desktop_control:true,consent_enforced:true,cross_tenant_denied:true};
  }finally{
   // Never release the nonce early, even when verification fails.
  }
 };
}
