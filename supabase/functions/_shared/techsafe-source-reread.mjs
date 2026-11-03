// Inactive comparison of two independently collected private source bundles.
// A match is diagnostic only: hashes are not signatures, revisions or checkout locks.
import {prepareTechsafeCandidateFromBundle} from './techsafe-bundle-composition.mjs';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function compareTechsafeSourceReread(first,latest,binding){
 const held=reason=>({matches:false,reason,content:null,scopeVerified:false,snapshotReady:false,quoteReady:false});
 if(!first||!latest||typeof first!=='object'||typeof latest!=='object')return held('source_reread_unavailable');
 const initial=prepareTechsafeCandidateFromBundle(first,binding);
 if(!initial.valid)return held('initial_source_unverified');
 const current=prepareTechsafeCandidateFromBundle(latest,binding);
 if(!current.valid)return held('latest_source_unverified');
 if(first.inputFingerprint!==latest.inputFingerprint)return held('source_input_changed');
 if(!equal(initial.content,current.content))return held('source_candidate_changed');
 // Never issue transport authority from an equal reread; a concurrent write
 // after this check, missed history, or pause/resume still requires a trusted
 // monotonic revision and final server-side freshness protocol.
 return {matches:true,reason:'diagnostic_reread_match',content:null,
  scopeVerified:false,snapshotReady:false,quoteReady:false};
}
