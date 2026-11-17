import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSupportBroker} from '../../services/assist/support-broker.mjs';
import {createGuestBroker} from '../../services/assist/guest-broker.mjs';

const org='00000000-0000-0000-0000-000000000001';
const actor='00000000-0000-0000-0000-000000000002';
const auth='00000000-0000-0000-0000-000000000003';
const domain='mjv-'+org.replaceAll('-','');
const permanent='node/'+domain+'/'+'A'.repeat(64);
const guestDevice='node/'+domain+'/'+'B'.repeat(64);
const context={organization_id:org,actor_id:actor,auth_session_id:auth,token_exp:Date.now()/1000+3600};
const group='mesh/'+domain+'/'+'C'.repeat(64);
let enrolled=true,guestOnline=false,removed=0,guestGroup='';
const runtime={
 generation:()=>1,
 inventory:async(_org,meshId)=>meshId?[{id:guestDevice,name:'Same physical PC, temporary agent',online:guestOnline}]:enrolled?[{id:permanent,name:'Original enrollment',online:true}]:[],
 removeEnrollment:async()=>{enrolled=false;removed++;return {removed:true};},
 createGuestGroup:async(_org,id)=>{guestGroup=id;return {meshId:group,download_url:'https://assist.example.com/'+domain+'/meshagents?meshid='+'C'.repeat(64)+'&id=4&installflags=1'};},
 deleteGuestGroup:async()=>{},
 createViewer:async(_org,id,_username,meshId)=>{assert.equal(id,guestDevice);assert.equal(meshId,group);return {viewer_url:'https://assist.example.com/'+domain+'/?login=temporary&node='+'B'.repeat(64)+'&viewmode=11&hide=15',viewer_origin:'https://assist.example.com'};},
 revokeViewer:async()=>{},stop:async()=>{}
};
const rpc=async(_name,args)=>{
 if(args.p_action==='access')return {allowed:true};
 if(args.p_action==='open')return {valid:true,id:'00000000-0000-0000-0000-000000000004',native_username:'mjv-session-'+'D'.repeat(32).toLowerCase(),generation:1};
 if(['activate','touch','check'].includes(args.p_action))return {valid:true,expires_at:new Date(Date.now()+180000).toISOString()};
 return {valid:true};
};
const exclusive=async(_id,fn)=>fn();
const directory=await mkdtemp(join(tmpdir(),'assist-removed-guest-'));
try{
 const enrolledBroker=createSupportBroker({rpc,runtime,requeue:async()=>{},exclusive,labelDirectory:directory});
 assert.equal((await enrolledBroker.handle({...context,operation:'device_remove',device_id:permanent})).removed,true);
 assert.equal(removed,1);
 assert.equal((await enrolledBroker.handle({...context,operation:'devices'})).devices.length,0);
 const guestBroker=createGuestBroker({rpc,runtime,requeue:async()=>{},exclusive,enabled:true});
 const invite=await guestBroker.staff({...context,operation:'invite_create'});
 assert.ok(guestGroup);
 const claim=await guestBroker.guest({organization_id:org,operation:'redeem',code:invite.code});
 assert.ok(claim.download_url.includes('installflags=1'));
 guestOnline=true;
 assert.equal((await guestBroker.staff({...context,operation:'invite_status',invite_id:invite.invite_id})).state,'computer_ready');
 const viewer=await guestBroker.staff({...context,operation:'invite_connect',invite_id:invite.invite_id});
 assert.equal(viewer.state,'support_window_ready');
 assert.equal((await enrolledBroker.handle({...context,operation:'devices'})).devices.length,0);
 await assert.rejects(enrolledBroker.handle({...context,operation:'connect',device_id:permanent}),/device_unavailable/);
 assert.equal((await guestBroker.guest({organization_id:org,operation:'end',invite_id:invite.invite_id,claim_token:claim.claim_token})).ended,true);
 console.log('Removed enrollment remains blocked; fresh guest code independently grants temporary support');
}finally{await rm(directory,{recursive:true,force:true});}
