import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,symlink,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import net from 'node:net';
import {ensureLaptopGroup,meshCommand,viewerCookie,nativeUsers} from './meshcentral-client.mjs';
import {dealerDomain} from './control-core.mjs';
import {verifyRuntimeSecurity} from './runtime-security.mjs';

export function runtimeConfig({domain,port,keyHex},origin,proxyCertificateUrl){
 const host=new URL(origin);if(host.protocol!=='https:'||host.origin!==origin)throw new Error('invalid_public_origin');
 return {settings:{wanOnly:true,cert:host.hostname,port,portBind:'127.0.0.1',aliasPort:Number(host.port||443),redirPort:0,mpsPort:0,
  exactPorts:true,sessionSecure:true,tlsOffload:'127.0.0.1',allowLoginToken:true,loginCookieEncryptionKey:keyHex,
  selfUpdate:false,noAgentUpdate:0,agentDownloads:{enabled:false}},
  domains:{'':{newAccounts:false},[domain]:{title:'MJV Remote Support',newAccounts:false,...(proxyCertificateUrl?{certUrl:proxyCertificateUrl}:{}),
   userConsentFlags:{desktopnotify:true,desktopprompt:true,terminalnotify:true,terminalprompt:true,filenotify:true,fileprompt:true,desktopprivacybar:true}}}};
}
const closedPort=port=>new Promise(resolve=>{
 const socket=net.connect({host:'127.0.0.1',port});let done=false;
 const finish=closed=>{if(done)return;done=true;socket.destroy();resolve(closed);};
 socket.setTimeout(1000,()=>finish(false));socket.once('connect',()=>finish(false));
 socket.once('error',e=>finish(e.code==='ECONNREFUSED'));
});
async function freePort(){const server=net.createServer();await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const port=server.address().port;await new Promise(r=>server.close(r));return port;}
export function createManagedRuntime({store,entry,approvedVersion,publicOrigin,command=meshCommand,onExit=async()=>{},diagnostic=()=>{},agentCacheDirectory,startupAttempts=40,proxyCertificateUrl}){
 if(!Number.isInteger(startupAttempts)||startupAttempts<1||startupAttempts>120)throw new Error('invalid_startup_attempts');
 const runtimes=new Map();let shuttingDown=false;let allocator=Promise.resolve();
 const binary=resolve(entry);
 async function cli(dataPath,args){
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[binary,'--datapath',dataPath,...args],{stdio:['ignore','pipe','pipe']});
   let output='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('bootstrap_timeout'));},15000);
   child.stdout.on('data',d=>{output=(output+d).slice(-4096);});child.stderr.resume();
   child.once('error',()=>{clearTimeout(timer);reject(new Error('bootstrap_failed'));});
   child.once('exit',code=>{clearTimeout(timer);code===0&&(/Done\.|User already exists\./.test(output))?resolve():reject(new Error('bootstrap_failed'));});
  });
 }
 async function allocate(id){
  const before=allocator;let release;allocator=new Promise(r=>{release=r;});await before;
  try{let state=await store.read(id);if(!state.port){const used=new Set((await store.list()).map(s=>s?.port));let port;for(let i=0;i<32;i++){const candidate=await freePort();if(!used.has(candidate)){port=candidate;break;}}if(!port)throw new Error('port_allocation_failed');state={...state,port,keyHex:randomBytes(80).toString('hex')};await store.write(id,state);}return state;}
  finally{release();}
 }
 const api={
  async verifyVersion(){const pkg=JSON.parse(await readFile(join(dirname(binary),'package.json'),'utf8'));if(pkg.name!=='meshcentral'||pkg.version!==approvedVersion)throw new Error('unapproved_meshcentral_version');await verifyRuntimeSecurity(binary);},
  async ensure(job,check){
   if(shuttingDown)throw new Error('runtime_shutting_down');
   const id=job.organization_id;let state=await allocate(id);const domain=dealerDomain(id);
   const dataPath=join(store.root,'instances',id);await mkdir(dataPath,{recursive:true,mode:0o700});
   if(agentCacheDirectory){
    const cache=await realpath(agentCacheDirectory);const link=join(dataPath,'agentbuilds');
    try{await symlink(cache,link,'dir');}catch(error){if(error.code!=='EEXIST'||await realpath(link)!==cache)throw new Error('invalid_agent_cache');}
   }
   if(!runtimes.has(id)&&state.initialized){state={...state,keyHex:randomBytes(80).toString('hex')};await store.write(id,state);}
   const identity={domain,port:state.port,keyHex:state.keyHex};
   const config=runtimeConfig(identity,publicOrigin,proxyCertificateUrl);
   if(!runtimes.has(id)){
    if(await closedPort(state.port)!==true)throw new Error('unowned_port_busy');
    const temp=join(dataPath,`config.${randomUUID()}.tmp`);await writeFile(temp,JSON.stringify(config),{mode:0o600});await rename(temp,join(dataPath,'config.json'));
    if(state.initialized!==true){
     await check();await cli(dataPath,['--createaccount','mjv-platform','--domain',domain,'--hashpass',randomBytes(96).toString('base64')+','+randomBytes(96).toString('base64')]);
     await check();await cli(dataPath,['--adminaccount','mjv-platform','--domain',domain]);
     state={...await store.read(id),initialized:true};await store.write(id,state);
    }
    await check();if(shuttingDown)throw new Error('runtime_shutting_down');
    const child=spawn(process.execPath,[binary,'--datapath',dataPath,'--launch',String(process.pid)],{stdio:['pipe','pipe','pipe']});
    const record={child,port:state.port,domain,keyHex:state.keyHex,cleaned:false,serving:false,stopping:false,sockets:new Set(),generation:job.generation};runtimes.set(id,record);
    child.stdout.on('data',d=>diagnostic(d.toString()));child.stderr.on('data',d=>diagnostic(d.toString()));
    child.once('error',()=>{record.serving=false;});
    child.once('exit',()=>{record.serving=false;for(const socket of record.sockets)socket.destroy();runtimes.delete(id);if(!record.stopping)void onExit(id,record.generation).catch(()=>{});});
   }
   let lastError;
   for(let attempt=0;attempt<startupAttempts;attempt++){
    await check();try{
     const group=await ensureLaptopGroup(identity,command);const record=runtimes.get(id);if(!record||record.child.exitCode!==null)throw new Error('runtime_exited');
     if(!record.cleaned){
      const users=nativeUsers(await command(identity,{action:'users'}),domain);
      for(const user of users.filter(u=>u._id.startsWith(`user/${domain}/mjv-session-`))){
       if(user.siteadmin)throw new Error('unexpected_privileged_viewer');
       await check();await command(identity,{action:'deleteuser',userid:user._id});
      }
      // No guest invitation survives a process restart. Native metadata is the durable cleanup journal.
      const groups=(await command(identity,{action:'meshes'})).meshes;
      if(!Array.isArray(groups))throw new Error('invalid_groups');
      for(const mesh of groups.filter(m=>m.name?.startsWith('MJV guest '))){
       if(!mesh._id?.startsWith(`mesh/${domain}/`))throw new Error('foreign_guest_group');
       await check();await command(identity,{action:'deletemesh',meshid:mesh._id});
      }
      record.cleaned=true;
     }
     record.meshId=group.meshId;record.generation=job.generation;record.serving=true;const url=new URL(`/${domain}/meshagents`,publicOrigin);url.searchParams.set('meshid',group.meshHash);url.searchParams.set('id','4');
     return {...group,server_origin:publicOrigin,windows_download_url:url.href};
    }catch(e){lastError=e;if(!runtimes.has(id))break;await new Promise(r=>setTimeout(r,500));}
   }
   throw new Error(lastError?.message||'runtime_not_ready');
  },
  async inventory(id,guestMeshId=null){
   const r=runtimes.get(id);if(!r?.serving)throw new Error('runtime_unavailable');
   const data=await command(r,{action:'nodes'});const devices=[];
   for(const [group,nodes]of Object.entries(data.nodes||{})){
    if(!group.startsWith(`mesh/${r.domain}/`)||!Array.isArray(nodes))throw new Error('foreign_device_group');
    if(group!==(guestMeshId||r.meshId))continue;
    for(const node of nodes){
     if(typeof node._id!=='string'||!node._id.startsWith(`node/${r.domain}/`)||node.meshid!==group)throw new Error('foreign_device');
     devices.push({id:node._id,name:String(node.name||node.rname||'Windows laptop').slice(0,120),online:!!(node.conn&1),os:String(node.osdesc||'').slice(0,160)});
    }
   }
   return devices.sort((a,b)=>Number(b.online)-Number(a.online)||a.name.localeCompare(b.name)).slice(0,500);
  },
  async removeEnrollment(id,deviceId){
   const r=runtimes.get(id);if(!r?.serving)throw new Error('runtime_unavailable');
   if(typeof deviceId!=='string'||!deviceId.startsWith('node/'+r.domain+'/'))throw new Error('foreign_device');
   if(!(await api.inventory(id)).some(d=>d.id===deviceId))throw new Error('device_unavailable');
   await command(r,{action:'removedevices',nodeids:[deviceId]});
   if((await api.inventory(id)).some(d=>d.id===deviceId))throw new Error('removal_unconfirmed');
   return {removed:true};
  },
  async createGuestGroup(id,inviteId){
   const r=runtimes.get(id);if(!r?.serving||!/^[a-f0-9]{32}$/.test(inviteId))throw new Error('guest_unavailable');
   const name='MJV guest '+inviteId;
   const created=await command(r,{action:'createmesh',meshname:name,meshtype:2,consent:9});
   const group=(await command(r,{action:'meshes'})).meshes?.find(m=>m._id===created.meshid);
   if(!group||!group._id.startsWith(`mesh/${r.domain}/`)||group.mtype!==2||(group.consent&9)!==9||group.name!==name)throw new Error('invalid_guest_group');
   const url=new URL(`/${r.domain}/meshagents`,publicOrigin);url.searchParams.set('meshid',group._id.split('/')[2]);url.searchParams.set('id','4');url.searchParams.set('installflags','1');
   return {meshId:group._id,download_url:url.href};
  },
  async deleteGuestGroup(id,meshId){
   const r=runtimes.get(id);if(!r){if(await api.isStopped(id))return;throw new Error('revocation_unconfirmed');}
   if(!meshId?.startsWith(`mesh/${r.domain}/`)||meshId===r.meshId)throw new Error('invalid_guest_group');
   const groups=(await command(r,{action:'meshes'})).meshes;
   if(!Array.isArray(groups))throw new Error('invalid_groups');
   const group=groups.find(m=>m._id===meshId);
   if(group){if(!/^MJV guest [a-f0-9]{32}$/.test(group.name))throw new Error('invalid_guest_group');await command(r,{action:'deletemesh',meshid:meshId});}
   if((await command(r,{action:'meshes'})).meshes?.some(m=>m._id===meshId&&!m.deleted))throw new Error('revocation_unconfirmed');
  },
  async createViewer(id,deviceId,username,guestMeshId=null){
   const r=runtimes.get(id);if(!r?.serving||!/^mjv-session-[a-f0-9]{32}$/.test(username))throw new Error('viewer_unavailable');
   if(guestMeshId && (!guestMeshId.startsWith(`mesh/${r.domain}/`)||guestMeshId===r.meshId))throw new Error('invalid_guest_group');
   const device=(await api.inventory(id,guestMeshId)).find(d=>d.id===deviceId);if(!device?.online)throw new Error('device_offline');
   const userId=`user/${r.domain}/${username}`;
   try{
    await command(r,{action:'adduser',username,pass:'Aa1!'+randomBytes(48).toString('base64'),siteadmin:0});
    const rights=8+512+1024+2048;
    await command(r,{action:'adddeviceuser',nodeid:deviceId,userids:[userId],rights});
    const user=nativeUsers(await command(r,{action:'users'}),r.domain).find(u=>u._id===userId);
    if(!user||user.siteadmin||Object.keys(user.links||{}).length!==1||user.links[deviceId]?.rights!==rights)throw new Error('viewer_scope_mismatch');
    const url=new URL(`/${r.domain}/`,publicOrigin);url.searchParams.set('login',viewerCookie(r.domain,username,r.keyHex));
    url.searchParams.set('node',deviceId.split('/')[2]);url.searchParams.set('viewmode','11');url.searchParams.set('hide','15');
    return {viewer_url:url.href,viewer_origin:publicOrigin};
   }catch(error){await api.revokeViewer(id,username).catch(()=>{});throw error;}
  },
  async revokeViewer(id,username){
   if(!/^mjv-session-[a-f0-9]{32}$/.test(username))throw new Error('invalid_viewer');
   const r=runtimes.get(id);if(!r){if(await api.isStopped(id))return;throw new Error('revocation_unconfirmed');}
   const userId=`user/${r.domain}/${username}`;
   if(nativeUsers(await command(r,{action:'users'}),r.domain).some(u=>u._id===userId))await command(r,{action:'deleteuser',userid:userId});
   if(nativeUsers(await command(r,{action:'users'}),r.domain).some(u=>u._id===userId))throw new Error('revocation_unconfirmed');
  },
  async stop(id){
   const runtime=runtimes.get(id);if(runtime){
    runtime.serving=false;runtime.stopping=true;for(const socket of runtime.sockets)socket.destroy();
    await new Promise((resolve,reject)=>{
     let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(hard);clearTimeout(deadline);error?reject(new Error('stop_failed')):resolve();};
     const hard=setTimeout(()=>runtime.child.kill('SIGKILL'),3000);const deadline=setTimeout(()=>finish(true),6000);
     runtime.child.once('exit',()=>finish(false));if(runtime.child.exitCode!==null)finish(false);else runtime.child.kill('SIGTERM');
    });
   }
   const state=await store.read(id);if(state){await store.write(id,{...state,keyHex:randomBytes(80).toString('hex')});}
   if(await api.isStopped(id)!==true)throw new Error('stop_unconfirmed');
  },
  async isStopped(id){const runtime=runtimes.get(id);if(runtime)return false;const state=await store.read(id);return !state?.port||await closedPort(state.port);},
  generation(id){const r=runtimes.get(id);return r?.serving?r.generation:null;},
  target(domain){for(const [id,r]of runtimes){if(r.domain===domain&&r.serving)return {organizationId:id,port:r.port,sockets:r.sockets};}return null;},
  async stopAll(){shuttingDown=true;for(const id of [...runtimes.keys()])await api.stop(id);},
 };
 return api;
}
