import assert from 'node:assert/strict';
import {prepareTechsafeDraftCandidate} from '../../supabase/functions/_shared/techsafe-draft-candidate.mjs';
import {prepareTechsafeCandidateFromBundle} from '../../supabase/functions/_shared/techsafe-bundle-composition.mjs';
import {compareTechsafeSourceReread} from '../../supabase/functions/_shared/techsafe-source-reread.mjs';
// This regression locks the full-mode API through candidate, bundle and reread
// without forging approval history or source authority.
const binding={connectionId:'conn',organizationId:'org',orderId:'order',proposalId:'approved'};
const invalid={currentModel:{organizationId:'org',order:{id:'order',proposal_id:'approved',organization_id:'org',status:'active'}}};
for(const full of [false,true]){
 const candidate=prepareTechsafeDraftCandidate({...invalid,receiverFullSnapshot:full},binding);
 assert.equal(candidate.valid,false);
 assert.equal(candidate.snapshotReady,false);
 const bundle=prepareTechsafeCandidateFromBundle(null,binding,{receiverFullSnapshot:full});
 assert.equal(bundle.valid,false);
 assert.equal(bundle.snapshotReady,false);
 const reread=compareTechsafeSourceReread(null,null,binding,{receiverFullSnapshot:full});
 assert.equal(reread.matches,false);
 assert.equal(reread.snapshotReady,false);
}
console.log('PASS: full receiver mode is explicit and cannot authorize incomplete Sales Order bundles');
