import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'mjv-assist-'));
const fixture=`const mode=new URLSearchParams(location.search).get('mode');
export function useAuth(){return {profile:{organization_id:'org-one',role:mode?.startsWith('settings')?'admin':'tech',is_active:true},isPortalUser:false};}
export function useTenant(){return {tenant:{organizationId:mode==='mismatch'?'org-two':'org-one',organizationName:'Electronic Life'},loading:false,error:null};}
window.calls=[];let enabled=mode==='settings-failed';let activation=mode==='settings-failed'?'needs_attention':'off';
export const supabase={rpc:async(name,args)=>{window.calls.push({name,args});if(name==='get_assist_access')return {data:{can_operate:mode==='engineer',windows_download_ready:mode==='engineer'}};if(name==='manage_assist_operators')return {data:{people:[{id:'admin',name:'Administrator',admin:true,granted:true},{id:'jp',name:'Josh Paul',admin:false,granted:args.p_granted===true}]}};if(name==='retry_assist_activation'){activation='activation_pending';return {data:{enabled,activation_state:activation,provisioned:false,windows_download_ready:false}};}if(name==='set_assist_enabled'){enabled=args.p_enabled;activation=enabled?'activation_pending':'deactivation_pending';return {data:{enabled,activation_state:activation,provisioned:false,windows_download_ready:false}};}if(mode==='error')return {error:new Error('failed')};if(name==='get_assist_setup'&&mode?.startsWith('settings'))return {data:{enabled,activation_state:activation,provisioned:false,windows_download_ready:false}};if(name==='get_assist_setup')return {data:{enabled:true,provisioned:mode!=='pending',windows_download_ready:mode!=='pending'}};if(mode==='disabled')return {error:new Error('disabled')};return {data:{url:'https://assist.example.com/elife/meshagents?meshid=one&id=4'}};} ,functions:{invoke:async(name,options)=>{window.edgeCalls.push({name,body:options.body});if(name==='assist-guest'){if(options.body.operation==='redeem')return {data:{invite_id:'guest-invite',claim_token:'test-claim-token',download_url:'https://assist.example.com/mjv-orgone/meshagents?meshid=guest&id='+(options.body.architecture==='arm64'&&mode!=='guest-wrong-architecture'?'43':'4')+'&installflags=1',state:'waiting_for_computer',expires_at:new Date(Date.now()+180000).toISOString()}};return {data:{ended:true,state:'waiting_for_computer',expires_at:new Date(Date.now()+180000).toISOString()}};}if(options.body.operation==='invite_capability')return {data:{available:mode==='engineer'}};if(options.body.operation==='invite_create')return {data:{invite_id:'guest-invite',code:'ABCD-EFGH-JKLM',join_url:'https://elife.myjobview.com/assist#code=ABCD-EFGH-JKLM',state:'waiting_for_guest'}};if(options.body.operation==='invite_status')return {data:{state:'waiting_for_computer'}};if(options.body.operation==='devices')return {data:{devices:[{id:'node/mjv-orgone/online',name:'Jesse laptop',online:true,os:'Windows'},{id:'node/mjv-orgone/offline',name:'Offline laptop',online:false,os:'Windows'}]}};if(options.body.operation==='connect')return {data:{session_id:'viewer-session',viewer_origin:'https://assist.example.com',viewer_url:'https://assist.example.com/mjv-orgone/?login=private-viewer-token',expires_at:new Date(Date.now()+180000).toISOString()}};return {data:{ended:true,active:true}};}}};
window.edgeCalls=[];window.open=()=>({opener:null,closed:false,document:{title:'',body:{textContent:''},createElement:()=>({}),head:{appendChild:()=>{}}},location:{replace:url=>{window.viewerUrl=url}},close(){this.closed=true;}});
`;
let browser;
const server=createServer(async(req,res)=>{
 const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 res.end(await readFile(join(dir,file)));
});
try{
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import AssistPage from './src/components/Assist/AssistPage';import AssistGuestPage from './src/components/Assist/AssistGuestPage';import{AssistSettings}from'./src/components/Admin/AssistSettings';function GuestEntry(){const[code,setCode]=React.useState(new URLSearchParams(location.hash.slice(1)).get('code')||'');React.useEffect(()=>{const update=()=>{const next=new URLSearchParams(location.hash.slice(1)).get('code');if(next!==null)setCode(next)};window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update)},[]);return <AssistGuestPage key={code} initialCode={code}/>;}createRoot(document.getElementById('root')).render(location.search.includes('guest')?<GuestEntry/>:location.search.includes('settings')?<AssistSettings/>:<AssistPage/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(dir,'app.js'),plugins:[{name:'fixture',setup(b){b.onResolve({filter:/(lib\/supabase|contexts\/(AuthContext|TenantContext))$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture}));}}]});
 const css=(await readdir('dist/assets')).find(x=>x.startsWith('index-')&&x.endsWith('.css'));
 await writeFile(join(dir,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(dir,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main class="theme-workspace bg-workspace"><div id="root"></div></main><script src="/app.js"></script></body></html>');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port;
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(url+'?mode=pending');
  await page.getByText('Remote support is being set up',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Download for Windows (64-bit)',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.goto(url+'?mode=ready');
  const button=page.getByRole('button',{name:'Download for Windows (64-bit)',exact:true});await button.waitFor();
  assert.equal(await button.isEnabled(),true);
  if(width===390 && process.env.ASSIST_SCREENSHOT_PATH) await page.screenshot({path:process.env.ASSIST_SCREENSHOT_PATH,fullPage:true});
  await page.evaluate(()=>{document.addEventListener('click',e=>{if(e.target instanceof HTMLAnchorElement){e.preventDefault();window.downloadTarget=e.target.href;}});});
  await button.click();await page.getByRole('status').filter({hasText:'Download requested'}).waitFor();
  assert.match(await page.evaluate(()=>window.downloadTarget),/\/elife\/meshagents/);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='get_assist_windows_download'&&c.args.p_organization_id==='org-one').length),1);
  await page.goto(url+'?mode=disabled');await page.getByRole('button',{name:'Download for Windows (64-bit)',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Download unavailable'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Download for Windows (64-bit)',exact:true}).isDisabled(),true);
 }
 await page.goto(url+'?mode=mismatch');await page.getByRole('alert').filter({hasText:'active employees'}).waitFor();
 assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.goto(url+'?mode=error');await page.getByRole('alert').filter({hasText:'Unable to load'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Download for Windows (64-bit)',exact:true}).isDisabled(),true);
 await page.goto(url+'?mode=settings');
 const toggle=page.getByRole('switch',{name:'Enable Remote Support for this dealer'});
 await toggle.waitFor();await page.getByText('Remote Support is off.',{exact:true}).waitFor();
 await toggle.check();await page.getByRole('status').filter({hasText:'activation is pending'}).waitFor();
 assert.equal(await toggle.isChecked(),true);
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='set_assist_enabled'&&c.args.p_organization_id==='org-one'&&c.args.p_enabled===true).length),1);
 await toggle.uncheck();await page.getByRole('status').filter({hasText:'Turning off'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(url+'?mode=settings-failed');
 await page.getByRole('button',{name:'Retry setup',exact:true}).click();
 await page.getByRole('status').filter({hasText:'activation is pending'}).waitFor();
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='retry_assist_activation'&&c.args.p_organization_id==='org-one').length),1);
 await page.goto(url+'?mode=engineer');
 await page.getByText('Jesse laptop',{exact:true}).waitFor();
 const connect=page.getByRole('button',{name:'Connect',exact:true});assert.equal(await connect.nth(0).isEnabled(),true);assert.equal(await connect.nth(1).isDisabled(),true);
 await connect.nth(0).click();await page.getByText('Support window ready:',{exact:false}).waitFor();
 assert.match(await page.evaluate(()=>window.viewerUrl),/^https:\/\/assist.example.com\/mjv-orgone\//);
 assert.equal((await page.locator('body').innerText()).includes('private-viewer-token'),false);
 await page.getByRole('button',{name:'End session',exact:true}).click();
 await page.waitForFunction(()=>window.edgeCalls.some(c=>c.body.operation==='end'&&c.body.sessionId==='viewer-session'));
 await page.getByRole('searchbox',{name:'Customer, user, or email'}).fill('guest@example.com');
  await page.getByRole('button',{name:'Create invitation',exact:true}).click();
 await page.getByText('ABCD-EFGH-JKLM',{exact:true}).waitFor();
 await page.getByRole('button',{name:'End invitation',exact:true}).click();
 await page.getByRole('button',{name:'Create invitation',exact:true}).waitFor();
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(url+'?mode=guest&width='+width+'#code=ABCD-EFGH-JKLM');
  await page.getByLabel('Support code').waitFor();
  assert.equal(await page.getByLabel('Support code').inputValue(),'ABCD-EFGH-JKLM');
  assert.equal(await page.evaluate(()=>location.hash),'');
  assert.equal(await page.evaluate(()=>window.calls.length),0,'Guest entry requires no staff RPC');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  const download=page.getByRole('link',{name:'Download support app',exact:true});await download.waitFor();
  assert.match(await download.getAttribute('href'),/installflags=1/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal((await page.locator('body').innerText()).includes('test-claim-token'),false);
  await page.getByRole('button',{name:'End session',exact:true}).click();
  await page.getByRole('heading',{name:'Session ended',exact:true}).waitFor();
  await page.evaluate(()=>{location.hash='code=NPQR-STUV-WXYZ';});
  await page.getByLabel('Support code').waitFor();
  assert.equal(await page.getByLabel('Support code').inputValue(),'NPQR-STUV-WXYZ');
 }
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(url+'?mode=guest-arm&width='+width+'#code=ABCD-EFGH-JKLM');
  await page.getByLabel('Computer type').selectOption('arm64');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  const armDownload=page.getByRole('link',{name:'Download support app',exact:true});await armDownload.waitFor();
  assert.equal(new URL(await armDownload.getAttribute('href')).searchParams.get('id'),'43');
  assert.equal(await page.evaluate(()=>window.edgeCalls.find(c=>c.body.operation==='redeem').body.architecture),'arm64');
  await page.getByText('For Windows ARM64.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await page.goto(url+'?mode=guest-wrong-architecture#code=ABCD-EFGH-JKLM');
 await page.getByLabel('Computer type').selectOption('arm64');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'We couldn’t use that code'}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Download support app',exact:true}).count(),0);
 await page.waitForFunction(()=>window.edgeCalls.some(c=>c.body.operation==='end'&&c.body.inviteId==='guest-invite'));
 await page.goto(url+'?mode=settings');await page.getByRole('checkbox',{name:'Josh Paul',exact:true}).check();
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='manage_assist_operators'&&c.args.p_user_id==='jp'&&c.args.p_granted===true).length),1);
 assert.deepEqual(errors,[]);console.log('Assist browser: availability, download, disable, error, dealer mismatch and desktop/mobile layout pass');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
