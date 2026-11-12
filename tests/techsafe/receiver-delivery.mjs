import assert from 'node:assert/strict';
import {createTechsafeReceiverDelivery} from '../../supabase/functions/_shared/techsafe-receiver-delivery.mjs';
const binding={connectionId:'02e394ef-9576-4a2a-b352-6506b23529d0',organizationId:'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',orderId:'d8b30c4b-70d0-4180-aca0-907db5a5fa27',proposalId:'16089a2a-7b67-48c4-a590-2f2d68c2f928'};
const connection={...binding,enabled:true,status:'active',generation:1};
const snapshot={schemaVersion:2,environment:'sandbox',connectionId:'02e394ef-9576-4a2a-b352-6506b23529d0',
 sourceInstanceId:'source',organizationId:'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',orderId:'d8b30c4b-70d0-4180-aca0-907db5a5fa27',eventId:'event1',
 generation:1,revision:1,complete:true,scopeState:'committed',orderStatus:'open',
 currency:'USD',minimumUnitValueCents:25000,soldLaborCents:32500,
 customerRef:'customer',customerName:'Test Customer',siteRef:'site',lines:[
 {sourceLineId:'tv',productRef:'product',productKind:'equipment',scope:'included',
 customerSupplied:false,techsafeExcluded:false,quantity:1,unitEquipmentValueCents:30000}]};
const credentials={connectionId:'02e394ef-9576-4a2a-b352-6506b23529d0',organizationId:'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',generation:1,
 endpoint:'https://techsafe.example.com/functions/v1/mjv-import',
 token:'a'.repeat(48)};
let reads=0,calls=0;
const deliver=createTechsafeReceiverDelivery({
 readCredentials:async()=>{reads++;return credentials;},
 fetchImpl:async(url,options)=>{
  calls++;
  assert.equal(url,credentials.endpoint);
  assert.equal(options.headers.Authorization,'Bearer '+credentials.token);
  assert.equal(options.headers['Idempotency-Key'],'02e394ef-9576-4a2a-b352-6506b23529d0:d8b30c4b-70d0-4180-aca0-907db5a5fa27:1');
  assert.equal(JSON.parse(options.body).soldLaborCents,32500);
  return {status:200,json:async()=>({accepted:true,connectionId:'02e394ef-9576-4a2a-b352-6506b23529d0',
   orderId:'d8b30c4b-70d0-4180-aca0-907db5a5fa27',sourceRevision:'1',generation:1,eventId:'event1',
   action:'created',proposalId:'draft1'})};
 }});
const payload={binding,connection,sourceRevision:'1',content:snapshot};
const success=await deliver(payload);
assert.equal(success.accepted,true);assert.equal(success.materialized,true);
assert.equal(reads,1);assert.equal(calls,1);
for(const bad of [
 {...payload,connection:{...connection,enabled:false}},
 {...payload,connection:{...connection,generation:2}},
 {...payload,connection:{...connection,organizationId:'other'}},
 {...payload,content:{...snapshot,generation:2}}
]){
 const result=await deliver(bad);
 assert.equal(result.accepted,false);
}
assert.equal(reads,1);assert.equal(calls,1);
const badCredentials=createTechsafeReceiverDelivery({readCredentials:async()=>({...credentials,generation:2}),
 fetchImpl:async()=>{throw Error('must not call receiver')}});
assert.equal((await badCredentials(payload)).reason,'credentials_unavailable');
const broken=createTechsafeReceiverDelivery({readCredentials:async()=>{throw Error('private vault offline')}});
assert.equal((await broken(payload)).reason,'credentials_unavailable');
console.log('PASS: certified sender adapter sends exact snapshot, validates private credentials and holds on rotation');
