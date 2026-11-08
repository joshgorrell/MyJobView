import assert from 'node:assert/strict';
import {dispatchTechsafeDraft,connectionValid,freshSourceRead,sameConnectionGeneration} from '../../supabase/functions/_shared/techsafe-draft-dispatch.mjs';
const binding={connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'};
let called=0;
const deps={binding,loadConnection:async()=>{called++;return {enabled:true,status:'active',connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'};},readBundle:async()=>{called++;return null;},deliverDraft:async()=>{called++;throw Error('Never deliver without authority');}};
assert.equal((await dispatchTechsafeDraft(deps)).reason,'integration_disabled');
assert.equal(called,0,'Disabled integration must do no reads or writes');
assert.equal((await dispatchTechsafeDraft({...deps,enabled:true,loadConnection:async()=>({enabled:false,status:'active',connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'})})).reason,'connection_inactive_or_unverified');
assert.equal(called,0,'Inactive connection must not read source');
assert.equal((await dispatchTechsafeDraft({...deps,enabled:true,loadConnection:async()=>{throw Error('offline')}})).reason,'integration_unavailable');
assert.equal((await dispatchTechsafeDraft({...deps,enabled:true})).reason,'source_bundle_unavailable');
assert.equal(called,2,'Only the private connection and bundle reads may execute');
assert.equal((await dispatchTechsafeDraft({...deps,enabled:true,loadConnection:async()=>({enabled:true,status:'active',connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'unapproved'})})).reason,'connection_inactive_or_unverified');
assert.equal(called,2,'Wrong approved proposal must not read any source bundle');
assert.equal((await dispatchTechsafeDraft({...deps,enabled:true,binding:{...binding,organizationId:'another'}})).reason,'connection_inactive_or_unverified');
console.log('Techsafe dispatch boundary holds disabled, inactive, invalid and unavailable integrations; never delivers');

const validConnection={enabled:true,status:'active',connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'};
assert.equal(connectionValid(validConnection,binding),true);
for(const invalid of [
 {...validConnection,enabled:false}, {...validConnection,status:'paused'},
 {...validConnection,orderId:'another-order'}, {...validConnection,proposalId:'another-proposal'},
 {...validConnection,organizationId:'another-org'}, {...validConnection,connectionId:'another-connection'},null
])assert.equal(connectionValid(invalid,binding),false,'Connection pause/revoke/rebind must fail closed');

const now=1793448000;
assert.equal(freshSourceRead({readAtEpoch:String(now)},now),true);
assert.equal(freshSourceRead({readAtEpoch:String(now-30)},now),true);
assert.equal(freshSourceRead({readAtEpoch:String(now-31)},now),false);
assert.equal(freshSourceRead({readAtEpoch:String(now+6)},now),false);
assert.equal(freshSourceRead({readAtEpoch:'invalid'},now),false);
assert.equal(sameConnectionGeneration({generation:1},{generation:1}),true);
assert.equal(sameConnectionGeneration({generation:1},{generation:2}),false);
assert.equal(sameConnectionGeneration({generation:1},{generation:0}),false);
assert.equal(sameConnectionGeneration({},{generation:1}),false);
assert.equal(sameConnectionGeneration({generation:1},{}),false);
