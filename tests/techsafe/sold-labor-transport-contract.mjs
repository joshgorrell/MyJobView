import assert from 'node:assert/strict';
import {prepareTechsafeTransportSnapshot} from '../../supabase/functions/_shared/techsafe-transport-contract.mjs';
const binding={connectionId:'connection1',organizationId:'org1',orderId:'order1',proposalId:'proposal1'};
const snapshot={schemaVersion:2,environment:'sandbox',connectionId:'connection1',sourceInstanceId:'source1',organizationId:'org1',orderId:'order1',eventId:'event1',generation:1,revision:1,complete:true,scopeState:'committed',orderStatus:'open',currency:'USD',minimumUnitValueCents:25000,soldLaborCents:32500,customerRef:'customer1',customerName:'Test Customer',siteRef:'site1',lines:[]};
const source={valid:true,sales_order_id:'order1',approved_proposal_id:'proposal1',organization_id:'org1',connection_id:'connection1',equipment:[]};
const authority={verified:true,sourceAuthorized:true,scopeVerified:true,snapshotReady:true,connectionId:'connection1',organizationId:'org1',orderId:'order1',proposalId:'proposal1',generation:1,revision:1,snapshot};
const ok=prepareTechsafeTransportSnapshot({source,authority,binding,revision:1,eventId:'event1'});
assert.equal(ok.ready,true);assert.equal(ok.snapshot.soldLaborCents,32500);
for(const value of [-1,NaN,Infinity,1.5,'32500',null,Number.MAX_SAFE_INTEGER+1]){
 const changed={...snapshot,soldLaborCents:value};
 assert.equal(prepareTechsafeTransportSnapshot({source,authority:{...authority,snapshot:changed},binding,revision:1,eventId:'event1'}).ready,false);
}
assert.equal(prepareTechsafeTransportSnapshot({source,authority:{...authority,snapshot:{...snapshot,soldLaborCents:0}},binding,revision:1,eventId:'event1'}).ready,true);
console.log('PASS: MJV source contract passes explicit sold labor and rejects invalid amounts');
