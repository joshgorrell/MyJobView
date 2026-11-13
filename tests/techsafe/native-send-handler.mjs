import assert from 'node:assert/strict';
import {createNativeTechsafeSendHandler} from '../../supabase/functions/_shared/techsafe-native-send-handler.mjs';
const ids=Array.from({length:5},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const [userId,organizationId,connectionId,orderId,otherOrg]=ids;
const request=(body={connectionId,orderId})=>new Request('https://mjv.example/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
let sends=0,reads=0;
const defaults={enabled:true,authenticateAdmin:async()=>({verified:true,userId,organizationId,role:'admin'}),
 readConnectionOrganization:async()=>{reads++;return organizationId;},sendOrder:async()=>{sends++;return {accepted:true,sourceRevision:'1',snapshot:{private:'must not escape'},token:'private'};}};
assert.equal((await createNativeTechsafeSendHandler()(request())).status,503);
for(const identity of [null,{verified:true,userId,organizationId,role:'sales'},{verified:true,userId,organizationId:null,role:'admin'}]){
 assert.equal((await createNativeTechsafeSendHandler({...defaults,authenticateAdmin:async()=>identity})(request())).status,403);
}
assert.equal(reads,0);assert.equal(sends,0);
assert.equal((await createNativeTechsafeSendHandler({...defaults,readConnectionOrganization:async()=>otherOrg})(request())).status,404);
assert.equal(sends,0);
for(const body of [{connectionId,orderId,token:'forged'},{connectionId,orderId,enabled:true},{connectionId,orderId,certificate:{}},{connectionId:'bad',orderId}])
 assert.equal((await createNativeTechsafeSendHandler(defaults)(request(body))).status,400);
const oversized=new Request('https://mjv.example/send',{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(4097)});
assert.equal((await createNativeTechsafeSendHandler(defaults)(oversized)).status,400);
const response=await createNativeTechsafeSendHandler(defaults)(request());
assert.equal(response.status,200);assert.deepEqual(await response.json(),{accepted:true,reason:'receiver_acknowledged',sourceRevision:'1'});assert.equal(sends,1);
const error=await createNativeTechsafeSendHandler({...defaults,sendOrder:async()=>{throw Error('secret connection string');}})(request());
assert.deepEqual(await error.json(),{accepted:false,reason:'delivery_not_confirmed'});
console.log('PASS: native sender endpoint enforces admin/tenant scope, bounded identity-only input, disabled configuration and secret-free responses');
