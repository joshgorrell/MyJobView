import assert from 'node:assert/strict';
import {sendTechsafeV2Snapshot} from '../../supabase/functions/_shared/techsafe-v2-snapshot-http.mjs';
const binding={connectionId:'c',organizationId:'o',orderId:'s',proposalId:'p'};
const source={valid:true,connection_id:'c',organization_id:'o',sales_order_id:'s',approved_proposal_id:'p',equipment:[],privateNotes:'DO NOT SEND'};
const snapshot={schemaVersion:2,connectionId:'c',organizationId:'o',orderId:'s',eventId:'e',generation:1,revision:1,complete:true,scopeState:'committed',environment:'sandbox',sourceInstanceId:'mjv',orderStatus:'open',currency:'USD',minimumUnitValueCents:0,customerRef:'customer',customerName:'Customer',siteRef:'site',lines:[]};
const authority={verified:true,sourceAuthorized:true,scopeVerified:true,snapshotReady:true,connectionId:'c',organizationId:'o',orderId:'s',proposalId:'p',generation:1,revision:1,snapshot};
const base={endpoint:'https://techsafe.example/import',token:'x'.repeat(40),binding,source,authority,revision:1,eventId:'e',enabled:true,allowedOrigin:'https://techsafe.example'};
let calls=0;
const fetchImpl=async(url,init)=>{calls++;assert.equal(url,base.endpoint);assert.equal(init.redirect,'error');assert.equal(init.headers['Idempotency-Key'],'c:s:1');assert.equal(JSON.parse(init.body).privateNotes,undefined);return {status:200,json:async()=>({accepted:true,connectionId:'c',orderId:'s',sourceRevision:'1',eventId:'e',generation:1})};};
assert.equal((await sendTechsafeV2Snapshot({...base,fetchImpl})).accepted,true);
for(const changes of [{enabled:false},{authority:{...authority,sourceAuthorized:false}},{source:{...source,approved_proposal_id:'wrong'}},{endpoint:'http://techsafe.example/import'},{allowedOrigin:undefined},{allowedOrigin:'https://techsafe.example.evil'},{endpoint:'https://techsafe.example.evil/import'},{token:'short'},{revision:2}]){
 assert.equal((await sendTechsafeV2Snapshot({...base,...changes,fetchImpl})).accepted,false);
}
assert.equal(calls,1);
assert.equal((await sendTechsafeV2Snapshot({...base,fetchImpl:async()=>({status:200,json:async()=>({accepted:true,connectionId:'c',orderId:'s',sourceRevision:'1'})})})).accepted,false);
assert.equal((await sendTechsafeV2Snapshot({...base,fetchImpl:async()=>({status:409})})).accepted,false);
console.log('Techsafe v2 authorized snapshot HTTP tests passed');
