// Real Windows agent + browser smoke. Disposable hosted VM only; never emits production activation evidence.
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createStateStore} from '../../../services/assist/state-store.mjs';
import {createManagedRuntime} from '../../../services/assist/managed-runtime.mjs';
import {createControlServer} from '../../../services/assist/control-server.mjs';
import {meshCommand,viewerCookie} from '../../../services/assist/meshcentral-client.mjs';
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.RUNNER_ARCH!=='X64'||process.env.GITHUB_REPOSITORY!=='joshgorrell/MyJobView')throw Error('Disposable hosted Windows x64 VM required');
const dir=await mkdtemp(join(tmpdir(),'mjv-real-agent-'));
const org=randomUUID(),other=randomUUID(),store=createStateStore(join(dir,'state'));
const domain='mjv-'+org.replaceAll('-',''),otherDomain='mjv-'+other.replaceAll('-','');
const stateFile=join(dir,'target.json'),exe=join(dir,'agent.exe');
let runtime,app,tlsServer,target,browser,installed=false,diagnostics='';
const sockets=new Set();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=60000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const result=await fn();if(result)return result;}catch(error){last=error;}await sleep(250);}throw Error('Windows test condition timed out'+(last?': '+last.message:''));}
async function run(file,args,timeout=45000){return new Promise((resolve,reject)=>{const child=spawn(file,args,{stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Test subprocess timed out'));},timeout);child.stdout.on('data',data=>output=(output+data).slice(-4096));child.stderr.on('data',data=>output=(output+data).slice(-4096));child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('Test subprocess failed: '+output));});});}
const ps=(mode,username)=>run('pwsh',['-NoProfile','-STA','-File',resolve('tests/assist/windows/agent-desktop.ps1'),'-Mode',mode,...(username?['-ViewerName',username]:[])]);
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function targetState(){return JSON.parse(await readFile(stateFile,'utf8'));}
try{
 const publicPort=await freePort(),origin=`https://127.0.0.1:${publicPort}`;
 for(const id of [org,other])await store.write(id,{organization_id:id,generation:1,desired_enabled:true,phase:'applying'});
 runtime=createManagedRuntime({store,entry:resolve('services/assist/node_modules/meshcentral/meshcentral.js'),approvedVersion:'1.3.1',publicOrigin:origin,agentCacheDirectory:resolve(process.env.ASSIST_TEST_AGENT_CACHE),diagnostic:s=>{diagnostics=(diagnostics+s).slice(-8192);}});
 await runtime.verifyVersion();const provision=await runtime.ensure({organization_id:org,generation:1},async()=>{});await runtime.ensure({organization_id:other,generation:1},async()=>{});
 app=createControlServer({runtime,plane:{reconcile:async()=>{throw Error('Not a production control plane');}},token:randomBytes(32).toString('hex')});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const certPath=join(store.root,'instances',org);
 tlsServer=https.createServer({cert:await readFile(join(certPath,'webserver-cert-public.crt')),key:await readFile(join(certPath,'webserver-cert-private.key'))},(request,response)=>{
  const upstream=http.request({host:'127.0.0.1',port:app.address().port,path:request.url,method:request.method,headers:request.headers},incoming=>{response.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(response);});upstream.on('error',()=>response.destroy());request.pipe(upstream);
 });
 tlsServer.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
 tlsServer.on('upgrade',(request,socket,head)=>{
  const upstream=net.connect(app.address().port,'127.0.0.1');sockets.add(upstream);const close=()=>{socket.destroy();upstream.destroy();sockets.delete(upstream);};socket.on('error',close);upstream.on('error',close);socket.on('close',close);upstream.on('close',close);
  upstream.once('connect',()=>{upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`+Object.entries(request.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
 });
 await new Promise(r=>tlsServer.listen(publicPort,'127.0.0.1',r));
 // Trust relaxation applies only to this fresh loopback TLS fixture, never to a remote host or global Node TLS.
 const url=new URL(provision.windows_download_url);assert.equal(url.origin,origin);
 const bytes=await new Promise((resolve,reject)=>{https.get(url,{rejectUnauthorized:false,family:4,lookup:(_host,_opts,cb)=>cb(null,'127.0.0.1',4)},response=>{if(response.statusCode!==200){response.resume();return reject(Error('Native agent download failed'));}const parts=[];response.on('data',p=>parts.push(p));response.on('end',()=>resolve(Buffer.concat(parts)));response.on('error',reject);}).on('error',reject);});
 assert.ok(bytes.length>1000000);assert.equal(bytes.subarray(0,2).toString(),'MZ');await writeFile(exe,bytes);
 console.log('Installing verified-cache Windows x64 agent on disposable VM');installed=true;await run(exe,['-fullinstall']);
 const device=await until(async()=>{const devices=await runtime.inventory(org);return devices.find(d=>d.online);},120000);
 assert.ok(device.id.startsWith(`node/${domain}/`));assert.equal((await runtime.inventory(other)).length,0);
 target=spawn('pwsh',['-NoProfile','-STA','-File',resolve('tests/assist/windows/agent-desktop.ps1'),'-Mode','target','-StatePath',stateFile],{stdio:['ignore','ignore','pipe']});target.stderr.on('data',s=>{diagnostics=(diagnostics+s).slice(-8192);});
 await until(targetState);browser=await chromium.launch({headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true});
 async function openViewer(username){const viewer=await runtime.createViewer(org,device.id,username);const page=await context.newPage();await page.goto(viewer.viewer_url);await page.locator('#connectbutton1').waitFor();await page.locator('#connectbutton1').click();return {page,viewer};}
 const denyUser='mjv-session-'+randomBytes(16).toString('hex');
 const denied=await openViewer(denyUser);await ps('peek',denyUser);
 assert.equal(await denied.page.evaluate(()=>!!globalThis.desktop?.m?.FirstDraw),false,'No desktop frames before local consent');
 await ps('deny',denyUser);await until(async()=>denied.page.evaluate(()=>!globalThis.desktop||globalThis.desktop.State===0));
 assert.equal(await denied.page.evaluate(()=>!!globalThis.desktop?.m?.FirstDraw),false,'Deny never reveals desktop');await runtime.revokeViewer(org,denyUser);await denied.page.close();
 const username='mjv-session-'+randomBytes(16).toString('hex');const allowed=await openViewer(username);await ps('peek',username);
 assert.equal(await allowed.page.evaluate(()=>!!globalThis.desktop?.m?.FirstDraw),false);await ps('allow',username);
 await allowed.page.waitForFunction(()=>globalThis.desktop?.m?.FirstDraw===true,{},{timeout:60000});
 const sample=await targetState();
 await until(async()=>allowed.page.evaluate(({panel,rgb})=>{const c=document.getElementById('Desk');if(!c)return false;const p=c.getContext('2d').getImageData(panel.x,panel.y,1,1).data;return rgb.every((v,i)=>Math.abs(p[i]-v)<15);},sample));
 await allowed.page.evaluate(({x,y})=>{const m=globalThis.desktop.m,c=document.getElementById('Desk'),r=c.getBoundingClientRect();const e={pageX:r.left+scrollX+x*c.clientWidth/c.width,pageY:r.top+scrollY+y*c.clientHeight/c.height,which:1};m.SendMouseMsg(m.KeyAction.DOWN,e);m.SendMouseMsg(m.KeyAction.UP,e);},sample.textbox);
 const challenge='mjv'+randomBytes(12).toString('hex');await allowed.page.evaluate(text=>{for(const c of text){desktop.m.SendKeyUnicode(1,c.charCodeAt(0));desktop.m.SendKeyUnicode(2,c.charCodeAt(0));}},challenge);
 await until(async()=>(await targetState()).text===challenge);
 console.log('Real native consent deny/allow, browser desktop pixels, remote mouse and keyboard passed');
 await runtime.revokeViewer(org,username);await until(async()=>allowed.page.evaluate(()=>!globalThis.desktop||globalThis.desktop.State===0));
 const before=(await targetState()).text;await allowed.page.evaluate(()=>{if(globalThis.desktop?.m)desktop.m.SendKeyUnicode(1,88);});await sleep(1000);assert.equal((await targetState()).text,before,'Revoked viewer cannot keep typing');
 const replay=await browser.newContext({ignoreHTTPSErrors:true});const oldPage=await replay.newPage();await oldPage.goto(allowed.viewer.viewer_url);await sleep(1000);assert.equal(await oldPage.locator('#connectbutton1').count(),0,'Old viewer URL cannot authenticate');await replay.close();
 const b=await store.read(other),foreignUsername='mjv-session-'+randomBytes(16).toString('hex');await meshCommand({port:b.port,domain:otherDomain,keyHex:b.keyHex},{action:'adduser',username:foreignUsername,pass:'Aa1!'+randomBytes(32).toString('hex'),siteadmin:0});
 const foreign=new URL(allowed.viewer.viewer_url);foreign.searchParams.set('login',viewerCookie(otherDomain,foreignUsername,b.keyHex));
 const foreignContext=await browser.newContext({ignoreHTTPSErrors:true});const foreignPage=await foreignContext.newPage();await foreignPage.goto(foreign.href);await sleep(1000);assert.equal(await foreignPage.locator('#connectbutton1').count(),0,'Other dealer cookie cannot access target desktop');await foreignContext.close();
 await runtime.stop(org);assert.equal(runtime.target(domain),null);assert.ok(runtime.target(otherDomain));
 console.log(JSON.stringify({test:'isolated-windows-browser-to-agent',desktop_control:true,consent_enforced:true,cross_tenant_denied:true,viewer_revocation:true,activation_evidence:false}));
}catch(error){console.error('Isolated Windows test failed:',error.message.replace(/https?:\/\/\S+/g,'[URL redacted]'));console.error(diagnostics.replace(/auth=[^&\s]+/g,'auth=[redacted]'));throw Error('Real Windows agent test failed; no activation proof issued');}
finally{
 if(browser)await browser.close().catch(()=>{});
 if(target){await writeFile(stateFile+'.stop','stop').catch(()=>{});await sleep(500);if(target.exitCode===null)target.kill();}
 if(installed)await run(exe,['-fulluninstall'],30000).catch(()=>{});
 if(runtime)await runtime.stopAll().catch(()=>{});
 for(const socket of sockets)socket.destroy();
 if(tlsServer)await new Promise(r=>tlsServer.close(r));
 if(app){app.closeAllConnections();await new Promise(r=>app.close(r));}
 await rm(dir,{recursive:true,force:true});
}
