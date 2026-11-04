// Inactive comparison of two independently collected private source bundles.
// A match is diagnostic only: hashes are not signatures, revisions or checkout locks.
import {prepareTechsafeCandidateFromBundle} from './techsafe-bundle-composition.mjs';
// SQL jsonb and JS object construction do not promise identical key order.
// Compare content structurally, while preserving array order (equipment lines).
const canonical=value=>{
 if(Array.isArray(value))return value.map(canonical);
 if(value!==null&&typeof value==='object'){
  const result={};
  for(const key of Object.keys(value).sort())result[key]=canonical(value[key]);
  return result;
 }
 return value;
};
export const techsafeContentEqual=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function compareTechsafeSourceReread(first,latest,binding){
 const held=reason=>({matches:false,reason,content:null,scopeVerified:false,snapshotReady:false,quoteReady:false});
 if(!first||!latest||typeof first!=='object'||typeof latest!=='object')return held('source_reread_unavailable');
 const initial=prepareTechsafeCandidateFromBundle(first,binding);
 if(!initial.valid)return held('initial_source_unverified');
 const current=prepareTechsafeCandidateFromBundle(latest,binding);
 if(!current.valid)return held('latest_source_unverified');
 if(first.inputFingerprint!==latest.inputFingerprint)return held('source_input_changed');
 if(!techsafeContentEqual(initial.content,current.content))return held('source_candidate_changed');
 // Never issue transport authority from an equal reread; a concurrent write
 // after this check, missed history, or pause/resume still requires a trusted
 // monotonic revision and final server-side freshness protocol.
 return {matches:true,reason:'diagnostic_reread_match',content:null,
  scopeVerified:false,snapshotReady:false,quoteReady:false};
}
