import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const directory=await mkdtemp(join(tmpdir(),'mjv-engagement-'));
const fixture=`
window.calls=[];
const params=new URLSearchParams(location.search);
const row={id:'a1',activity_type:'viewed',viewer_user_id:'customer',duration_seconds:65,created_at:'2026-10-12T12:00:00Z',metadata:{engagement:{trackingVersion:1,sections:{'room:room1':50,pricing:15},clicks:{approval_clicked:1,payment_clicked:2}}}};
export const supabase={
 async rpc(name,args){window.calls.push({name,args}); if(params.has('staff'))return {data:null,error:null};
  if(params.has('fail') && window.calls.filter(c=>c.name===name).length===1)return {data:null,error:{message:'Temporary failure'}};
  if(name==='start_proposal_engagement')return {data:args.p_proposal_id+'-'+args.p_visit_id,error:null};return {data:true,error:null};},
 from(table){const q=new Proxy({},{get(_,key){if(key==='then')return(resolve,reject)=>Promise.resolve({data:table==='proposal_rooms'?[{id:'room1',name:'Home Theater'}]:[row,{id:'old',activity_type:'viewed',duration_seconds:100,created_at:'2026-10-10T12:00:00Z',metadata:{},ip_address:'Unknown'}],error:params.has('error')?{message:'Denied'}:null}).then(resolve,reject);return()=>q;}});return q;}
};`;
const source=`
import React,{useState,StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import {useProposalEngagement} from './src/hooks/useProposalEngagement';
import {ProposalActivityPanel} from './src/components/Proposals/ProposalActivityPanel';
let now=0,focused=true,visible='visible';Object.defineProperty(performance,'now',{value:()=>now});
Object.defineProperty(document,'hasFocus',{value:()=>focused});Object.defineProperty(document,'visibilityState',{get:()=>visible});
const timers=new Map();let timerId=0;window.setInterval=(callback,ms)=>{timers.set(++timerId,{callback,ms});return timerId;};window.clearInterval=id=>timers.delete(id);
window.advance=seconds=>{for(let i=0;i<seconds;i++){now+=1000;for(const {callback,ms} of [...timers.values()])if(now%ms===0)callback();}};
window.presence=(v,f)=>{visible=v;focused=f;document.dispatchEvent(new Event('visibilitychange'));};
function App(){const [id,setId]=useState('p1');const [enabled,setEnabled]=useState(!location.search.includes('preview'));window.navigate=setId;window.setEnabled=setEnabled;
const root=useProposalEngagement(id,enabled);return <><div ref={root}><div data-engagement-section="room:room1" style={{height:300,paddingTop:90}}><h1>Proposal {id}</h1><button data-engagement-action="approval_clicked">Approve</button><input aria-label="Private comment" /></div><div data-engagement-section="pricing" style={{height:60}}>Pricing</div></div><ProposalActivityPanel proposalId={id}/></>;}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);`;
let browser;
const server=createServer(async(req,res)=>{try{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,file)));}catch{res.writeHead(404);res.end();}});
try{
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/\/lib\/supabase$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js'}));}}]});
 const css=(await readdir('dist/assets')).find(f=>f.startsWith('index-')&&f.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port;
 await page.goto(url);await page.getByRole('heading',{name:'Activity'}).waitFor();
 await page.waitForFunction(()=>window.calls.filter(c=>c.name==='start_proposal_engagement').length>=1);
 const visits=await page.evaluate(()=>window.calls.filter(c=>c.name==='start_proposal_engagement').map(c=>c.args.p_visit_id));
 assert.equal(new Set(visits).size,1,'StrictMode initialization retries same visit');
 await page.evaluate(()=>window.advance(30));await page.waitForFunction(()=>window.calls.some(c=>c.name==='report_proposal_engagement'&&c.args.p_seconds===30));
 await page.getByRole('button',{name:'Approve',exact:true}).click();
 await page.waitForFunction(()=>window.calls.some(c=>c.args.p_clicks?.approval_clicked===1));
 await page.getByRole('textbox',{name:'Private comment'}).fill('PRIVATE DO NOT COLLECT');
 assert.equal((await page.evaluate(()=>JSON.stringify(window.calls))).includes('PRIVATE DO NOT COLLECT'),false);
 await page.evaluate(()=>{window.presence('hidden',false);window.advance(60);window.presence('visible',true);window.advance(15);});
 await page.waitForFunction(()=>window.calls.some(c=>c.args.p_seconds===45));
 await page.evaluate(()=>window.advance(90));await page.waitForFunction(()=>window.calls.some(c=>c.args.p_seconds===90));
 assert.equal(await page.evaluate(()=>Math.max(...window.calls.filter(c=>c.name==='report_proposal_engagement').map(c=>c.args.p_seconds))),90,'Idle and hidden time excluded');
 const oldIds=await page.evaluate(()=>window.calls.filter(c=>c.name==='report_proposal_engagement').map(c=>c.args.p_activity_id));
 await page.evaluate(()=>window.navigate('p2'));await page.getByRole('heading',{name:'Proposal p2'}).waitFor();await page.evaluate(()=>window.advance(15));
 await page.waitForFunction(()=>window.calls.some(c=>c.name==='report_proposal_engagement'&&c.args.p_activity_id.startsWith('p2-')));
 const second=await page.evaluate(()=>window.calls.find(c=>c.name==='start_proposal_engagement'&&c.args.p_proposal_id==='p2').args.p_visit_id);
 assert.ok(!visits.includes(second));assert.ok(oldIds.every(id=>id.startsWith('p1-')));
 const tab=await browser.newPage();await tab.goto(url);await tab.waitForFunction(()=>window.calls.some(c=>c.name==='start_proposal_engagement'));
 assert.notEqual(await tab.evaluate(()=>window.calls.find(c=>c.name==='start_proposal_engagement').args.p_visit_id),visits[0]);await tab.close();
 for(const width of [390,1280]){await page.setViewportSize({width,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await page.getByText('Most active viewing in Home Theater.',{exact:false}).isVisible());if(process.env.ENGAGEMENT_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.ENGAGEMENT_SCREENSHOT_DIR,'activity-'+width+'.png'),fullPage:true});}
 assert.ok(await page.getByText('Older records contain 1m 40s',{exact:false}).isVisible());
 await page.goto(url+'?preview');await page.getByRole('heading',{name:'Activity'}).waitFor();await page.evaluate(()=>window.advance(30));assert.equal(await page.evaluate(()=>window.calls.length),0,'Previews never call tracking');
 await page.goto(url+'?staff');await page.getByRole('heading',{name:'Activity'}).waitFor();await page.evaluate(()=>window.advance(30));assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name==='report_proposal_engagement')),false,'Employee denial stops heartbeats');
 await page.goto(url+'?fail');await page.getByRole('heading',{name:'Activity'}).waitFor();await page.evaluate(()=>window.advance(15));await page.waitForFunction(()=>window.calls.filter(c=>c.name==='start_proposal_engagement').length>=2);await page.evaluate(()=>window.advance(15));await page.waitForFunction(()=>window.calls.some(c=>c.name==='report_proposal_engagement'));await page.evaluate(()=>window.advance(15));
 const retries=await page.evaluate(()=>window.calls.filter(c=>c.name==='start_proposal_engagement').map(c=>c.args.p_visit_id));assert.equal(new Set(retries).size,1);
 await page.goto(url+'?error');await page.getByRole('alert').waitFor();assert.equal(await page.getByText('No customer activity recorded yet.').count(),0,'Permission failure is not empty history');
 assert.deepEqual(errors,[]);console.log('Browser: real hook, StrictMode, tab/navigation isolation, idle/background, retry, preview, privacy, summary, and mobile layout pass');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
