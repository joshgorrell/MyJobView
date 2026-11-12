import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateTechsafeCredentialReader} from '../../supabase/functions/_shared/techsafe-private-receiver-credentials.mjs';
const binding={connectionId:'02e394ef-9576-4a2a-b352-6506b23529d0',organizationId:'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',generation:1};
const valid={...binding,endpoint:'https://example.supabase.co/functions/v1/mjv-import',token:'A'.repeat(48)};
test('accepts correctly bound private receiver credentials',async()=>{
 const read=createPrivateTechsafeCredentialReader({readSecret:async()=>valid});
 assert.deepEqual(await read(binding),{ok:true,...valid});
});
test('rejects stale generation, foreign organization and missing token',async()=>{
 for(const override of [{generation:2},{organizationId:'11111111-1111-1111-1111-111111111111'},{token:undefined}]){
  const read=createPrivateTechsafeCredentialReader({readSecret:async()=>({...valid,...override})});
  assert.equal((await read(binding)).ok,false);
 }
});
test('rejects insecure or unrelated destinations',async()=>{
 for(const endpoint of ['http://example.com/functions/v1/mjv-import','https://example.com/other','https://u:p@example.com/functions/v1/mjv-import','https://example.com/functions/v1/mjv-import?token=x']){
  const read=createPrivateTechsafeCredentialReader({readSecret:async()=>({...valid,endpoint})});
  assert.equal((await read(binding)).ok,false);
 }
});
test('fails closed without exposing private secret errors',async()=>{
 const read=createPrivateTechsafeCredentialReader({readSecret:async()=>{throw Error('secret token leaked')}});
 assert.deepEqual(await read(binding),{ok:false,reason:'private_credentials_unavailable'});
});
