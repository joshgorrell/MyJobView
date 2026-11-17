import assert from 'node:assert/strict';
import {assessStagingConfiguration,checkStagingPaths} from '../../services/assist/staging-preflight.mjs';
const env={SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'service-secret',ASSIST_CONTROL_ORIGIN:'https://control.example.test',ASSIST_CONTROL_TOKEN:'a'.repeat(40),ASSIST_PUBLIC_ORIGIN:'https://assist.example.test',ASSIST_CANARY_ORIGIN:'https://canary.example.test',ASSIST_CANARY_TOKEN:'b'.repeat(40),ASSIST_AGENT_CACHE_DIRECTORY:'/tmp/assist-cache',ASSIST_APPROVED_MESHCENTRAL_VERSION:'1.3.1'};
const good=assessStagingConfiguration(env);
assert.equal(good.status,'CONFIG_READY_FOR_STAGING_REVIEW');
assert.equal(good.production_approved,false);
for(const change of [{ASSIST_GUEST_PILOT_APPROVED:'1'},{ASSIST_ARM64_PILOT_APPROVED:'1'},{ASSIST_CANARY_TOKEN:env.ASSIST_CONTROL_TOKEN},{ASSIST_PUBLIC_ORIGIN:'http://assist.example.test'},{ASSIST_CANARY_ORIGIN:env.ASSIST_PUBLIC_ORIGIN},{ASSIST_AGENT_CACHE_DIRECTORY:'relative/cache'},{ASSIST_APPROVED_MESHCENTRAL_VERSION:'1.3.2'}]){
 assert.equal(assessStagingConfiguration({...env,...change}).status,'BLOCKED');
}
const paths=await checkStagingPaths(env,async()=>({isDirectory:()=>true}));
assert.equal(paths.length,2);assert(paths.every(x=>x.pass));
const failed=await checkStagingPaths(env,async()=>{throw new Error('not found');});
assert(failed.every(x=>!x.pass));
assert(!JSON.stringify(good).includes(env.ASSIST_CONTROL_TOKEN));
console.log('Assist staging preflight: secrets redacted, origin separation, pilot gates and paths verified');
