import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const directory=await mkdtemp(join(tmpdir(),'mjv-feedback-links-'));
const fixture=`
const profile={id:'owner',organization_id:'org',role:'admin'};
export const useAuth=()=>({profile});
window.navigations=[];window.queries=[];
const row={id:'email-old',recipient_name:'Older Customer',recipient_email:'customer@example.com',sender_name:'Josh',status:'sent',created_at:'2026-09-01T12:00:00Z',message_count:2};
const old={id:'response-old',kind:'message',choice:'considering',step:'Need more information',message:'Original response that triggered the older alert.',created_at:'2026-09-02T12:00:00.123456+00:00'};
const newer={...old,id:'response-new',message:'Later response from the same customer.',created_at:'2026-10-01T12:00:00.654321+00:00'};
const notices=[old,newer].map((event,i)=>({id:'notice-'+i,type:'review_request',related_id:row.id,title:'Proposal check feedback received',body:event.message,is_read:false,created_at:event.created_at}));
export const supabase={from(table){const filters={};let options={},single=false;const result=()=>{window.queries.push({table,filters});if(options.head)return{data:null,count:1};
 if(table==='notifications')return{data: notices,error:null};
 if(table==='proposal_check_reporting')return{data:single?(filters.id===row.id?row:null):[],error:null};
 if(table==='proposal_check_events') {const events=[newer,old].filter(e=>(!filters.id||e.id===filters.id)&&(!filters.created_at||e.created_at===filters.created_at));return{data:single?(events[0]||null):events,error:null};}
 return{data:[],error:null};};const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>Promise.resolve(result()).then(a,b);if(key==='maybeSingle')return()=>{single=true;return Promise.resolve(result())};if(key==='select')return(_fields,o)=>{options=o||{};return q};if(key==='eq')return(k,v)=>{filters[k]=v;return q};return()=>q;}});return q;},channel(){const q={on(){return q},subscribe(){return q}};return q},removeChannel(){}};
`;
const source=`import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';import{NotificationBell}from'./src/components/Notifications/NotificationBell';import History from './src/components/Reviews/ProposalCheckHistory';document.documentElement.dataset.theme='dark';function App(){const[tab,setTab]=useState(new URLSearchParams(location.search).get('tab')||'feed');useEffect(()=>{const changed=()=>setTab(new URLSearchParams(location.search).get('tab')||'feed');window.addEventListener('popstate',changed);return()=>window.removeEventListener('popstate',changed)},[]);return <div className="theme-workspace"><header><NotificationBell onLeadClick={()=>{}} onTabChange={tab=>{window.navigations.push(tab);setTab(tab)}}/></header>{tab==='reviews'?<History refreshKey={0}/>:<p>Main page</p>}</div>}createRoot(document.getElementById('root')).render(<App/>);`;
const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,file)))});
let browser;
try{
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/supabase$|contexts\/AuthContext$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js',resolveDir:process.cwd()}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;
 for(const width of[320,390,768,1440]){
  await page.setViewportSize({width,height:850});await page.goto(url);await page.getByRole('button',{name:'Notifications',exact:true}).click();await page.getByRole('button',{name:/Original response that triggered/}).click();
  let dialog=page.getByRole('dialog',{name:'Proposal check response',exact:true});await dialog.waitFor();await dialog.getByText('Original response that triggered the older alert.',{exact:true}).waitFor();assert.equal(await dialog.getByText('Later response from the same customer.').count(),0);assert.ok(page.url().includes('reviewType=proposal'));assert.equal(await page.evaluate(()=>window.navigations[0]),'reviews');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await dialog.getByRole('button',{name:'Close',exact:true}).click();assert.equal(new URL(page.url()).searchParams.has('proposalCheckEmailId'),false);
  // A second alert while already on the same page must open a new exact response.
  await page.getByRole('button',{name:'Notifications',exact:true}).click();await page.getByRole('button',{name:/Later response from the same customer/}).click();await dialog.getByText('Later response from the same customer.',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'All activity & messages',exact:true}).click();await page.getByRole('dialog',{name:'Proposal check activity'}).getByText('Original response that triggered the older alert.',{exact:true}).waitFor();
  // Emailed alerts use the exact event ID, independently of list pagination.
  await page.goto(url+'/?tab=reviews&reviewType=proposal&proposalCheckEmailId=email-old&proposalCheckEventId=response-old');await dialog.getByText('Original response that triggered the older alert.',{exact:true}).waitFor();
  await page.goto(url+'/?tab=reviews&reviewType=proposal&proposalCheckEmailId=email-old&proposalCheckEventId=deleted-response');await page.getByRole('alert').getByText(/no longer available/).waitFor();assert.equal(await dialog.count(),0);
  await page.goto(url+'/?tab=reviews&reviewType=proposal&proposalCheckEmailId=foreign-email&proposalCheckEventId=response-old');await page.getByRole('alert').getByText(/no longer available/).waitFor();assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>window.queries.some(q=>q.table==='proposal_check_events')),false);
  console.log(width+'px: exact older/newer alert, same-page navigation, email event link, history, missing and inaccessible responses pass');
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
