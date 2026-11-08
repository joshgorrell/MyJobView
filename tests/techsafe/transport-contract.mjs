import assert from 'node:assert/strict';
import {prepareTechsafeTransportSnapshot} from '../../supabase/functions/_shared/techsafe-transport-contract.mjs';
const binding={connectionId:'c',organizationId:'o',orderId:'s',proposalId:'p'};
const source={valid:true,connection_id:'c',organization_id:'o',sales_order_id:'s',approved_proposal_id:'p',equipment:[{cost:999,task_notes:'private'}]};
const snapshot={schemaVersion:2,connectionId:'c',organizationId:'o',orderId:'s',eventId:'e',generation:1,revision:1,complete:true,scopeState:'committed',environment:'sandbox',sourceInstanceId:'mjv',orderStatus:'open',currency:'USD',minimumUnitValueCents:50000,customerRef:'customer',customerName:'Customer',siteRef:'site',lines:[{sourceLineId:'l',scope:'included',productRef:'product',productKind:'equipment',customerSupplied:false,techsafeExcluded:false,quantity:1,unitEquipmentValueCents:60000}]};
const authority={verified:true,sourceAuthorized:true,scopeVerified:true,snapshotReady:true,connectionId:'c',organizationId:'o',orderId:'s',proposalId:'p',generation:1,revision:1,snapshot};
const run=(changes={})=>prepareTechsafeTransportSnapshot({source,authority,binding,revision:1,eventId:'e',...changes});
assert.equal(run().ready,true);
assert.equal(run({authority:{...authority,snapshot:{...snapshot,lines:[{...snapshot.lines[0],scope:'removed'}]}}).ready,true);
assert.equal(run({authority:{...authority,snapshot:{...snapshot,lines:[{...snapshot.lines[0],scope:'excluded'}]}}).ready,false);
assert.equal(JSON.stringify(run().snapshot).includes('private'),false);
assert.equal(JSON.stringify(run().snapshot).includes('cost'),false);
for(const changes of [{authority:{...authority,sourceAuthorized:false}},{authority:{...authority,revision:2}},{source:{...source,approved_proposal_id:'other'}},{authority:{...authority,snapshot:{...snapshot,lines:[{...snapshot.lines[0],cost:999}]}}},{authority:{...authority,snapshot:{...snapshot,scopeState:'pending'}}}])
 assert.equal(run(changes).ready,false);
assert.equal(prepareTechsafeTransportSnapshot({source,binding,revision:1,eventId:'e'}).ready,false);
console.log('Techsafe transport boundary fail-closed tests passed');
