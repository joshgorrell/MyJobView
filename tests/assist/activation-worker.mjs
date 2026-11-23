import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {createActivationWorker,createHttpDependencies,validateProviderResult} from '../../services/assist/activation-worker.mjs';
const org='00000000-0000-0000-0000-000000000001';
const domain='mjv-'+org.replaceAll('-','');
const job={organization_id:org,generation:7,lease_token:'00000000-0000-0000-0000-000000000002',lease_until:new Date(Date.now()+120000).toISOString(),desired_enabled:true};
const valid={...job,status:'applied',verified:true,consent_enforced:true,isolation_verified:true,mesh_domain:domain,server_origin:'https://assist.example.com',windows_download_url:`https://assist.example.com/${domain}/meshagents?meshid=one&id=4`};
assert.equal(validateProviderResult(job,valid).status,'applied');
for(const patch of [{organization_id:'other'},{generation:6},{desired_enabled:false},{verified:false},{mesh_domain:'elife'},{isolation_verified:false},{consent_enforced:false},{server_origin:'http://assist.example.com'},{windows_download_url:`https://evil.example/${domain}/meshagents?meshid=one&id=4`},{windows_download_url:`https://assist.example.com/${domain}/meshagents?meshid=one&id=4&auth=secret`},{windows_download_url:`https://assist.example.com/${domain}/meshagents?meshid=one&id=4&id=3`}]){
 assert.equal(validateProviderResult(job,{...valid,...patch}).status,'failed',JSON.stringify(patch));
}
const off={...job,desired_enabled:false};
assert.equal(validateProviderResult(off,{...off,status:'applied',verified:true}).status,'failed');
assert.equal(validateProviderResult(off,{...off,status:'applied',verified:true,sessions_revoked:true,enrollment_revoked:true,accounts_disabled:true}).status,'applied');
for(const mode of ['success','failure','stale','unverified','constraint','expired']){
 const calls=[];let finishes=0;
 const worker=createActivationWorker({rpc:async(name,body)=>{
  calls.push({name,body});if(name==='claim_assist_activation')return job;if(name==='validate_assist_activation_lease')return true;
  if(mode==='constraint'&&++finishes===1)throw new Error('URL constraint');
  return mode!=='stale';
 },reconcile:async()=>{if(mode==='failure')throw new Error('secret provider credentials');return {...valid,verified:mode!=='unverified'};},now:()=>mode==='expired'?Date.now()+200000:Date.now()});
 const result=await worker.runOnce();
 assert.equal(result.outcome,{success:'applied',failure:'retry',stale:'superseded',unverified:'retry',constraint:'retry',expired:'expired'}[mode]);
 const finish=calls.filter(c=>c.name==='finish_assist_activation');
 if(mode==='expired')assert.equal(finish.length,0);else{
  assert.equal(finish[0].body.p_lease_token,job.lease_token);
  assert.equal(finish.at(-1).body.p_result.status,['failure','unverified','constraint'].includes(mode)?'failed':'applied');
 }
 assert.ok(!JSON.stringify(result).includes('secret'));
}
assert.equal((await createActivationWorker({rpc:async name=>name==='claim_assist_activation'?job:false,reconcile:async()=>assert.fail()}).runOnce()).outcome,'superseded');
assert.equal((await createActivationWorker({rpc:async()=>null,reconcile:async()=>assert.fail()}).runOnce()).outcome,'idle');
assert.throws(()=>createHttpDependencies({}),/incomplete/);
const env={SUPABASE_URL:'https://db.example.com',SUPABASE_SERVICE_ROLE_KEY:'service-secret',ASSIST_CONTROL_ORIGIN:'https://control.example.com',ASSIST_CONTROL_TOKEN:'control-secret'};
const requests=[];const deps=createHttpDependencies(env,async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify(valid));});
await deps.reconcile(job);
assert.equal(requests[0].url,'https://control.example.com/v1/dealers/reconcile');
assert.equal(requests[0].options.redirect,'error');assert.equal(requests[0].options.headers['idempotency-key'],org+':7');
assert.equal(JSON.parse(requests[0].options.body).mesh_domain,domain);
assert.throws(()=>createHttpDependencies({...env,ASSIST_CONTROL_ORIGIN:'http://control.example.com'}),/HTTPS/);
await assert.rejects(createHttpDependencies(env,async()=>new Response('secret',{status:503})).reconcile(job),/request failed/);
const deadlines = [];
const timeout = mock.method(AbortSignal, 'timeout', milliseconds => {
 deadlines.push(milliseconds);
 return new AbortController().signal;
});
const clock = mock.method(Date, 'now', () => 1_000_000);
try {
 await deps.rpc('claim_assist_activation', {});
 await deps.reconcile({...job, lease_until: new Date(Date.now() + 120_000).toISOString()});
 await deps.reconcile({...job, lease_until: new Date(Date.now() + 100_000).toISOString()});
 assert.throws(() => deps.reconcile({...job, lease_until: new Date(Date.now() + 30_000).toISOString()}), /lease_too_short/);
 assert.deepEqual(deadlines, [30_000, 90_000, 70_000]);
} finally {
 clock.mock.restore();
 timeout.mock.restore();
}
console.log('Assist activation worker: provider ownership, verification, revocation attestations, retries, stale leases, HTTPS and secret-safe failures pass');
