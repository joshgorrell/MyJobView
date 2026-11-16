import {timingSafeEqual,randomUUID} from 'node:crypto';
export const dealerDomain=id=>`mjv-${id.replaceAll('-','')}`;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validControlToken(actual,expected){
 if(typeof expected!=='string'||expected.length<32||typeof actual!=='string')return false;
 const a=Buffer.from(actual),b=Buffer.from('Bearer '+expected);
 return a.length===b.length && timingSafeEqual(a,b);
}
export function validateControlJob(body,idempotencyKey){
 if(!body||!uuid.test(body.organization_id)||!uuid.test(body.lease_token)||!Number.isSafeInteger(body.generation)||body.generation<1||typeof body.desired_enabled!=='boolean'||body.mesh_domain!==dealerDomain(body.organization_id)||idempotencyKey!==`${body.organization_id}:${body.generation}`||!Number.isFinite(Date.parse(body.lease_until))||Date.parse(body.lease_until)<=Date.now())throw new Error('invalid_request');
 return body;
}
export function createControlPlane({store,runtime,validateLease,probe}){
 const queues=new Map();
 const verifiedProbe=async body=>{
  const requested=Date.now();const nonce=randomUUID();const result=await probe({...body,probe_nonce:nonce,probe_requested_at:requested});
  if(result?.organization_id!==body.organization_id||result?.generation!==body.generation||result?.probe_nonce!==nonce||!Number.isFinite(result?.checked_at)||result.checked_at<requested-5000||result.checked_at>Date.now()+5000||result?.desktop_control!==true||result?.consent_enforced!==true||result?.cross_tenant_denied!==true)throw new Error('canary_failed');
  return result;
 };
 const serialize=(id,fn)=>{
  const before=queues.get(id)||Promise.resolve();const result=before.catch(()=>{}).then(fn);
  queues.set(id,result);void result.finally(()=>{if(queues.get(id)===result)queues.delete(id);}).catch(()=>{});return result;
 };
 return {
  runExclusive:serialize,
  checkHealth(id){return serialize(id,async()=>{
   const state=await store.read(id);if(!state||!state.desired_enabled||state.phase!=='verified')return null;
   const domain=dealerDomain(id);
   try{
    if(!runtime.target(domain))throw new Error('runtime_unavailable');
    const evidence=await verifiedProbe({organization_id:id,generation:state.generation,mesh_domain:domain,mesh_id:state.mesh_id,server_origin:state.result.server_origin});
    if(evidence?.organization_id!==id||evidence?.generation!==state.generation||evidence?.desktop_control!==true||evidence?.consent_enforced!==true||evidence?.cross_tenant_denied!==true)throw new Error('canary_failed');
    return {healthy:true,organization_id:id,generation:state.generation};
   }catch{
    await runtime.stop(id).catch(()=>{});await store.write(id,{...state,phase:'failed',result:null}).catch(()=>{});
    return {healthy:false,organization_id:id,generation:state.generation};
   }
  });},
  reconcile(job){return serialize(job.organization_id,async()=>{
   const id=job.organization_id;const check=async()=>{
    if(Date.parse(job.lease_until)<=Date.now() || await validateLease(job)!==true)throw new Error('stale_lease');
   };
   await check();let state=await store.read(id);
   if(state && (state.generation>job.generation || (state.generation===job.generation&&state.desired_enabled!==job.desired_enabled)))throw new Error('stale_generation');
   // Durable intent is recorded BEFORE any runtime operation. A failed stop never reports off.
   state={...state,organization_id:id,generation:job.generation,desired_enabled:job.desired_enabled,phase:'applying',result:null};
   try{await store.write(id,state);}catch{await runtime.stop(id).catch(()=>{});throw new Error('state_unavailable');}
   const identity={organization_id:id,generation:job.generation,desired_enabled:job.desired_enabled};
   try{
    await check();
    if(!job.desired_enabled){
     await runtime.stop(id);await check();
     const stopped=await runtime.isStopped(id);
     if(stopped!==true)throw new Error('stop_unconfirmed');
     state=await store.read(id);
     const result={...identity,status:'applied',verified:true,sessions_revoked:true,enrollment_revoked:true,accounts_disabled:true};
     await store.write(id,{...state,generation:job.generation,desired_enabled:false,phase:'off',result});return result;
    }
    const provisioned=await runtime.ensure(job,check);await check();
    const evidence=await verifiedProbe({organization_id:id,generation:job.generation,mesh_domain:job.mesh_domain,mesh_id:provisioned.meshId,server_origin:provisioned.server_origin});
    await check();
    if(evidence?.organization_id!==id||evidence?.generation!==job.generation||evidence?.desktop_control!==true||evidence?.consent_enforced!==true||evidence?.cross_tenant_denied!==true)throw new Error('canary_failed');
    const result={...identity,status:'applied',verified:true,consent_enforced:true,isolation_verified:true,mesh_domain:job.mesh_domain,server_origin:provisioned.server_origin,windows_download_url:provisioned.windows_download_url};
    state=await store.read(id);await store.write(id,{...state,generation:job.generation,desired_enabled:true,phase:'verified',mesh_id:provisioned.meshId,result});return result;
   }catch(error){
    // Unknown/stale/failed activation is never left exposed through the managed proxy.
    await runtime.stop(id).catch(()=>{});
    state=await store.read(id);await store.write(id,{...state,generation:job.generation,desired_enabled:job.desired_enabled,phase:'failed',result:null});
    throw new Error(error.message==='stale_lease'?'stale_lease':'reconcile_failed');
   }
  });},
 };
}
