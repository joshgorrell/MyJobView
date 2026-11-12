import assert from 'node:assert/strict';
import {sendTechsafeDraft} from '../../supabase/functions/_shared/techsafe-draft-http-transport.mjs';
const binding={connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'};
const content={schemaVersion:2,connectionId:'connection',organizationId:'org',orderId:'order',generation:1,revision:7,complete:true,scopeState:'committed',environment:'sandbox',eventId:'event',sourceInstanceId:'mjv',lines:[{sourceLineId:'line',scope:'included',quantity:1,unitEquipmentValueCents:25000,customerSupplied:false,techsafeExcluded:false}]};
const base={endpoint:'https://techsafe.example/api/drafts',token:'x'.repeat(40),binding,sourceRevision:'7',content};
let calls=0;
const fake=async(url,init)=>{calls++;assert.equal(url,base.endpoint);assert.equal(init.method,'POST');assert.equal(init.headers.Authorization,'Bearer '+base.token);assert.equal(init.headers['Idempotency-Key'],'connection:order:7');assert.equal(init.redirect,'error');assert.deepEqual(JSON.parse(init.body),content,'Techsafe expects root-level v2 snapshot');return {status:200,json:async()=>({accepted:true,connectionId:'connection',orderId:'order',sourceRevision:'7',generation:1,eventId:'event',action:'created',proposalId:'draft'})};};
assert.equal((await sendTechsafeDraft({...base,fetchImpl:fake})).accepted,true);
for(const change of [{endpoint:'http://techsafe.example/api/drafts'},{endpoint:'https://techsafe.example/api/drafts?secret=1'},{token:'short'},{sourceRevision:'0'},{content:{...content,organizationId:'other'}},{content:{...content,revision:8}},{content:{...content,connectionId:'other'}},{content:{...content,lines:[content.lines[0],content.lines[0]]}},{endpoint:'https://localhost/api/drafts'},{endpoint:'https://127.0.0.1/api/drafts'},{endpoint:'https://[::1]/api/drafts'}]){
 assert.equal((await sendTechsafeDraft({...base,...change,fetchImpl:fake})).accepted,false);
}
assert.equal(calls,1,'Invalid payloads and endpoints must not send HTTP');
assert.equal((await sendTechsafeDraft({...base,fetchImpl:async()=>({status:200,json:async()=>({accepted:true,connectionId:'connection',orderId:'order',sourceRevision:'6',generation:1,eventId:'event',action:'created',proposalId:'draft'})})})).reason,'receiver_receipt_unverified');
assert.equal((await sendTechsafeDraft({...base,fetchImpl:async()=>({status:409})})).reason,'receiver_not_confirmed');
assert.equal((await sendTechsafeDraft({...base,fetchImpl:async()=>{throw Error('network')}})).reason,'transport_failed');
const duplicate=await sendTechsafeDraft({...base,fetchImpl:async()=>({status:200,json:async()=>({accepted:true,connectionId:'connection',orderId:'order',sourceRevision:'7',generation:1,eventId:'event',action:'duplicate'})})});
assert.equal(duplicate.accepted,true);
assert.equal(duplicate.action,'duplicate');
assert.equal(duplicate.proposalId,null);
const mismatched=await sendTechsafeDraft({...base,fetchImpl:async()=>({status:200,json:async()=>({accepted:true,connectionId:'connection',orderId:'order',sourceRevision:'7',generation:2,eventId:'event',action:'created',proposalId:'draft'})})});
assert.equal(mismatched.reason,'receiver_receipt_unverified');
console.log('Techsafe authenticated full-v2 receiver contract safeguards passed');
