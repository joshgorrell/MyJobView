import assert from 'node:assert/strict';
import {createTechsafeEnvironmentSecretReader} from '../../supabase/functions/_shared/techsafe-environment-secret-reader.mjs';
import {createPrivateTechsafeCredentialReader} from '../../supabase/functions/_shared/techsafe-private-receiver-credentials.mjs';
const binding={connectionId:'02e394ef-9576-4a2a-b352-6506b23529d0',
 organizationId:'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15',generation:1};
const record={...binding,endpoint:'https://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import',token:'Z'.repeat(48)};
const reader=raw=>createTechsafeEnvironmentSecretReader({getEnv:()=>raw});
const good=createPrivateTechsafeCredentialReader({readSecret:reader(JSON.stringify([record]))});
assert.equal((await good(binding)).ok,true);
for(const raw of [undefined,'not json','{}','[]',JSON.stringify([record,record]),
 JSON.stringify([{...record,generation:2}]),JSON.stringify([{...record,organizationId:'11111111-1111-1111-1111-111111111111'}]),
 JSON.stringify([{...record,token:null}])]){
 const privateReader=createPrivateTechsafeCredentialReader({readSecret:reader(raw)});
 assert.equal((await privateReader(binding)).ok,false);
}
console.log('PASS: private Techsafe Edge Function secret reader rejects missing, malformed, duplicate, stale and foreign credentials');
