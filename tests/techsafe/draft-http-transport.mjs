import assert from 'node:assert/strict';
import {sendTechsafeDraft} from '../../supabase/functions/_shared/techsafe-draft-http-transport.mjs';
const binding={connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'};
const content={schemaVersion:2,organizationId:'org',orderId:'order',lines:[{sourceLineId:'line'}]};
const base={endpoint:'https://techsafe.example/api/drafts',token:'x'.repeat(40),binding,sourceRevision:'7',content};
let calls=0;
const fake=async(url,init)=>{calls++;assert.equal(url,base.endpoint);assert.equal(init.method,'POST');assert.equal(init.headers.Authorization,'Bearer '+base.token);assert.equal(init.headers['Idempotency-Key'],'connection:order:7');assert.equal(init.redirect,'error');return {status:200,json:async()=>({accepted:true,connectionId:'connection',orderId:'order',sourceRevision:'7',draftId:'draft'})};};
assert.equal((await sendTechsafeDraft({...base,fetchImpl:fake})).accepted,true);
for(const change of [{endpoint:'http://techsafe.example/api/drafts'},{endpoint:'https://techsafe.example/api/drafts?secret=1'},{token:'short'},{sourceRevision:'0'},{content:{...content,organizationId:'other'}},{content:{...content,lines:[]}}]){
 assert.equal((await sendTechsafeDraft({...base,...change,fetchImpl:fake})).accepted,false);
}
assert.equal(calls,1,'Invalid payloads must not send HTTP');
assert.equal((await sendTechsafeDraft({...base,fetchImpl:async()=>({status:200,json:async()=>({accepted:true,connectionId:'connection',orderId:'order',sourceRevision:'6',draftId:'draft'})})})).reason,'receiver_receipt_unverified');
assert.equal((await sendTechsafeDraft({...base,fetchImpl:async()=>({status:409})})).reason,'receiver_not_confirmed');
assert.equal((await sendTechsafeDraft({...base,fetchImpl:async()=>{throw Error('network')}})).reason,'transport_failed');
console.log('Techsafe authenticated draft transport adapter safeguards passed');
