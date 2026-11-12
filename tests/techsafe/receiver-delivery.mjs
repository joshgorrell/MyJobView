import assert from 'node:assert/strict';
import {createTechsafeReceiverDelivery} from '../../supabase/functions/_shared/techsafe-receiver-delivery.mjs';
const binding={connectionId:'connection',organizationId:'org',orderId:'order',proposalId:'proposal'};
const connection={...binding,enabled:true,status:'active',generation:1};
const snapshot={schemaVersion:2,environment:'sandbox',connectionId:'connection',
 sourceInstanceId:'source',organizationId:'org',orderId:'order',eventId:'event1',
 generation:1,revision:1,complete:true,scopeState:'committed',orderStatus:'open',
 currency:'USD',minimumUnitValueCents:25000,soldLaborCents:32500,
 customerRef:'customer',customerName:'Test Customer',siteRef:'site',lines:[
 {sourceLineId:'tv',productRef:'product',productKind:'equipment',scope:'included',
 customerSupplied:false,techsafeExcluded:false,quantity:1,unitEquipmentValueCents:30000}]};
const credentials={connectionId:'connection',organizationId:'org',generation:1,
 endpoint:'https://techsafe.example.com/functions/v1/mjv-import',
 token:'a'.repeat(40)};
let reads=0,calls=0;
const deliver=createTechsafeReceiverDelivery({
 readCredentials:async()=>{reads++;return credentials;},
 fetchImpl:async(url,options)=>{
  calls++;
  assert.equal(url,credentials.endpoint);
  assert.equal(options.headers.Authorization,'Bearer '+credentials.token);
  assert.equal(options.headers['Idempotency-Key'],'connection:order:1');
  assert.equal(JSON.parse(options.body).soldLaborCents,32500);
  return {status:200,json:async()=>({accepted:true,connectionId:'connection',
   orderId:'order',sourceRevision:'1',generation:1,eventId:'event1',
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
