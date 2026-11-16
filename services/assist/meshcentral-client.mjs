import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';

/** Interoperates with MeshCentral's documented login-token/control protocol. Never log this URL. */
export function managementCookie(domain, keyHex, now = Date.now()) {
  if (!/^mjv-[a-f0-9]{32}$/.test(domain) || !/^[a-f0-9]{160}$/.test(keyHex)) throw new Error('invalid_identity');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex,'hex').subarray(0,32), iv);
  const body = { userid: `user/${domain}/mjv-platform`, domainid: domain, time: Math.floor(now/1000) };
  const payload = Buffer.concat([cipher.update(JSON.stringify(body),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),payload]).toString('base64').replaceAll('+','@').replaceAll('/','$');
}
export async function meshCommand({port,domain,keyHex}, command, {WebSocketImpl = WebSocket, timeout = 8000} = {}) {
  if (!Number.isInteger(port) || port<1024 || port>65535) throw new Error('invalid_port');
  if (!['meshes','createmesh','users','nodes'].includes(command.action)) throw new Error('unsupported_command');
  const correlation = randomUUID();
  const url = new URL(`ws://127.0.0.1:${port}/${domain}/control.ashx`);
  url.searchParams.set('auth',managementCookie(domain,keyHex));
  return new Promise((resolve,reject)=>{
    const socket = new WebSocketImpl(url.href);
    let done = false;
    const finish=(error,result)=>{
      if(done)return;done=true;clearTimeout(timer);
      try{socket.close();}catch{}
      error?reject(new Error('meshcentral_command_failed')):resolve(result);
    };
    const timer=setTimeout(()=>finish(true),timeout);
    socket.addEventListener('open',()=>socket.send(JSON.stringify({...command,responseid:correlation,tag:correlation})));
    socket.addEventListener('message',event=>{
      if(typeof event.data!=='string'||event.data.length>1_048_576)return finish(true);
      let data;try{data=JSON.parse(event.data);}catch{return finish(true);}
      if(data.action==='close')return finish(true);
      if(data.responseid!==correlation && data.tag!==correlation)return;
      if(data.result && data.result!=='ok')return finish(true);
      finish(false,data);
    });
    socket.addEventListener('error',()=>finish(true));socket.addEventListener('close',()=>finish(true));
  });
}
export async function ensureLaptopGroup(identity, request = meshCommand) {
  const prefix=`mesh/${identity.domain}/`;
  const list = async()=>{
    const data=await request(identity,{action:'meshes'});
    if(!Array.isArray(data.meshes)||data.meshes.some(m=>typeof m._id!=='string'||!m._id.startsWith(prefix)))throw new Error('foreign_domain');
    return data.meshes;
  };
  let groups=await list();
  let matching=groups.filter(m=>m.name==='MJV technician laptops');
  if(matching.length>1)throw new Error('ambiguous_group');
  if(!matching.length){
    const created=await request(identity,{action:'createmesh',meshname:'MJV technician laptops',meshtype:2,consent:9});
    if(typeof created.meshid!=='string'||!created.meshid.startsWith(prefix))throw new Error('foreign_domain');
    groups=await list();matching=groups.filter(m=>m._id===created.meshid);
  }
  if(matching.length!==1 || matching[0].mtype!==2 || (matching[0].consent&9)!==9)throw new Error('invalid_group_consent');
  const group=matching[0];
  const links=Object.keys(group.links||{});
  if(links.some(id=>!id.startsWith(`user/${identity.domain}/`) && !id.startsWith(`ugrp/${identity.domain}/`)))throw new Error('foreign_group_identity');
  const hash=group._id.slice(prefix.length);
  if(!/^[a-zA-Z0-9@$+=_-]{32,128}$/.test(hash))throw new Error('invalid_mesh_id');
  return {meshId:group._id,meshHash:hash};
}
