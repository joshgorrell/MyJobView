import assert from 'node:assert/strict';
import {createDenoTechsafeReceiverDelivery} from '../../supabase/functions/_shared/techsafe-receiver-delivery.mjs';
const binding={connectionId:'02e394ef-9576-4a2a-b352-6506b23529d0',
 organizationId:'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',
 orderId:'d8b30c4b-70d0-4180-aca0-907db5a5fa27',
 proposalId:'16089a2a-7b67-48c4-a590-2f2d68c2f928'};
const connection={...binding,enabled:true,status:'active',generation:1};
const original=globalThis.Deno;
try {
 let reads=0,network=0;
 globalThis.Deno={env:{get:name=>{reads++;assert.equal(name,'TECHSAFE_RECEIVER_CREDENTIALS');return undefined;}}};
 const deliver=createDenoTechsafeReceiverDelivery({fetchImpl:async()=>{network++;throw Error('must not deliver');}});
 const result=await deliver({binding,connection,sourceRevision:'1',content:{generation:1}});
 assert.equal(result.accepted,false);
 assert.equal(result.reason,'credentials_unavailable');
 assert.equal(reads,1);
 assert.equal(network,0);
 globalThis.Deno={env:{get:()=>JSON.stringify([{...binding,generation:2,
  endpoint:'https://techsafe.example.com/functions/v1/mjv-import',token:'A'.repeat(48)}])}};
 const stale=await deliver({binding,connection,sourceRevision:'1',content:{generation:1}});
 assert.equal(stale.reason,'credentials_unavailable');
 assert.equal(network,0);
} finally {if(original===undefined)delete globalThis.Deno;else globalThis.Deno=original;}
console.log('PASS: Deno Techsafe delivery uses server secrets and fails closed without network calls');
