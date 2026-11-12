// Inactive boundary for private, statement-consistent source bundles.
// This is NOT an authenticated sender or authorization to sync/checkout.
import {prepareTechsafeDraftCandidate} from './techsafe-draft-candidate.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const epoch=v=>typeof v==='string'&&/^\d{1,12}(?:\.\d{1,6})?$/.test(v);
export function prepareTechsafeCandidateFromBundle(bundle,binding,{receiverFullSnapshot=false}={}){
 const held=code=>({valid:false,content:null,excluded:[],issues:[{code}],
  equipmentMembershipResolved:false,scopeVerified:false,snapshotReady:false,quoteReady:false});
 if(!object(bundle)||bundle.bundleVersion!==1||!digest(bundle.inputFingerprint)
  ||!epoch(bundle.readAtEpoch)||!object(bundle.currentModel)||!object(bundle.basis)
  ||!Array.isArray(bundle.pairs)||bundle.pairs.length>1000)
  return held('source_bundle_unavailable');
 // Never accept readiness/authorization flags supplied in a bundle.
 if(['scopeVerified','snapshotReady','quoteReady'].some(k=>Object.hasOwn(bundle,k)&&bundle[k]!==false)||
  ['authorized','eventId','revision'].some(k=>Object.hasOwn(bundle,k)))
  return held('source_bundle_authority_unverified');
 // Require a single trusted connection/order/proposal identity across all
 // bundle layers before passing any data to the candidate composer.
 const keys=['connectionId','organizationId','orderId','proposalId'];
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
 if(!object(binding)||!keys.every(k=>id(binding[k]))||
  !object(bundle.basis.binding)||!keys.every(k=>bundle.basis.binding[k]===binding[k])||
  bundle.currentModel.connectionId!==binding.connectionId||
  bundle.currentModel.organizationId!==binding.organizationId||
  !object(bundle.currentModel.order)||
  bundle.currentModel.order.id!==binding.orderId||
  bundle.currentModel.order.proposal_id!==binding.proposalId||
  bundle.currentModel.order.organization_id!==binding.organizationId)
  return held('source_bundle_binding_mismatch');
 const candidate=prepareTechsafeDraftCandidate({
  currentModel:bundle.currentModel,basis:bundle.basis,pairs:bundle.pairs,
  receiverFullSnapshot:receiverFullSnapshot===true
 },binding);
 // Fingerprint is diagnostic, not an authorization signature. No transport,
 // persistence, activation or authoritative revision is produced here.
 return candidate;
}
