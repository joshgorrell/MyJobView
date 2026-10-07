import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
const dir = await mkdtemp(join(tmpdir(), 'preview-'));
const fixture = `window.writes=[];window.opens=[];window.open=(...args)=>window.opens.push(args);
const proposal={id:'p',title:'Customer Preview Test',proposal_number:'P-100',status:new URLSearchParams(location.search).get('status')||'sent',contacts:{full_name:'Bruce Willis'},total:1500,subtotal:1500,tax:0,deposit_amount_due:500,deposit_invoice_id:'inv',expires_at:location.search.includes('expired')?'2020-01-01':'2099-01-01'};
export const supabase={from(table){let single=false;const result=()=>Promise.resolve({error:null,data:table==='proposals'?proposal:table==='invoices'?[{id:'inv',invoice_number:'DEP-100',invoice_type:'deposit',status:'submitted',qbo_invoice_id:'qbo',total:500,amount_due:500,amount_paid:0}]:single?null:[]});const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>result().then(a,b);if(key==='single'||key==='maybeSingle')return()=>{single=true;return result()};if(['insert','update','delete','upsert','rpc'].includes(key))return(...args)=>{window.writes.push([table,key,args]);return q};return()=>q}});return q}};`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {PortalProposalDetail} from './src/components/Portal/PortalProposalDetail';createRoot(document.getElementById('root')).render(<PortalProposalDetail proposalId="p" onBack={()=>{}} previewMode={true}/>);`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(dir,'app.js'),plugins:[{name:'fixture',setup(b){b.onResolve({filter:/lib\/supabase$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture}));}}]});
const css=(await readdir('dist/assets')).find(x=>x.startsWith('index-')&&x.endsWith('.css'));
await writeFile(join(dir,'style.css'),await readFile('dist/assets/'+css));
await writeFile(join(dir,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(dir,file)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'Approve Proposal',exact:true}).waitFor();
 for(const name of ['Approve Proposal','Ask Questions / Comment','Pay Deposit Now','Pay Now'])assert.ok(await page.getByRole('button',{name,exact:true}).isDisabled(),name);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(await page.evaluate(()=>window.writes),[]);assert.deepEqual(await page.evaluate(()=>window.opens),[]);
 console.log(width+': preview renders; approval, messages, and payments disabled; no writes, payment windows, or horizontal overflow');}
 await page.goto('http://127.0.0.1:'+server.address().port+'?expired');await page.getByRole('button',{name:'Request Reactivation',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Request Reactivation',exact:true}).isDisabled());assert.deepEqual(await page.evaluate(()=>window.writes),[]);assert.deepEqual(errors,[]);console.log('Expired preview: reactivation blocked; no browser errors');
} finally {await browser?.close();server.close();await rm(dir,{recursive:true,force:true});}
