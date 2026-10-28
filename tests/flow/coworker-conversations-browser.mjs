import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const dir=await mkdtemp(join(tmpdir(),'mjv-coworkers-'));
const fixture=`
const profile={id:'rep',organization_id:'org',full_name:'Josh'};
export const useAuth=()=>({profile,loading:false});
export const useDepartments=()=>({hasModuleAccess:key=>!(key==='messages'&&location.search.includes('noCustomer'))&&!(key==='feed'&&location.search.includes('noCoworker'))});
window.inserts=[];window.queries=[];window.views=[];
const people=[{id:'rep',full_name:'Josh',username:'josh',is_active:true,organization_id:'org'},{id:'jesse',full_name:'Jesse',username:'jesse',is_active:true,organization_id:'org'}];
const post=(id,content,user,parent_id=null,audience_type='direct')=>({id,content,post_type:'general',user_id:user,parent_id,organization_id:'org',created_at:'2026-10-10T10:00:00Z',audience_type,audience_user_ids:['rep'],audience_department_id:audience_type==='department'?'d1':null,is_private:audience_type!=='company',profiles:{full_name:user==='rep'?'Josh':'Jesse'}});
people.push({id:'julie',full_name:'Julie',username:'julie',is_active:true,organization_id:'org'});
const rows={
 profiles:people, departments:[{id:'d1',display_name:'Install',is_active:true,organization_id:'org'}],
 discussion_posts:[post('r1','Install follow-up','jesse'),post('reply1','Ready for the next visit','rep','r1'),post('r2','Company update','jesse',null,'company'),{...post('r3','Department update','jesse',null,'department'),post_type:'question'}],
 flow_events:[{id:1,source_id:'r1',source_table:'discussion_posts',organization_id:'org',project_id:'p1',contact_id:'c1'},{id:2,source_id:'reply1',source_table:'discussion_posts',organization_id:'org',project_id:'p1',contact_id:'c1'},{id:3,source_id:'r2',source_table:'discussion_posts',organization_id:'org'},{id:4,source_id:'r3',source_table:'discussion_posts',organization_id:'org'}], flow_event_views:[],
 message_threads:[{id:'t1',subject:'Customer question',contact_id:'c1',organization_id:'org',visibility:'public',context_type:'contact',context_id:'c1',last_message_at:'2026-10-10T09:00:00Z'}],
 contacts:[{id:'c1',full_name:'Test Customer',contact_name:'Test Customer',organization_id:'org'}], work_orders:[],
 messages:[{id:'m1',thread_id:'t1',body:'Adjust the TV',author_type:'customer',author_name:'Test Customer',is_read:false,is_internal:false,created_at:'2026-10-10T09:00:00Z'}]
};
if(location.search.includes('longDirectory')) rows.profiles.push(...Array.from({length:80},(_,i)=>({id:'staff-'+i,full_name:'Staff '+i,is_active:true,organization_id:'org'})));
if(location.search.includes('emptyInbox')) {rows.message_threads=[];rows.discussion_posts=[];}
export const supabase={from(table){let filters=[],orders=[],start=0,end=Infinity,single=false,mutation,count=false;const q={
returns(){return q},select(columns,options){count=!!options?.count;return q},eq(k,v){filters.push(r=>r[k]===v);window.queries.push({table,k,v});return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(k,options={}){orders.push([k,options.ascending!==false]);return q},range(a,b){start=a;end=b+1;return q},limit(n){end=n;return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(value){mutation=['insert',value];return q},update(value){mutation=['update',value];return q},upsert(value){mutation=['upsert',value];return q},then(a,b){if(location.search.includes('failedInbox')&&table==='message_threads')return Promise.resolve({data:null,error:{message:'Fixture inbox failure'}}).then(a,b);let data=(rows[table]||[]).filter(r=>filters.every(f=>f(r)));if(mutation?.[0]==='insert'){const value=mutation[1];let row={id:'new-'+window.inserts.length,created_at:new Date().toISOString(),...value};if(table==='discussion_posts'){const parent=rows.discussion_posts.find(p=>p.id===row.parent_id);row={...row,...(parent?{audience_type:parent.audience_type,audience_user_ids:parent.audience_user_ids,is_private:parent.is_private}:{}),profiles:{full_name:'Josh'}};rows.flow_events.push({id:rows.flow_events.length+1,source_id:row.id,source_table:'discussion_posts',organization_id:'org'});}window.inserts.push({table,...row});(rows[table]||=[]).push(row);data=[row];}else if(mutation?.[0]==='upsert'){for(const row of mutation[1]){window.views.push(row);if(!rows.flow_event_views.some(v=>v.event_id===row.event_id&&v.user_id===row.user_id))rows.flow_event_views.push(row);}data=mutation[1];}else if(mutation?.[0]==='update')data.forEach(r=>Object.assign(r,mutation[1]));data=[...data].sort((a,b)=>{for(const[k,asc]of orders){const n=String(a[k]).localeCompare(String(b[k]))*(asc?1:-1);if(n)return n;}return 0;}).slice(start,end);return Promise.resolve({data:single?data[0]||null:data,error:null,count:count?data.length:null}).then(value=>location.search.includes('slowInbox')?new Promise(resolve=>setTimeout(()=>resolve(value),350)):value).then(a,b)} };return q},channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}};
export function useFlow(){return{events:[],loading:false,error:'',markViewed:async()=>{},refresh:async()=>{}}}
`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import Flow from'./src/components/Flow/Flow';createRoot(document.getElementById('root')).render(<div className="workspace-shell"><header style={{height:72,flexShrink:0}}>Workspace navigation</header><main className="p-3"><Flow projectId={location.search.includes('scoped')?'p1':undefined}/></main><footer style={{padding:48}}>Sign Out</footer><footer>Powered by MyJobView</footer></div>);`;
const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(dir,file)));});
let browser;
try {
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(dir,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/supabase$|contexts\/AuthContext$|contexts\/DepartmentContext$|lib\/flow\/useFlow$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js',resolveDir:process.cwd()}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));
 await writeFile(join(dir,'style.css'),Buffer.concat([await readFile('dist/assets/'+css),await readFile(join(dir,'app.css'))]));
 await writeFile(join(dir,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"><style>body{margin:0}.workspace-shell{display:flex;flex-direction:column;min-height:100dvh}.workspace-shell>main{flex:1;min-height:0;overflow:auto}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;
 async function messages(){if(await page.locator('.flow-view-select').isVisible())await page.locator('select.flow-view-select').selectOption('messages');else await page.getByRole('tab',{name:'Messages',exact:true}).click();await page.locator('.flow-customer-inbox').waitFor();}
 const filters=()=>page.getByRole('group',{name:'Message filters'});
 for(const width of[320,375,768,1280]){
  await page.setViewportSize({width,height:900});await page.goto(url);await messages();
  await page.getByRole('heading',{name:'Customer question',exact:true}).first().waitFor();await page.getByRole('heading',{name:'Jesse',exact:true}).first().waitFor();
  assert.equal(await page.locator('.conversation-workspace').count(),1,'All messages share one inbox');assert.equal(await page.locator('.flow-column-head').count(),0);
  await filters().getByRole('button',{name:'Coworkers',exact:true}).click();await page.getByRole('heading',{name:'Coworker conversations',exact:true}).first().waitFor();
  await page.getByRole('heading',{name:'Jesse',exact:true}).first().click();await page.getByText('Ready for the next visit',{exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Customer question',exact:true}).count(),0);
  assert.equal(await page.getByRole('checkbox').count(),0,'Coworker replies have no customer-note toggle');assert.equal(await page.getByTitle('Attach image').count(),0);
  const reply=page.getByPlaceholder('Reply… Type @ to mention a teammate');await reply.fill('Coworker reply '+width);await page.getByTitle('Send message').click();await page.getByText('Coworker reply '+width,{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.inserts.at(-1).table),'discussion_posts');assert.equal(await page.evaluate(()=>window.inserts.at(-1).parent_id),'r1');
  assert.equal(await page.evaluate(()=>window.views.some(v=>v.user_id==='rep'&&v.event_id===1)),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow at '+width);
  const own=await page.getByText('Coworker reply '+width,{exact:true}).evaluate(e=>e.parentElement.parentElement.parentElement.className);assert.match(own,/justify-end/);
  const other=await page.getByText('Install follow-up',{exact:true}).last().evaluate(e=>e.parentElement.parentElement.parentElement.className);assert.match(other,/justify-start/);
  await page.screenshot({path:'/tmp/mjv-coworker-conversation-'+width+'.png'});
  await reply.fill('Draft for Jesse');await filters().getByRole('button',{name:'Customer',exact:true}).click();await page.getByRole('heading',{name:'Customer conversations',exact:true}).first().waitFor();await page.getByRole('heading',{name:'Customer question',exact:true}).first().click();await page.getByText('Adjust the TV',{exact:true}).waitFor();assert.equal(await page.getByPlaceholder('Type your message…').inputValue(),'','Coworker drafts never follow a customer thread');
  await filters().getByRole('button',{name:'Unread',exact:true}).click();if(await page.getByRole('button',{name:'Back to conversations',exact:true}).isVisible())await page.getByRole('button',{name:'Back to conversations',exact:true}).click();await page.getByRole('heading',{name:'Department update',exact:true}).first().waitFor();assert.equal(await page.getByRole('heading',{name:'Jesse',exact:true}).first().count(),0,'Read coworker thread leaves Unread list');
  await page.screenshot({path:'/tmp/mjv-coworker-inbox-'+width+'.png'});
 }

 // New recipient workflow: select by name, create/resume, and route department messages.
 for (const width of [375, 768, 1280]) {
  await page.setViewportSize({width,height:800});await page.goto(url);await messages();
  await page.getByRole('button',{name:'New message',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Julie',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Message',exact:true}).fill('Hello Julie '+width);
  await dialog.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Hello Julie '+width,{exact:true}).last().waitFor();
  assert.deepEqual(await page.evaluate(()=>window.inserts[0].audience_user_ids),['julie']);
  assert.equal(await page.evaluate(()=>window.inserts[0].audience_type),'direct');
  assert.equal(await page.evaluate(()=>window.inserts[0].is_private),true);
  await page.getByRole('button',{name:'New message',exact:true}).click();
  await dialog.getByRole('button',{name:'Julie',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Message',exact:true}).fill('Continue Julie');
  await dialog.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Continue Julie',{exact:true}).last().waitFor();
  assert.equal(await page.evaluate(()=>window.inserts[1].parent_id),'new-0','Same recipients resume the existing conversation');
  await page.getByRole('button',{name:'New message',exact:true}).click();
  await dialog.getByRole('button',{name:'Departments',exact:true}).click();
  await dialog.getByRole('button',{name:'Install',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Message',exact:true}).fill('Install team update');
  await dialog.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Install team update',{exact:true}).last().waitFor();
  assert.equal(await page.evaluate(()=>window.inserts[2].audience_department_id),'d1');
  assert.equal(await page.evaluate(()=>window.inserts[2].audience_type),'department');
  assert.deepEqual(await page.evaluate(()=>window.inserts[2].audience_user_ids),[]);
  // A reduced visual area approximates keyboard occupancy; this is not a physical-device test.
  await page.setViewportSize({width,height:400});
  await page.waitForTimeout(150);
  const send=await page.getByTitle('Send message').boundingBox();
  assert.ok(send.y>=0 && send.y+send.height<=400,'Composer stays within reduced viewport at '+width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,'No outer vertical scrolling');
  await page.screenshot({path:'/tmp/mjv-composer-viewport-'+width+'.png'});
 }
 await page.goto(url);await messages();await filters().getByRole('button',{name:'Coworkers',exact:true}).click();await page.getByRole('heading',{name:'Department update',exact:true}).first().click();await page.getByTitle('Open discussion actions').waitFor();assert.equal(await page.getByTitle('Open discussion actions').getAttribute('href'),'?tab=feed&postId=r3','Task/question actions remain accessible');
 await page.goto(url+'?noCustomer');await messages();await page.getByRole('heading',{name:'Jesse',exact:true}).first().waitFor();assert.equal(await page.evaluate(()=>window.queries.some(q=>q.table==='message_threads')),false,'No customer reads without permission');
 await page.goto(url+'?noCoworker');await messages();await page.getByRole('heading',{name:'Customer question',exact:true}).first().waitFor();assert.equal(await page.evaluate(()=>window.queries.some(q=>q.table==='discussion_posts')),false,'No coworker reads without permission');
 await page.goto(url+'?scoped');await messages();await page.getByRole('heading',{name:'Jesse',exact:true}).first().waitFor();assert.equal(await page.getByRole('heading',{name:'Everyone',exact:true}).count(),0,'Scoped inbox excludes unrelated conversations');

 for (const width of [375,768,1280]) {
  await page.setViewportSize({width,height:800});await page.goto(url+'?emptyInbox');await messages();
  await page.getByRole('heading',{name:'Start a conversation',exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Julie',exact:true}).click();
  await page.screenshot({path:'/tmp/mjv-start-conversation-'+width+'.png'});
  assert.equal(await page.locator('.conversation-list').count(),0);
  assert.equal(await page.locator('.conversation-panel').count(),0);
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('First message from empty inbox');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('First message from empty inbox',{exact:true}).last().waitFor();
  assert.equal(await page.locator('.conversation-start').count(),0);
  if(await page.getByRole('button',{name:'Back to conversations',exact:true}).isVisible())await page.getByRole('button',{name:'Back to conversations',exact:true}).click();
  await page.getByPlaceholder('Search threads...').fill('nobody matches');
  await page.getByText('No conversations match your search.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await page.getByRole('heading',{name:'Julie',exact:true}).first().waitFor();
  await page.screenshot({path:'/tmp/mjv-empty-inbox-fixed-'+width+'.png'});
 }
 // The real workspace chrome and long directories must not clip the first-message form.
 for (const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1280,680]]) {
  await page.setViewportSize({width,height});await page.goto(url+'?emptyInbox&longDirectory');await messages();
  await page.getByRole('button',{name:'Julie',exact:true}).waitFor();
  const send=page.getByRole('button',{name:'Send',exact:true});
  const bounds=await send.boundingBox();
  assert.ok(bounds.y>=0 && bounds.y+bounds.height<=height,JSON.stringify({width,height,bounds}));
  assert.equal(await page.locator('.workspace-shell > footer').first().isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('main').evaluate(el=>el.scrollHeight>el.clientHeight+1),false);
  const scrollers=await page.locator('.team-message-form').evaluate(el=>[...el.querySelectorAll('*')].filter(node=>/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+1).length);
  assert.equal(scrollers,1,'Only the compose body scrolls with a long directory');
  await page.getByRole('searchbox',{name:'Search people',exact:true}).fill('Staff 79');
  await page.getByRole('button',{name:'Staff 79',exact:true}).click();
  assert.equal(await page.getByRole('searchbox',{name:'Search people',exact:true}).count(),0);
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Draft preserved while adding recipients');
  await page.getByRole('button',{name:'Add people',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search people',exact:true}).fill('Julie');
  await page.getByRole('button',{name:'Julie',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Draft preserved while adding recipients');
  await page.screenshot({path:'/tmp/mjv-messages-responsive-'+width+'.png'});
  await send.click();await page.getByText('Draft preserved while adding recipients',{exact:true}).last().waitFor();
  assert.deepEqual(await page.evaluate(()=>window.inserts[0].audience_user_ids),['staff-79','julie']);
 }
 await page.goto(url+'?slowInbox');await messages();
 await page.getByText('Loading messages...',{exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Start a conversation',exact:true}).count(),0);
 await page.getByRole('heading',{name:'Conversations',exact:true}).waitFor();
 await page.goto(url+'?failedInbox');await messages();
 await page.getByRole('heading',{name:'Conversations are unavailable',exact:true}).first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Reload conversations',exact:true}).count(),1);
 assert.equal(await page.getByText('No message threads found',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: Shared All/Customer/Coworkers/Unread inbox, 320/375/768/1280px, coworker reply routing, personal unread state, sender alignment, draft isolation, scope, module access, name-based recipient selection, chat resumption, department routing reduced-viewport composer fit, empty-inbox first send, filtered-empty recovery and load-failure state.');
} finally {await browser?.close();server.close();await rm(dir,{recursive:true,force:true});}
