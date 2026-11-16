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
window.calls=[];let enabled=false;
export const supabase={rpc:async(name,args)=>{window.calls.push({name,args});if(name==='set_assist_enabled'){enabled=args.p_enabled;return {data:{enabled,provisioned:false,windows_download_ready:false}};}if(mode==='error')return {error:new Error('failed')};if(name==='get_assist_setup'&&mode?.startsWith('settings'))return {data:{enabled,provisioned:false,windows_download_ready:false}};if(name==='get_assist_setup')return {data:{enabled:true,provisioned:mode!=='pending',windows_download_ready:mode!=='pending'}};if(mode==='disabled')return {error:new Error('disabled')};return {data:{url:'https://assist.example.com/elife/meshagents?meshid=one&id=4'}};}};
`;
let browser;
const server=createServer(async(req,res)=>{
 const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 res.end(await readFile(join(dir,file)));
});
try{
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import AssistPage from './src/components/Assist/AssistPage';import{AssistSettings}from'./src/components/Admin/AssistSettings';createRoot(document.getElementById('root')).render(location.search.includes('settings')?<AssistSettings/>:<AssistPage/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(dir,'app.js'),plugins:[{name:'fixture',setup(b){b.onResolve({filter:/(lib\/supabase|contexts\/(AuthContext|TenantContext))$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture}));}}]});
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
 await toggle.uncheck();await page.getByRole('status').filter({hasText:'Remote Support is off.'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Assist browser: availability, download, disable, error, dealer mismatch and desktop/mobile layout pass');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
