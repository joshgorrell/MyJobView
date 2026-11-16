const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateSupportRequest(body){
 if(!body||!['devices','connect','touch','end'].includes(body.operation)||!uuid.test(body.organization_id)||!uuid.test(body.actor_id)||!uuid.test(body.auth_session_id)||!Number.isFinite(body.token_exp)||body.token_exp*1000<=Date.now())throw new Error('invalid_request');
 if(body.operation==='connect'&&(typeof body.device_id!=='string'||body.device_id.length>256))throw new Error('invalid_device');
 if(['touch','end'].includes(body.operation)&&!uuid.test(body.session_id))throw new Error('invalid_session');
 return body;
}
export function createSupportBroker({rpc,runtime,requeue,exclusive=async(_id,fn)=>fn()}){
 const sessions=new Map();
 const call=(action,c,params={})=>rpc('assist_support_service',{p_action:action,p_organization_id:c.organization_id,p_actor_id:c.actor_id||null,p_auth_session_id:c.auth_session_id||null,p_params:params});
 const revoke=async(c,reason)=>{
  try{await runtime.revokeViewer(c.organization_id,c.native_username);}
  catch{try{await runtime.stop(c.organization_id);}finally{await requeue(c.organization_id,c.generation);}}
  await call('end',{organization_id:c.organization_id},{session_id:c.id,reason});sessions.delete(c.id);
 };
 return {
  async handle(input){
   const c=validateSupportRequest(input);
   return exclusive(c.organization_id,async()=>{
    if(c.operation==='devices'){
     if((await call('access',c))?.allowed!==true)throw new Error('forbidden');
     return {devices:await runtime.inventory(c.organization_id)};
    }
    if(c.operation==='connect'){
     if((await call('access',c))?.allowed!==true)throw new Error('forbidden');
     const device=(await runtime.inventory(c.organization_id)).find(d=>d.id===c.device_id);
     if(!device?.online)throw new Error('device_unavailable');
     const row=await call('open',c,{device_id:c.device_id,token_exp:c.token_exp});
     if(!row?.valid)throw new Error('forbidden');
     const context={...row,organization_id:c.organization_id,actor_id:c.actor_id,auth_session_id:c.auth_session_id};
     try{
      const viewer=await runtime.createViewer(c.organization_id,c.device_id,row.native_username);
      const active=await call('activate',c,{session_id:row.id,token_exp:c.token_exp});
      if(active?.valid!==true)throw new Error('forbidden');
      sessions.set(row.id,{...context,expires_at:active.expires_at});
      return {session_id:row.id,...viewer,expires_at:active.expires_at};
     }catch(error){await revoke(context,'launch_failed');throw error;}
    }
    const existing=sessions.get(c.session_id);
    if(!existing||existing.organization_id!==c.organization_id||existing.actor_id!==c.actor_id||existing.auth_session_id!==c.auth_session_id)throw new Error('session_unavailable');
    if(c.operation==='end'){await revoke(existing,'user_ended');return {ended:true};}
    const updated=await call('touch',c,{session_id:c.session_id,token_exp:c.token_exp});
    if(updated?.valid!==true){await revoke(existing,'access_revoked');throw new Error('forbidden');}
    existing.expires_at=updated.expires_at;return {active:true,expires_at:updated.expires_at};
   });
  },
  async sweep(){
   const active=[...sessions.values()];let failed=false;
   for(let offset=0;offset<active.length;offset+=8){
    const results=await Promise.allSettled(active.slice(offset,offset+8).map(session=>exclusive(session.organization_id,async()=>{
     if(!sessions.has(session.id))return;
     let valid;
     try{valid=(await call('check',{organization_id:session.organization_id},{session_id:session.id}))?.valid===true;}
     catch{if(Date.now()<Date.parse(session.expires_at))return;valid=false;}
     if(!valid)await revoke(session,'expired');
    })));
    if(results.some(r=>r.status==='rejected'))failed=true;
   }
   if(failed)throw new Error('revocation_incomplete');

  },
 };
}
