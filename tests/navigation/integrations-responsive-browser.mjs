import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const directory=await mkdtemp(join(tmpdir(),'mjv-integrations-'));
const fixture=`export const useAuth=()=>({profile:{organization_id:'org'}});export const supabase={from(table){const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>Promise.resolve({data:table==='company_settings'?{has_openai_api_key:true,from_email:'support@example.com',google_maps_api_key:'configured',has_twilio_auth_token:true,twilio_account_sid:'configured',twilio_phone_number:'configured'}:table==='organizations'?{id:'org',payment_processor:'quickbooks'}:{is_connected:true,payments_enabled:true},error:null}).then(a,b);return()=>q;}});return q;},functions:{invoke:async()=>({data:{connections:[{status:'connected'}]},error:null})},rpc:async()=>({data:{activeConnections:1},error:null})};`;
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {IntegrationsSettings} from './src/components/Admin/IntegrationsSettings';createRoot(document.getElementById('root')).render(<main className="theme-workspace p-3 sm:p-6"><IntegrationsSettings/></main>);`;
const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,file)));});
let browser;
try {
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture}));b.onResolve({filter:/\/(QuickBooksSettings|RingCentralSettings|TechsafeSettings|AssistSettings|TextMessagingSettings|SmsTemplateDrafts)$/},args=>({path:args.path.split('/').at(-1),namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},args=>({contents:`export const ${args.path}=()=>null;`}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));
 await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage({hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height] of [[320,640],[390,844],[430,932],[844,390],[768,1024],[820,1180],[1024,768],[1194,834],[1366,1024],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:'+server.address().port+'/?integration=openai');
  const nav=page.getByRole('navigation',{name:'Third-party integrations'});await nav.getByRole('button',{name:/ChatGPT/}).waitFor();
  await page.waitForFunction(()=>document.querySelector('nav [aria-current="page"]')?.getBoundingClientRect().right<=innerWidth);
  assert.equal(await page.evaluate(()=>document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth),false,`${width}: content overflow`);
  assert.equal(await nav.evaluate(el=>getComputedStyle(el).overflowX),'auto');
  const selected=await nav.locator('[aria-current="page"]').boundingBox();const bounds=await nav.boundingBox();assert.ok(selected.x>=bounds.x-1&&selected.x+selected.width<=bounds.x+bounds.width+1,`${width}: deep-linked tab visible`);
  await nav.getByRole('button',{name:'Assist',exact:true}).click();assert.equal(await nav.getByRole('button',{name:'Assist',exact:true}).getAttribute('aria-current'),'page');
  await nav.getByRole('button',{name:/Payment Processor/}).click();await page.getByText('Use Stripe for payments').waitFor();
  assert.equal(await page.evaluate(()=>document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth),false,`${width}: payment cards overflow`);
  console.log(`${width}x${height}: contained integration panels, scrollable tabs and deep links pass`);
 }
 assert.deepEqual(errors,[]);
} finally {await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
