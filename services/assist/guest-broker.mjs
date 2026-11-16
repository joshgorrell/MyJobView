import {createHash,randomBytes,randomUUID} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=value=>createHash('sha256').update(value).digest('hex');
const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const inviteOperations=['invite_capability','invite_create','invite_status','invite_connect','invite_end'];
export function validateGuestRequest(input){
 if(!input||!uuid.test(input.organization_id)||!['redeem','status','end'].includes(input.operation))throw new Error('guest_unavailable');
 if(input.operation==='redeem'){
  if(typeof input.code!=='string'||input.code.length>24)throw new Error('guest_unavailable');
  input={...input,code:input.code.replaceAll('-','').replaceAll(' ','').toUpperCase()};
  if(!/^[2-9A-HJ-NP-Z]{12}$/.test(input.code))throw new Error('guest_unavailable');
 }else if(!uuid.test(input.invite_id)||!/^[a-f0-9]{64}$/.test(input.claim_token||''))throw new Error('guest_unavailable');
 return input;
}
// In-memory capabilities deliberately die on restart. Native guest groups are cleaned before ingress reopens.
export function createGuestBroker({rpc,runtime,requeue,exclusive,enabled=false,now=Date.now}){
 const invites=new Map(),rate=new Map();
 const call=(action,c,params={})=>rpc('assist_support_service',{p_action:action,p_organization_id:c.organization_id,p_actor_id:c.actor_id||null,p_auth_session_id:c.auth_session_id||null,p_params:params});
 const live=async row=>enabled&&now()<row.expires&&now()<row.hardDeadline&&now()<row.token_exp*1000&&runtime.generation(row.organization_id)===row.generation&&(await call('access',row))?.allowed===true;
 async function close(row,reason){
  row.ended=true; // Immediately rejects every capability, even when provider cleanup needs retry.
  try{
   if(row.session)await runtime.revokeViewer(row.organization_id,row.session.native_username);
   if(row.meshId)await runtime.deleteGuestGroup(row.organization_id,row.meshId);
  }catch{
   try{await runtime.stop(row.organization_id);}finally{await requeue(row.organization_id,row.generation);}
  }
  if(row.session)await call('end',row,{session_id:row.session.id,reason:['user_ended','expired','access_revoked','launch_failed'].includes(reason)?reason:reason==='guest_ended'?'user_ended':'expired'});
  invites.delete(row.id);
 }
 async function requireLive(row){if(!row||row.ended)throw new Error('guest_unavailable');if(!await live(row)){await close(row,'expired');throw new Error('guest_unavailable');}}
 function status(row){return {invite_id:row.id,state:row.session?'support_window_ready':row.device?'computer_ready':row.claimHash?'waiting_for_computer':'waiting_for_guest',expires_at:new Date(row.expires).toISOString()};}
 return {
  async staff(c){
   return exclusive(c.organization_id,async()=>{
    if((await call('access',c))?.allowed!==true)throw new Error('forbidden');
    if(c.operation==='invite_capability')return {available:enabled};
    if(!enabled)throw new Error('guest_pilot_required');
    if(c.operation==='invite_create'){
     if(invites.size>=200||[...invites.values()].filter(i=>i.organization_id===c.organization_id).length>=10)throw new Error('invite_limit');
     const id=randomUUID(),code=[...randomBytes(12)].map(n=>alphabet[n%32]).join('');
     const generation=runtime.generation(c.organization_id);if(!Number.isInteger(generation))throw new Error('guest_unavailable');
     const row={...c,id,codeHash:hash(code),generation,expires:Math.min(now()+180000,c.token_exp*1000),joinDeadline:now()+600000,hardDeadline:now()+3600000};
     invites.set(id,row); // Records intent before a provider side effect; orphan cleanup also runs at startup.
     try{const group=await runtime.createGuestGroup(c.organization_id,id.replaceAll('-',''));row.meshId=group.meshId;row.downloadUrl=group.download_url;await requireLive(row);return {...status(row),code:code.match(/.{4}/g).join('-')};}
     catch(error){if(!row.meshId){try{await runtime.stop(row.organization_id);}finally{await requeue(row.organization_id,row.generation);}}await close(row,'launch_failed');throw error;}
    }
    const row=invites.get(c.invite_id);
    if(!row&&c.operation==='invite_end')return {ended:true};
    if(!row||row.organization_id!==c.organization_id||row.actor_id!==c.actor_id||row.auth_session_id!==c.auth_session_id)throw new Error('guest_unavailable');
    if(c.operation==='invite_end'){await close(row,'user_ended');return {ended:true};}
    // A fresh verified staff JWT may renew the lease, but never an expired lease or hard deadline.
    row.token_exp=c.token_exp;await requireLive(row);
    row.expires=Math.min(now()+180000,c.token_exp*1000,row.hardDeadline);
    if(!row.claimHash&&now()>=row.joinDeadline){await close(row,'invite_expired');throw new Error('guest_unavailable');}
    const nodes=(await runtime.inventory(row.organization_id,row.meshId)).filter(d=>d.online);
    if(nodes.length>1){await close(row,'ambiguous_computer');throw new Error('guest_unavailable');}
    if(row.device&&!nodes.some(d=>d.id===row.device)){await close(row,'computer_disconnected');throw new Error('guest_unavailable');}
    if(nodes.length===1&&row.claimHash)row.device=nodes[0].id;
    if(c.operation==='invite_status'){
     if(row.session){const updated=await call('touch',c,{session_id:row.session.id,token_exp:c.token_exp});if(!updated?.valid){await close(row,'access_revoked');throw new Error('forbidden');}row.session.expires_at=updated.expires_at;}
     return status(row);
    }
    if(c.operation!=='invite_connect'||!row.device||row.session)throw new Error('guest_unavailable');
    const session=await call('open',c,{device_id:row.device,token_exp:c.token_exp});if(!session?.valid)throw new Error('forbidden');row.session=session;
    try{
     const viewer=await runtime.createViewer(c.organization_id,row.device,session.native_username,row.meshId);
     const active=await call('activate',c,{session_id:session.id,token_exp:c.token_exp});if(!active?.valid)throw new Error('forbidden');
     row.session.expires_at=active.expires_at;await requireLive(row);
     return {...viewer,session_id:session.id,...status(row)};
    }catch(error){await close(row,'launch_failed');throw error;}
   });
  },
  async guest(input){
   const c=validateGuestRequest(input);if(!enabled)throw new Error('guest_unavailable');
   // All attempts count, including valid codes. Bounded per-dealer rate state; no client-supplied IP is trusted.
   const minute=Math.floor(now()/60000),old=rate.get(c.organization_id);
   if(!old||old.minute!==minute){if(!old&&rate.size>=10000)throw new Error('guest_unavailable');rate.set(c.organization_id,{minute,count:0});}
   if(++rate.get(c.organization_id).count>240)throw new Error('guest_unavailable');
   return exclusive(c.organization_id,async()=>{
    const row=c.operation==='redeem'?[...invites.values()].find(i=>i.organization_id===c.organization_id&&i.codeHash===hash(c.code)):invites.get(c.invite_id);
    if(!row&&c.operation==='end')return {ended:true};
    if(!row||row.organization_id!==c.organization_id)throw new Error('guest_unavailable');
    if(c.operation!=='redeem'&&row.claimHash!==hash(c.claim_token))throw new Error('guest_unavailable');
    await requireLive(row);
    if(c.operation==='redeem'){
     if(row.claimHash||now()>=row.joinDeadline)throw new Error('guest_unavailable');
     const token=randomBytes(32).toString('hex');row.claimHash=hash(token);
     return {...status(row),claim_token:token,download_url:row.downloadUrl};
    }
    if(c.operation==='end'){await close(row,'guest_ended');return {ended:true};}
    return status(row);
   });
  },
  async sweep(){
   const rows=[...invites.values()];let failed=false;
   for(let offset=0;offset<rows.length;offset+=8){
    const results=await Promise.allSettled(rows.slice(offset,offset+8).map(row=>exclusive(row.organization_id,async()=>{
     if(!invites.has(row.id))return;
     try{if(row.ended||!await live(row)||(!row.claimHash&&now()>=row.joinDeadline))await close(row,'expired');
      else if(row.session){if((await call('check',{organization_id:row.organization_id},{session_id:row.session.id}))?.valid!==true)await close(row,'access_revoked');}
     }catch{ // Failure to verify authorization never extends a guest capability.
      await close(row,'verification_failed');
     }
    })));
    if(results.some(result=>result.status==='rejected'))failed=true;
   }
   for(const [key,value]of rate)if(value.minute<Math.floor(now()/60000)-1)rate.delete(key);
   if(failed)throw new Error('guest_revocation_incomplete');
  },
 };
}
