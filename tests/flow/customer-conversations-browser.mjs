import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const directory=await mkdtemp(join(tmpdir(),'mjv-conversations-'));
const fixture=`
import {useState} from 'react';
const profile={id:'rep',organization_id:'org',full_name:'Josh'};
export const useAuth=()=>({profile,loading:false});
export const useDepartments=()=>({hasModuleAccess:()=>true});
window.inserts=[];window.queries=[];window.signedPaths=[];
const rows={
 message_threads:[{id:'t1',subject:'Customer question',contact_id:'c1',organization_id:'org',visibility:'public',context_type:'contact',context_id:'c1',last_message_at:'2026-10-07T15:00:00Z'}, {id:'t2',subject:'Private customer note',contact_id:'c1',organization_id:'org',visibility:'internal',context_type:'project',context_id:'p1',last_message_at:'2026-10-07T14:00:00Z'}],
 contacts:[{id:'c1',full_name:'Test Customer',contact_name:'Test Customer',organization_id:'org'}],
 projects:[{id:'p1',name:'Test Project',contact_id:'c1',organization_id:'org'}],
 messages:[{id:'m1',thread_id:'t1',body:'Please adjust the TV',author_type:'customer',author_name:'Test Customer',is_read:false,is_internal:false,created_at:'2026-10-07T15:00:00Z'}, {id:'m2',thread_id:'t1',body:'Private install note',author_type:'staff',author_name:'Josh',is_internal:true,is_read:true,created_at:'2026-10-07T16:00:00Z'}, {id:'m3',thread_id:'t2',body:'Internal history',author_type:'staff',author_name:'Josh',is_internal:true,is_read:true,created_at:'2026-10-07T14:00:00Z'}]
};
export const supabase={from(table){let filters=[],sort,limit=Infinity,single=false,mutation,count=false;const q={select(columns,options){count=!!options?.count;return q},eq(k,v){filters.push(r=>r[k]===v);window.queries.push({table,k,v});return q},in(k,v){filters.push(r=>v.includes(r[k]));window.queries.push({table,k,v});return q},order(k,options={}){sort=[k,options.ascending!==false];return q},limit(n){limit=n;return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(value){mutation=['insert',value];return q},update(value){mutation=['update',value];return q},then(a,b){let data=(rows[table]||[]).filter(r=>filters.every(f=>f(r)));if(mutation?.[0]==='insert'){const row={id:'new-'+window.inserts.length,created_at:new Date().toISOString(),...mutation[1]};window.inserts.push({table,...row});(rows[table]||=[]).push(row);data=[row];}else if(mutation?.[0]==='update')data.forEach(r=>Object.assign(r,mutation[1]));if(sort)data.sort((a,b)=>String(a[sort[0]]).localeCompare(String(b[sort[0]]))*(sort[1]?1:-1));data=data.slice(0,limit);return Promise.resolve({data:single?data[0]||null:data,error:null,count:count?data.length:null}).then(a,b)}};return q},channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){},storage:{from(){return{upload:async()=>({error:null}),getPublicUrl:path=>({data:{publicUrl:'https://example.com/storage/v1/object/public/message-attachments/'+path}}),createSignedUrl:async path=>{window.signedPaths.push(path);return {data:{signedUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Yj4AAAAASUVORK5CYII='},error:null}}}}}};
export function useFlow(){return{events:[{id:1,created_at:'2026-10-07T15:00:00Z',source_table:'messages',source_id:'m1',thread_id:'t1',summary:'Customer question',category:'communication',viewed:false}, ...['direct','department','company'].map((audience_type,i)=>({id:10+i,source_table:'discussion_posts',source_id:'post'+i,audience_type,created_at:'2026-10-07T16:00:00Z',summary:audience_type+' chat',category:'communication',viewed:i===1})), {id:20,source_table:'work_orders',source_id:'w1',created_at:'2026-10-07T17:00:00Z',summary:'Scheduled work',category:'work',viewed:false}],loading:false,error:'',markViewed:async()=>{},refresh:async()=>{}}}
`;
const source=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Flow from './src/components/Flow/Flow';function App(){const [thread,setThread]=useState(new URLSearchParams(location.search).get('threadId'));return <div style={{height:"100dvh"}} className="flex flex-col overflow-hidden"><header className="h-14 shrink-0">Workspace header</header><main className="min-h-0 flex-1 overflow-y-auto p-3"><button onClick={()=>setThread('t2')}>Notification t2</button><Flow createRequested={new URLSearchParams(location.search).has("internal")} openThreadId={thread} projectId={new URLSearchParams(location.search).has('scoped')?'p1':undefined}/></main></div>};createRoot(document.getElementById('root')).render(<App/>);`;
const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,file)));});
let browser;
try{
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/supabase$|contexts\/AuthContext$|contexts\/DepartmentContext$|lib\/flow\/useFlow$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js',resolveDir:process.cwd()}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));
 await writeFile(join(directory,'style.css'),Buffer.concat([await readFile('dist/assets/'+css),await readFile(join(directory,'app.css'))]));
 await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;
 for(const width of [320,375,768,1280]){await page.setViewportSize({width,height:900});await page.goto(url+'?threadId=t1');await page.getByText('Please adjust the TV',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.getByRole('button',{name:'Create in Flow',exact:true}).count(),1);const headerBounds=await page.locator('.flow').boundingBox();for(const button of await page.locator('.flow-heading-actions button').all()){const rect=await button.boundingBox();assert.ok(rect.x>=headerBounds.x&&rect.x+rect.width<=headerBounds.x+headerBounds.width,'Header actions fully visible at '+width);}assert.equal(await page.getByRole('button',{name:'New customer message',exact:true}).count(),0);assert.equal(await page.locator('[title="New Thread"]').count(),0);await page.getByRole('button',{name:'Create in Flow',exact:true}).click();await page.getByRole('group',{name:'Create options'}).waitFor();assert.equal(await page.getByRole('group',{name:'Create options'}).getByRole('button').count(),3);assert.equal(await page.getByRole('button',{name:'New message',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Post update',exact:true}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.keyboard.press('Escape');assert.equal(await page.getByRole('group',{name:'Create options'}).count(),0);await page.screenshot({path:'/tmp/mjv-flow-messages-'+width+'.png'});}
 // Reproduce the real workspace, including its header and bounded main scroll area.
 for (const [width,height] of [[1920,1080],[1440,900],[1366,768],[1280,720],[1024,600],[768,1024],[375,667],[320,568]]) {
  await page.setViewportSize({width,height}); await page.goto(url+'?threadId=t1');
  await page.getByPlaceholder('Type your message…',{exact:true}).waitFor();
  await page.waitForTimeout(100);
  const bounds=await page.evaluate(()=>{
   const main=document.querySelector('main'); const inbox=document.querySelector('.conversation-workspace');
   const composer=document.querySelector('.conversation-reply'); const send=composer.querySelector('[title="Send message"]');
   return {main:main.getBoundingClientRect().toJSON(),inbox:inbox.getBoundingClientRect().toJSON(),composer:composer.getBoundingClientRect().toJSON(),send:send.getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(bounds.overflow,false,'No horizontal overflow at '+width+'x'+height);
  // Very short mobile viewports retain normal page scrolling as a fallback.
  if(height>=720 && width>=768) assert.ok(bounds.send.bottom<=height && bounds.inbox.bottom<=bounds.main.bottom,'Inbox and send fit workspace at '+width+'x'+height+': '+JSON.stringify(bounds));
  assert.ok(bounds.send.right<=width,'Send fits width at '+width);
  await page.locator('.conversation-reply [title="Send message"]').scrollIntoViewIfNeeded();
  assert.ok((await page.locator('.conversation-reply [title="Send message"]').boundingBox()).y < height,'Send remains reachable in short windows');
  await page.screenshot({path:'/tmp/mjv-responsive-'+width+'x'+height+'.png'});
 }
 await page.setViewportSize({width:1440,height:900}); await page.goto(url+'?threadId=t1');
 await page.getByPlaceholder('Type your message…',{exact:true}).waitFor();
 await page.evaluate(()=>{const history=document.querySelector('.conversation-history');const block=document.createElement('div');block.style.height='2000px';history.prepend(block);history.scrollTop=history.scrollHeight;});
 await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);
 assert.ok((await page.getByRole('button',{name:'Send',exact:true}).boundingBox()).y<720,'Reply remains accessible after resize with long history');
 assert.ok(await page.getByText('Unanswered',{exact:true}).count()>=2,'Internal note does not answer customer');
 const reply=page.getByPlaceholder('Type your message…',{exact:true});await reply.fill('Draft for customer one');await page.getByRole('button',{name:'Notification t2',exact:true}).click();await page.getByText('Internal history',{exact:true}).waitFor();
 const checkbox=page.getByRole('checkbox');assert.equal(await checkbox.isChecked(),true);assert.equal(await checkbox.isDisabled(),true);
 assert.equal(await page.getByPlaceholder('Internal note… Type @ to mention a teammate').inputValue(),'','Draft cannot follow user into another thread');await page.getByPlaceholder('Internal note… Type @ to mention a teammate').fill('Keep internal');await page.getByRole('button',{name:'Send',exact:true}).click();await page.waitForFunction(()=>window.inserts.some(i=>i.body==='Keep internal'));assert.equal(await page.evaluate(()=>window.inserts.find(i=>i.body==='Keep internal').is_internal),true);
 await page.goto(url);await page.getByRole('button',{name:'Create in Flow',exact:true}).click();await page.getByRole('button',{name:'Internal chat Teammates, departments or everyone',exact:true}).click();await page.getByPlaceholder('Start a discussion... Use @ to mention users/leads, # for hashtags').waitFor();assert.equal(await page.getByRole('group',{name:'Create options'}).count(),0);await page.goto(url);await page.locator('.flow-row-main').first().click();await page.getByRole('button',{name:'Read full conversation',exact:true}).click();await page.getByText('Please adjust the TV',{exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('tab'),null);
 await page.getByPlaceholder('Type your message…',{exact:true}).fill('Customer reply https://example.com/info');await page.getByRole('button',{name:'Send',exact:true}).click();await page.waitForFunction(()=>window.inserts.some(i=>i.body.startsWith('Customer reply')));assert.equal(await page.evaluate(()=>window.inserts.find(i=>i.body.startsWith('Customer reply')).is_internal),false);assert.equal(await page.evaluate(()=>window.inserts.find(i=>i.body.startsWith('Customer reply')).attachment_type),'link');
 await page.getByRole('button',{name:'Create in Flow',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:/Customer message Start/}).count(),0,'Staff cannot initiate customer conversations');
 await page.getByRole('button',{name:'Activity update Customer or job progress',exact:true}).click();
 await page.getByPlaceholder('What does the team need to know?').waitFor();
 assert.equal(await page.getByRole('group',{name:'Create options'}).count(),0);

 await page.goto(url+'?scoped=1&threadId=t2');await page.getByText('Internal history',{exact:true}).waitFor();assert.equal(await page.getByText('Customer question',{exact:true}).count(),0);assert.ok(await page.evaluate(()=>window.queries.some(q=>q.table==='message_threads'&&q.k==='context_id'&&Array.isArray(q.v)&&q.v.includes('p1'))));
 await page.goto(url);await page.getByRole('tab',{name:'Messages',exact:true}).click();
 const filters=page.getByRole('group',{name:'Message filters'});
 await page.getByText('Customer conversations',{exact:true}).waitFor();assert.equal(await page.locator('.flow-row').count(),3,'All messages includes only coworker events beside customer inbox');
 await filters.getByRole('button',{name:'Customer',exact:true}).click();assert.equal(await page.locator('.flow-row').count(),0);
 await filters.getByRole('button',{name:'Coworkers',exact:true}).click();assert.equal(await page.locator('.flow-row').count(),3);assert.equal(await page.locator('.flow-customer-inbox').count(),0);
 await filters.getByRole('button',{name:'Unread',exact:true}).click();await page.getByText('Customer conversations',{exact:true}).waitFor();assert.equal(await page.locator('.flow-row').count(),2,'Unread excludes viewed coworker events');
 await page.goto(url+'?internal=1');await page.getByPlaceholder('Start a discussion... Use @ to mention users/leads, # for hashtags').waitFor();assert.equal(await page.getByRole('dialog').count(),0,'Header shortcut opens internal chat only');
 assert.deepEqual(errors,[]);console.log('Flow customer conversations: mobile/tablet/desktop, deep links, scoped inbox, customer replies, attachment links and internal-note isolation pass.');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true})}
