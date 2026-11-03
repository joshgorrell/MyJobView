// Inactive boundary for private, statement-consistent source bundles.
// This is NOT an authenticated sender or authorization to sync/checkout.
import {prepareTechsafeDraftCandidate} from './techsafe-draft-candidate.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const epoch=v=>typeof v==='string'&&/^\d{1,12}(?:\.\d{1,6})?$/.test(v);
export function prepareTechsafeCandidateFromBundle(bundle,binding){
 const held=code=>({valid:false,content:null,excluded:[],issues:[{code}],
  equipmentMembershipResolved:false,scopeVerified:false,snapshotReady:false,quoteReady:false});
 if(!object(bundle)||bundle.bundleVersion!==1||!digest(bundle.inputFingerprint)
  ||!epoch(bundle.readAtEpoch)||!object(bundle.currentModel)||!object(bundle.basis)
  ||!Array.isArray(bundle.pairs)||bundle.pairs.length>1000)
  return held('source_bundle_unavailable');
 // Never accept readiness/authorization flags supplied in a bundle.
 if(['scopeVerified','snapshotReady','quoteReady','authorized','eventId','revision'].some(k=>Object.hasOwn(bundle,k)))
  return held('source_bundle_authority_unverified');
 const candidate=prepareTechsafeDraftCandidate({
  currentModel:bundle.currentModel,basis:bundle.basis,pairs:bundle.pairs
 },binding);
 // Fingerprint is diagnostic, not an authorization signature. No transport,
 // persistence, activation or authoritative revision is produced here.
 return candidate;
}
