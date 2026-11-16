import {build} from 'esbuild';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'mailbox-mapping-'));
const fixture=`window.calls=[];window.failStatus=location.search.includes('failed');
const box={id:'box',display_name:'Bobbi Holthaus',extension_number:'108',extension_type:'User',enabled:false,default_department:null,primary_user_id:null,escalation_minutes:120,version:0};let recipients=[];
export const supabase={functions:{async invoke(name,options){window.calls.push({name,...options});
if(name==='ringcentral-connection-management'||name==='ringcentral-mailbox-diagnostics'){
 if(window.failStatus)return {data:null,error:{context:new Response('{}',{status:503})}};
 if(name==='ringcentral-connection-management')return {data:{connections:[{accountId:'123',status:'connected',mailboxes:[{extensionId:'456',enabled:true}]}]}};
 return {data:{connections:[{status:'connected',extension_number:'101',extension_name:'Josh Gorrell',registered_mailbox:true,mailbox_enabled:true,subscription_check:'active'}],mailboxes:[{extension_id:'456',enabled:true,display_name:'Josh Gorrell'}]}};
}
if(name==='ringcentral-webhook-subscription')return {data:{status:'renewed'},error:null};if(options.method==='PUT'){Object.assign(box,{enabled:options.body.enabled,default_department:options.body.department,primary_user_id:options.body.primaryUserId,escalation_minutes:options.body.escalationMinutes,version:box.version+1});recipients=options.body.recipients.map(r=>({...r,mailbox_id:'box'}));return {data:{saved:true}};}if(options.method==='POST')return {data:options.body.action==='scan'?{queued:2}:{discovered:1}};return {data:structuredClone({mailboxes:[box],recipients,people:[{id:'bobbi',full_name:'Bobbi Holthaus',email:'bobbi@electroniclife.com',my_job_view_enabled:true},{id:'josh',full_name:'Josh Gorrell',email:'josh@electroniclife.com',my_job_view_enabled:true}]})};}}};`;
let browser;
const server=createServer(async(req,res)=>{const name=req.url==='/app.js'?'app.js':req.url==='/style.css'?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
try{
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RingCentralMailboxMapping}from'./src/components/Admin/RingCentralMailboxMapping';import{RingCentralSettings}from'./src/components/Admin/RingCentralSettings';createRoot(document.getElementById('root')).render(location.search.includes('status')?<RingCentralSettings/>:<RingCentralMailboxMapping/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:fixture,loader:'js'}));}}]});
 await writeFile(join(directory,'input.css'),'@tailwind base;@tailwind components;@tailwind utilities;');
 execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i',join(directory,'input.css'),'-o',join(directory,'style.css'),'--content','src/components/Admin/RingCentralMailboxMapping.tsx'],{stdio:'pipe'});
 await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div style="max-width:1000px;margin:auto;padding:16px" id="root"></div><script src="/app.js"></script>');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 for(const width of [320,375,390,430,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:/Bobbi Holthaus/}).click();
  await page.getByLabel('Monitor this mailbox').check();await page.getByLabel('Default voicemail department').selectOption('service');await page.getByLabel('Primary voicemail owner').selectOption('bobbi');
  await page.getByLabel('Email voicemail alerts to bobbi@electroniclife.com').check();await page.getByLabel('Voicemail role for Josh Gorrell').selectOption('backup');await page.getByLabel('Email voicemail alerts to josh@electroniclife.com').check();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no overflow at ${width}`);
  await page.getByRole('button',{name:'Save mapping',exact:true}).click();await page.getByText(/Mapping saved and RingCentral notification subscription updated/).waitFor();
  const call=await page.evaluate(()=>window.calls.find(c=>c.method==='PUT'));assert.equal(call.body.primaryUserId,'bobbi');assert.equal(call.body.department,'service');assert.equal(call.body.recipients.find(r=>r.user_id==='bobbi').email_enabled,true);assert.equal(call.body.recipients.find(r=>r.user_id==='josh').recipient_role,'backup');
  await page.getByRole('button',{name:'Import last 14 days'}).click();await page.getByText(/2 earlier voicemails queued/).waitFor();assert.deepEqual(errors,[]);
  console.log(`${width}px: mapping, email, backup, subscription sync and recovery import passed`);await page.close();
 }
 const status=await browser.newPage();await status.goto(`http://127.0.0.1:${server.address().port}?status`);
 await status.getByText('Connected — delivery not yet verified',{exact:true}).waitFor();
 await status.evaluate(()=>{window.failStatus=true;});await status.getByRole('button',{name:'Refresh status',exact:true}).click();
 await status.getByText('Connection status unavailable',{exact:true}).waitFor();assert.equal(await status.getByText('Not connected',{exact:true}).count(),0);assert.equal(await status.getByRole('button',{name:'Connect RingCentral',exact:true}).count(),0);
 await status.goto(`http://127.0.0.1:${server.address().port}?status=failed`);await status.getByText('Connection status unavailable',{exact:true}).waitFor();assert.equal(await status.getByText('Not connected',{exact:true}).count(),0);await status.close();console.log('failed status lookup remains unknown, preserves known connection, and never claims disconnection');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
