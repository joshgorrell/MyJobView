import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const directory = await mkdtemp(join(tmpdir(), 'mjv-portal-messages-'));
const existing = await readFile('tests/flow/customer-conversations-browser.mjs','utf8');
let fixture = existing.slice(existing.indexOf('const fixture=`')+15, existing.indexOf('`;\nconst source='));
fixture = fixture.replace("const profile={id:'rep',organization_id:'org',full_name:'Josh'}", "const profile={id:'customer',contact_id:'c1',organization_id:'org',full_name:'Test Customer'}");
fixture = fixture.replace("export const supabase={from(table)", `window.rows=rows;window.listeners=[];window.programAccess=true;window.failSend=false;
rows.message_threads.push({id:'t3',subject:'Proposal conversation',contact_id:'c1',organization_id:'org',visibility:'public',context_type:'proposal',context_id:'prop1',last_message_at:'2026-10-07T17:00:00Z'});
rows.messages.push({id:'m4',thread_id:'t1',body:'Staff public reply',author_type:'staff',author_name:'Josh',is_internal:false,is_read:false,created_at:'2026-10-07T18:00:00Z'});
export const supabase={rpc:async(name,args)=>{
 if(name==='mark_customer_conversation_read'){rows.messages.filter(m=>m.thread_id===args.p_thread&&m.author_type==='staff'&&!m.is_internal).forEach(m=>m.is_read=true);return{error:null};}
 if(name==='get_punchlist_access_info')return{data:[{has_access:window.programAccess}],error:null};
 if(name==='can_reply_customer_conversation')return{data:window.programAccess||args.p_thread==='t3',error:null};
 if(name==='start_customer_conversation'){const id='t4';rows.message_threads.push({id,subject:args.p_subject,context_type:'contact',contact_id:'c1',organization_id:'org',visibility:'public',last_message_at:new Date().toISOString()});return{data:id,error:null};}
},from(table)`);
fixture=fixture.replace("if(mutation?.[0]==='insert'){", "if(mutation?.[0]==='insert'){if(window.failSend)return Promise.resolve({error:new Error('Unavailable')}).then(a,b);");
fixture=fixture.replace("channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}", "channel(){const callbacks=[];const c={on(_,filter,fn){callbacks.push(fn);return c},subscribe(){window.listeners.push(c);return c},emit(){callbacks.forEach(fn=>fn())}};return c},removeChannel(c){window.listeners=window.listeners.filter(v=>v!==c)}");
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import PortalMessages from './src/components/Portal/PortalMessages';createRoot(document.getElementById('root')).render(<PortalMessages/>);`;
const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,file)));});
let browser;
try {
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/supabase$|contexts\/AuthContext$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js',resolveDir:process.cwd()}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));
 await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;
 for (const width of [320,375,768,1280]) {
  await page.setViewportSize({width,height:900});await page.goto(url+'?threadId=t1');
  await page.getByText('Staff public reply',{exact:true}).waitFor();
  assert.equal(await page.getByText('Private install note',{exact:true}).count(),0);
  assert.equal(await page.getByText('Private customer note',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.waitForFunction(()=>window.rows.messages.find(m=>m.id==='m4').is_read);
  const input=page.getByPlaceholder('Type a message...');await input.fill('Portal response');await page.getByRole('button',{name:'Send message'}).click();await page.waitForFunction(()=>window.inserts.some(m=>m.body==='Portal response'));
  assert.equal(await page.evaluate(()=>window.inserts.find(m=>m.body==='Portal response').author_type),'customer');
  await page.evaluate(()=>{window.rows.messages.push({id:'live',thread_id:'t1',body:'Live staff reply',author_name:'Josh',author_type:'staff',is_read:false,is_internal:false,created_at:new Date().toISOString()});window.listeners.forEach(c=>c.emit())});
  await page.getByText('Live staff reply',{exact:true}).waitFor();
  await page.screenshot({path:'/tmp/mjv-portal-messaging-'+width+'.png'});
 }
 await page.locator('input[type=file]').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Yj4AAAAASUVORK5CYII=','base64')});
 await page.getByAltText('Pending attachment').waitFor();await page.getByRole('button',{name:'Send message'}).click();await page.waitForFunction(()=>window.inserts.some(m=>m.attachment_type==='image'));await page.getByAltText('Message attachment').waitFor();assert.ok(await page.evaluate(()=>window.signedPaths.length>0),'Private images are signed for display');
 await page.evaluate(()=>window.failSend=true);await page.getByPlaceholder('Type a message...').fill('Keep my draft');await page.getByRole('button',{name:'Send message'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByPlaceholder('Type a message...').inputValue(),'Keep my draft');
 await page.evaluate(()=>{window.programAccess=false;window.listeners.forEach(c=>c.emit())});await page.waitForFunction(()=>document.querySelector('input[placeholder="Type a message..."]').disabled);
 await page.getByRole('button',{name:/Proposal conversation/}).click();await page.waitForFunction(()=>{const input=document.querySelector('input[placeholder="Type a message..."]');return !input.disabled && input.value==='';});assert.equal(await page.getByPlaceholder('Type a message...').inputValue(),'','Draft cleared between conversations');
 await page.goto(url);await page.getByRole('button',{name:'New message',exact:true}).click();await page.getByLabel('Subject',{exact:true}).fill('Help with my system');await page.getByLabel('Message',{exact:true}).fill('Can you adjust the sound?');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('heading',{name:'Help with my system',exact:true,level:3}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: portal desktop/mobile layouts, live replies, read tracking, customer sends, failed-send drafts, program expiry, proposal access, and new conversations.');
} finally {await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
