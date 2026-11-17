import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {inviteOperations} from './guest-broker.mjs';
const safeLabel=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=120&&!/[\x00-\x1f\x7f]/.test(value);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateSupportRequest(body){
 if(!body||!['devices','device_label','device_disable','connect','touch','end',...inviteOperations].includes(body.operation)||!uuid.test(body.organization_id)||!uuid.test(body.actor_id)||!uuid.test(body.auth_session_id)||!Number.isFinite(body.token_exp)||body.token_exp*1000<=Date.now())throw new Error('invalid_request');
 if(body.operation==='device_label'&&(typeof body.device_id!=='string'||body.device_id.length>256||!safeLabel(body.label)))throw new Error('invalid_device');
 if(body.operation==='device_disable'&&(typeof body.device_id!=='string'||body.device_id.length>256))throw new Error('invalid_device');
 if(body.operation==='connect'&&(typeof body.device_id!=='string'||body.device_id.length>256))throw new Error('invalid_device');
 if(['touch','end'].includes(body.operation)&&!uuid.test(body.session_id))throw new Error('invalid_session');
 if(inviteOperations.includes(body.operation)&&!['invite_create','invite_capability'].includes(body.operation)&&!uuid.test(body.invite_id))throw new Error('invalid_invite');
 return body;
}
export function createSupportBroker({rpc,runtime,requeue,exclusive=async(_id,fn)=>fn(),labelDirectory=null}){
 const labelPath=id=>join(labelDirectory,id+'.json');
 const readLabels=async id=>{if(!labelDirectory)return {};try{const data=JSON.parse(await readFile(labelPath(id),'utf8'));return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch(e){if(e.code==='ENOENT')return {};throw e;}};
 const writeLabels=async(id,labels)=>{if(!labelDirectory)throw new Error('labels_unavailable');await mkdir(labelDirectory,{recursive:true,mode:0o700});const target=labelPath(id),temp=target+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(labels),{mode:0o600,flag:'wx'});await rename(temp,target);};
 const sessions=new Map();
 const disabledPath=id=>join(labelDirectory,id+'.disabled.json');
 const readDisabled=async id=>{if(!labelDirectory)throw new Error('device_management_unavailable');try{const value=JSON.parse(await readFile(disabledPath(id),'utf8'));return Array.isArray(value)?value:[];}catch(error){if(error.code==='ENOENT')return [];throw error;}};
 const writeDisabled=async(id,ids)=>{await mkdir(labelDirectory,{recursive:true,mode:0o700});const path=disabledPath(id),tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(ids),{mode:0o600,flag:'wx'});await rename(tmp,path);};
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
     const devices=await runtime.inventory(c.organization_id),labels=await readLabels(c.organization_id),disabled=await readDisabled(c.organization_id);
     return {devices:devices.map(device=>({...device,name:safeLabel(labels[device.id])?labels[device.id]:device.name,disabled:disabled.includes(device.id)}))};
    }
    if(c.operation==='device_label'){
     if((await call('access',c))?.allowed!==true)throw new Error('forbidden');
     const devices=await runtime.inventory(c.organization_id);
     if(!devices.some(device=>device.id===c.device_id))throw new Error('device_unavailable');
     const labels=await readLabels(c.organization_id);labels[c.device_id]=c.label.trim();await writeLabels(c.organization_id,labels);
     return {saved:true};
    }
    if(c.operation==='device_disable'){
     if((await call('access',c))?.allowed!==true)throw new Error('forbidden');
     const devices=await runtime.inventory(c.organization_id);
     if(!devices.some(device=>device.id===c.device_id))throw new Error('device_unavailable');
     const disabled=await readDisabled(c.organization_id);
     if(!disabled.includes(c.device_id))await writeDisabled(c.organization_id,[...disabled,c.device_id]);
     // Do not claim revocation while any active viewer remains authorized.
     for(const active of [...sessions.values()].filter(row=>row.organization_id===c.organization_id&&row.device_id===c.device_id))await revoke(active,'device_disabled');
     return {disabled:true};
    }
    if(c.operation==='connect'){
     if((await call('access',c))?.allowed!==true)throw new Error('forbidden');
     const device=(await runtime.inventory(c.organization_id)).find(d=>d.id===c.device_id);
     if(!device?.online||(await readDisabled(c.organization_id)).includes(c.device_id))throw new Error('device_unavailable');
     const row=await call('open',c,{device_id:c.device_id,token_exp:c.token_exp});
     if(!row?.valid)throw new Error('forbidden');
     const context={...row,device_id:c.device_id,organization_id:c.organization_id,actor_id:c.actor_id,auth_session_id:c.auth_session_id};
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
