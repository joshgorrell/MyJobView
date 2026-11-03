import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const directory=await mkdtemp(join(tmpdir(),'mjv-proposal-header-'));
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{ProposalLockControl,ProposalReviewControls}from'./src/components/Proposals/ProposalReviewControls';import{proposalPresentation,proposalStatusLabel}from'./src/lib/proposalPresentation';const params=new URLSearchParams(location.search);const state=proposalPresentation({status:params.get('status')||'expired',is_locked:!params.has('unlocked'),is_portal_visible:!params.has('hidden'),is_active_revision:!params.has('inactive')});window.actions=[];window.presentation=state;createRoot(document.getElementById('root')).render(<div className="theme-workspace"><header className="flex flex-wrap items-center gap-2 p-3 bg-canvas text-primary">{state.locked&&<ProposalLockControl onUnlock={()=>window.actions.push('unlock')}/>}<span>{proposalStatusLabel(state.status)}</span><ProposalReviewControls expired={state.expired} onReactivate={()=>window.actions.push('reactivate')} onPreview={()=>window.actions.push('preview')}/></header><p>{state.portalLabel}</p></div>);`;
let browser;const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,file)));});
try{
 await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',outfile:join(directory,'app.js')});const css=(await readdir('dist/assets')).find(f=>f.startsWith('index-')&&f.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const base='http://127.0.0.1:'+server.address().port;
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:800});await page.goto(base);await page.getByRole('button',{name:'Preview as Customer'}).waitFor();assert.ok(await page.getByText('Expired — customer approval closed',{exact:true}).isVisible());assert.equal(await page.getByText('Locked / Live',{exact:true}).count(),0);assert.ok(await page.getByRole('button',{name:'Preview as Customer'}).isEnabled());
  for(const [name,action]of [['Editing locked — unlock options','unlock'],['Preview as Customer','preview'],['Reopen for Customer','reactivate']]){await page.getByRole('button',{name,exact:true}).click();assert.equal((await page.evaluate(()=>window.actions)).at(-1),action);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 for(const [query,label]of [['?status=sent','On customer portal'],['?status=sent&unlocked','Editing — changes not published'],['?status=approved','Approved — on customer portal'],['?status=declined','Declined — customer approval closed'],['?status=sent&inactive','Not on customer portal'],['?status=designing&hidden','Not on customer portal']]){
  await page.goto(base+query);await page.getByText(label,{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Reopen for Customer',exact:true}).count(),0);
 }
 for(const [status,label] of [['designing','Designing'],['sent','Sent to Customer'],['portal','Sent to Customer'],['viewed','Viewed by Customer'],['expired','Expired']]) {
  await page.goto(base+'?status='+status);await page.locator('header').getByText(label,{exact:true}).waitFor();
 }
 assert.deepEqual(errors,[]);console.log('Proposal header: expired/published/locked state separation, readable enabled Preview, Reactivate/unlock callbacks, and mobile/desktop layout pass');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
