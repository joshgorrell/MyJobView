import assert from 'node:assert/strict';
import {createGuestBroker,validateGuestRequest} from '../../services/assist/guest-broker.mjs';
import {createAssistGuestHandler} from '../../supabase/functions/_shared/assist-guest-handler.mjs';
import {createAssistSupportHandler} from '../../supabase/functions/_shared/assist-support-handler.mjs';
const org='00000000-0000-0000-0000-000000000001',actor='00000000-0000-0000-0000-000000000002',auth='00000000-0000-0000-0000-000000000003',sid='00000000-0000-0000-0000-000000000004';
const other='00000000-0000-0000-0000-000000000005',domain='mjv-'+org.replaceAll('-',''),meshId=`mesh/${domain}/${'A'.repeat(64)}`,device=`node/${domain}/${'B'.repeat(64)}`;
let clock=Date.now(),allowed=true,generation=1,online=[],revokes=0,deletes=0,stops=0,requeues=0,deleteFails=false,opens=0;
const context={organization_id:org,actor_id:actor,auth_session_id:auth,token_exp:clock/1000+7200};
const download=`https://assist.example.com/${domain}/meshagents?meshid=${'A'.repeat(64)}&id=4&installflags=1`;
const runtime={generation:()=>generation,createGuestGroup:async()=>({meshId,download_url:download}),deleteGuestGroup:async()=>{if(deleteFails)throw new Error('offline');deletes++;},inventory:async(_org,group)=>{assert.equal(group,meshId);return online;},createViewer:async(_org,id,_username,group)=>{assert.equal(id,device);assert.equal(group,meshId);return {viewer_url:`https://assist.example.com/${domain}/?login=token&node=${'B'.repeat(64)}&viewmode=11&hide=15`,viewer_origin:'https://assist.example.com'};},revokeViewer:async()=>{revokes++;},stop:async()=>{stops++;}};
const endReasons=[];
const rpc=async(_name,args)=>{
 if(args.p_action==='access')return {allowed};
 if(args.p_action==='open'){opens++;return {valid:true,id:sid,native_username:'mjv-session-'+sid.replaceAll('-',''),generation:1};}
 if(['activate','touch','check'].includes(args.p_action))return {valid:allowed,expires_at:new Date(clock+180000).toISOString()};
 if(args.p_action==='end'){endReasons.push(args.p_params.reason);assert.ok(['user_ended','expired','access_revoked','launch_failed'].includes(args.p_params.reason));return {valid:false};}
};
// Model the same dealer serializer used by the control plane, including simultaneous redemption.
let queue=Promise.resolve();const exclusive=(_id,fn)=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
const options={rpc,runtime,exclusive,requeue:async()=>{requeues++;},enabled:true,now:()=>clock};
const broker=createGuestBroker(options),staff=(operation,extra={})=>broker.staff({...context,operation,...extra});
assert.equal((await staff('invite_capability')).available,true);
assert.equal((await createGuestBroker({...options,enabled:false}).staff({...context,operation:'invite_capability'})).available,false);
await assert.rejects(createGuestBroker({...options,enabled:false}).staff({...context,operation:'invite_create'}),/pilot/);
// Architecture selection is per redeemed invitation, never a global fallback.
// ARM64 must remain disabled until its independent real-device pilot passes.
const archRestricted=createGuestBroker({...options,arm64Enabled:false});
const restrictedInvite=await archRestricted.staff({...context,operation:'invite_create'});
await assert.rejects(archRestricted.guest({organization_id:org,operation:'redeem',code:restrictedInvite.code,architecture:'arm64'}),/unavailable/);
const restrictedX64=await archRestricted.guest({organization_id:org,operation:'redeem',code:restrictedInvite.code,architecture:'x64'});
assert.equal(new URL(restrictedX64.download_url).searchParams.get('id'),'4');
assert.equal(new URL(restrictedX64.download_url).searchParams.get('installflags'),'1');
await archRestricted.guest({organization_id:org,operation:'end',invite_id:restrictedInvite.invite_id,claim_token:restrictedX64.claim_token});
const archEnabled=createGuestBroker({...options,arm64Enabled:true});
const armInvite=await archEnabled.staff({...context,operation:'invite_create'});
const armClaim=await archEnabled.guest({organization_id:org,operation:'redeem',code:armInvite.code,architecture:'arm64'});
const armDownload=new URL(armClaim.download_url);
assert.equal(armDownload.searchParams.get('id'),'43','ARM64 must request its own native agent');
assert.equal(armDownload.searchParams.get('installflags'),'1','ARM64 guest must remain temporary');
assert.equal(armDownload.searchParams.get('meshid'),new URL(download).searchParams.get('meshid'),'Architecture must not change dealer group');
await archEnabled.guest({organization_id:org,operation:'end',invite_id:armInvite.invite_id,claim_token:armClaim.claim_token});
const invite=await staff('invite_create');assert.match(invite.code,/^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){2}$/);
await assert.rejects(broker.guest({organization_id:other,operation:'redeem',code:invite.code}),/unavailable/);
const claims=await Promise.allSettled([1,2].map(()=>broker.guest({organization_id:org,operation:'redeem',code:invite.code.toLowerCase()})));
assert.equal(claims.filter(r=>r.status==='fulfilled').length,1,'Exactly one simultaneous redeemer wins');
const claim=claims.find(r=>r.status==='fulfilled').value;assert.equal(claim.download_url,download);assert.match(claim.claim_token,/^[a-f0-9]{64}$/);
const guest=(operation,extra={})=>broker.guest({organization_id:org,operation,invite_id:invite.invite_id,claim_token:claim.claim_token,...extra});
await assert.rejects(guest('status',{claim_token:'0'.repeat(64)}),/unavailable/);
await assert.rejects(broker.staff({...context,actor_id:other,operation:'invite_status',invite_id:invite.invite_id}),/unavailable/);
assert.equal((await guest('status')).state,'waiting_for_computer');
await assert.rejects(staff('invite_connect',{invite_id:invite.invite_id}),/unavailable/);assert.equal(opens,0);
online=[{id:device,online:true}];assert.equal((await staff('invite_status',{invite_id:invite.invite_id})).state,'computer_ready');
const connected=await staff('invite_connect',{invite_id:invite.invite_id});assert.equal(connected.state,'support_window_ready');assert.equal(opens,1);
await assert.rejects(staff('invite_connect',{invite_id:invite.invite_id}),/unavailable/);assert.equal(opens,1,'Only one desktop viewer is issued');
assert.equal((await guest('end')).ended,true);assert.equal(revokes,1);assert.equal(deletes,1);assert.equal(endReasons.at(-1),'user_ended');
await assert.rejects(guest('status'),/unavailable/);
// A guest that closes the temporary Windows client without clicking End must
// lose the native viewer on the next short session sweep.
const disconnectedInvite=await staff('invite_create');
const disconnectedClaim=await broker.guest({organization_id:org,operation:'redeem',code:disconnectedInvite.code});
online=[{id:device,online:true}];
await staff('invite_status',{invite_id:disconnectedInvite.invite_id});
await staff('invite_connect',{invite_id:disconnectedInvite.invite_id});
const beforeDisconnectRevokes=revokes,beforeDisconnectDeletes=deletes;
online=[];
await broker.sweep();
assert.equal(revokes,beforeDisconnectRevokes+1,'Disconnected guest viewer is revoked at sweep');
assert.equal(deletes,beforeDisconnectDeletes+1,'Disconnected guest group is removed');
await assert.rejects(staff('invite_status',{invite_id:disconnectedInvite.invite_id}),/unavailable/);
await assert.rejects(broker.guest({organization_id:org,operation:'status',invite_id:disconnectedInvite.invite_id,claim_token:disconnectedClaim.claim_token}),/unavailable/);
const expired=await staff('invite_create');clock+=180001;await broker.sweep();await assert.rejects(staff('invite_status',{invite_id:expired.invite_id}),/unavailable/);
const revoked=await staff('invite_create');allowed=false;await broker.sweep();allowed=true;
await assert.rejects(broker.guest({organization_id:org,operation:'redeem',code:revoked.code}),/unavailable/);
const oldGeneration=await staff('invite_create');generation=2;await broker.sweep();await assert.rejects(staff('invite_status',{invite_id:oldGeneration.invite_id}),/unavailable/);
const failed=await staff('invite_create');deleteFails=true;await staff('invite_end',{invite_id:failed.invite_id});assert.equal(stops,1);assert.equal(requeues,1);deleteFails=false;
assert.equal((await staff('invite_end',{invite_id:failed.invite_id})).ended,true,'Ending an already removed invitation is idempotent');
const restart=createGuestBroker(options);await assert.rejects(restart.guest({organization_id:org,operation:'redeem',code:failed.code}),/unavailable/);
for(const input of [{organization_id:org,operation:'redeem',code:'123'},{organization_id:org,operation:'create'},{organization_id:org,operation:'status',invite_id:invite.invite_id,claim_token:'x'}])assert.throws(()=>validateGuestRequest(input));
let called=0;
const publicHandler=createAssistGuestHandler({publicOrigin:'https://assist.example.com',resolveDealer:async subdomain=>subdomain==='elife'?org:null,control:async c=>{called++;assert.equal(c.organization_id,org);assert.equal(c.actor_id,undefined);return {...claim,invite_id:invite.invite_id,expires_at:new Date(clock+1000).toISOString()};}});
const request=(body,origin='https://elife.myjobview.com')=>new Request('https://backend.example/functions/v1/assist-guest',{method:'POST',headers:{origin},body:JSON.stringify(body)});
assert.equal((await publicHandler(request({operation:'redeem',code:invite.code},'https://evil.example'))).status,403);assert.equal(called,0);
assert.equal((await publicHandler(request({operation:'redeem',code:invite.code},'https://other.myjobview.com'))).status,503);assert.equal(called,0);
const response=await publicHandler(request({operation:'redeem',code:invite.code,organization_id:other,actor_id:other}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),'https://elife.myjobview.com');
// Public guest endpoint must preserve the architecture gate all the way to the browser.
const armPublicHandler=createAssistGuestHandler({publicOrigin:'https://assist.example.com',resolveDealer:async subdomain=>subdomain==='elife'?org:null,control:async c=>{
 assert.equal(c.architecture,'arm64');
 return {...claim,download_url:download.replace('id=4','id=43')};
}});
const armResponse=await armPublicHandler(request({operation:'redeem',code:invite.code,architecture:'arm64'}));
assert.equal(armResponse.status,200);
assert.equal(new URL((await armResponse.json()).download_url).searchParams.get('id'),'43');
const mismatchHandler=createAssistGuestHandler({publicOrigin:'https://assist.example.com',resolveDealer:async()=>org,control:async()=>claim});
assert.equal((await mismatchHandler(request({operation:'redeem',code:invite.code,architecture:'arm64'}))).status,503,'Never return an x64 executable for an ARM64 request');
const redirectHandler=createAssistGuestHandler({publicOrigin:'https://assist.example.com',resolveDealer:async()=>org,control:async()=>({...claim,download_url:download.replace('assist.example.com','untrusted.example.com')})});
assert.equal((await redirectHandler(request({operation:'redeem',code:invite.code}))).status,503,'Never expose a foreign download host');
const badHandler=createAssistGuestHandler({publicOrigin:'https://assist.example.com',resolveDealer:async()=>org,control:async()=>({...claim,download_url:download.replace('installflags=1','installflags=0')})});assert.equal((await badHandler(request({operation:'redeem',code:invite.code}))).status,503);
const staffHandler=createAssistSupportHandler({publicOrigin:'https://assist.example.com',authenticate:async()=>({...context,subdomain:'elife'}),control:async()=>({...invite,secret:'never return'})});
const staffResponse=await staffHandler(new Request('https://backend.example/functions/v1/assist-support',{method:'POST',headers:{origin:'https://elife.myjobview.com',authorization:'Bearer verified'},body:JSON.stringify({operation:'invite_create',organizationId:org})}));assert.equal(staffResponse.status,200);const data=await staffResponse.json();assert.equal(data.join_url,`https://elife.myjobview.com/assist#code=${invite.code}`);assert.equal(data.secret,undefined);
const limited=createGuestBroker(options);
for(let i=0;i<241;i++)await assert.rejects(limited.guest({organization_id:org,operation:'redeem',code:'ABCD-EFGH-JKLM'}),/unavailable/);
let checked=0;const outages=createGuestBroker({...options,rpc:async(name,args)=>{if(args.p_action==='access'&&++checked>2)throw new Error('auth offline');return rpc(name,args);}});
await outages.staff({...context,operation:'invite_create'});checked=0; // A second independent invitation must also be swept on auth failure.
await outages.staff({...context,operation:'invite_create'});checked=2;
const beforeDeletes=deletes;await outages.sweep();assert.equal(deletes,beforeDeletes+2);
const unapprovedArmInvite=await staff('invite_create');
await assert.rejects(broker.guest({organization_id:org,operation:'redeem',code:unapprovedArmInvite.code,architecture:'arm64'}),/unavailable/);
const fallbackClaim=await broker.guest({organization_id:org,operation:'redeem',code:unapprovedArmInvite.code,architecture:'x64'});assert.equal(new URL(fallbackClaim.download_url).searchParams.get('id'),'4','Unapproved ARM request does not consume code');
const armBroker=createGuestBroker({...options,arm64Enabled:true});
const arm=await armBroker.staff({...context,operation:'invite_create'});
const approvedArmClaim=await armBroker.guest({organization_id:org,operation:'redeem',code:arm.code,architecture:'arm64'});
assert.equal(new URL(approvedArmClaim.download_url).searchParams.get('id'),'43');assert.equal(new URL(approvedArmClaim.download_url).searchParams.get('installflags'),'1');
assert.equal(new URL(approvedArmClaim.download_url).searchParams.get('meshid'),new URL(download).searchParams.get('meshid'));
assert.throws(()=>validateGuestRequest({organization_id:org,operation:'redeem',code:arm.code,architecture:'linux'}));
const armHandler=createAssistGuestHandler({publicOrigin:'https://assist.example.com',resolveDealer:async()=>org,control:async c=>{assert.equal(c.architecture,'arm64');return approvedArmClaim;}});
assert.equal((await armHandler(request({operation:'redeem',code:arm.code,architecture:'arm64'}))).status,200);
const wrongArmHandler=createAssistGuestHandler({publicOrigin:'https://assist.example.com',resolveDealer:async()=>org,control:async()=>({...approvedArmClaim,download_url:download})});
assert.equal((await wrongArmHandler(request({operation:'redeem',code:arm.code,architecture:'arm64'}))).status,503);
console.log('Assist guest invitations: one-time claim, tenant/actor/session binding, temporary scope, expiry, revocation, generation fences, cleanup fallback, restart and Edge validation pass');
