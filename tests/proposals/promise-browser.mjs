import { build } from 'esbuild';
import { mkdtemp,readFile,readdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const directory=await mkdtemp(join(tmpdir(),'mjv-promise-'));let browser;
const server=createServer(async(req,res)=>{const filename=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,filename)))});
try{
 await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{ProposalPromise}from'./src/components/Portal/ProposalPromise';import{DeliverProposalModal}from'./src/components/Proposals/DeliverProposalModal';createRoot(document.getElementById('root')).render(location.search.includes('delivery')?<DeliverProposalModal proposalId="p" onClose={()=>{}} onDelivered={()=>{}}/>:<main className="max-w-5xl mx-auto p-4"><h1 className="text-2xl text-slate-900 mb-6">Your proposal</h1><ProposalPromise companyName={location.search.includes('other')?'Another Dealer':'Electronic Life'}/><p>Proposal details remain here.</p></main>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/supabase$|contexts\/AuthContext$|lib\/taxCalculations$/},()=>({path:'fixture',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`window.invocations=[];export const useAuth=()=>({profile:{id:'rep',organization_id:'org'}});export const checkTaxFinalizationGuard=()=>null;export const supabase={from(table){const data=table==='proposals'?{id:'p',proposal_number:'P-123',tax_calculation_status:'finalized',contacts:{full_name:'Test Customer',email:'test@example.com'}}:{company_name:'Electronic Life'};const result=()=>Promise.resolve({data,error:null});const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>result().then(a,b);if(key==='maybeSingle')return result;return()=>q}});return q},functions:{invoke:async(name,args)=>{window.invocations.push([name,args]);return {data:name==='generate-proposal-pdf'?'<!DOCTYPE html><html><body>Printable proposal</body></html>':{},error:null}}}}`}));
 }}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"></head><body style="background:#f1f5f9"><div id="root"></div><script src="app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;
 for(const width of [375,390,768,1280]){
  await page.setViewportSize({width,height:950});await page.goto(url);const summary=page.locator('summary');await summary.waitFor();assert.equal(await page.locator('details').getAttribute('open'),null);
  await summary.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.el-promise').isVisible(),true);
  await page.waitForFunction(()=>document.querySelector('.el-promise-logo')?.naturalWidth>0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===390)await page.screenshot({path:'/tmp/promise-recovered-mobile.png',fullPage:true});
  await summary.click();assert.equal(await page.locator('details').getAttribute('open'),null);
 }
 await page.goto(url+'?other');assert.equal(await page.locator('details').count(),0);
 // Verify the rep's choice reaches the real document loader through the delivery dialog.
 await page.goto(url+'?delivery');await page.getByRole('button',{name:'Print / PDF',exact:false}).first().click();
 const choice=page.getByRole('checkbox',{name:'Include Our Promise to You',exact:false});await choice.waitFor();assert.equal(await choice.isChecked(),true);await choice.uncheck();
 await page.getByRole('button',{name:'Deliver via Print / PDF',exact:true}).click();
 await page.waitForFunction(()=>window.invocations.some(([name])=>name==='generate-proposal-pdf'));
 assert.equal(await page.evaluate(()=>window.invocations.find(([name])=>name==='generate-proposal-pdf')[1].body.displayOptions.includePromisePage),false);
 await page.setViewportSize({width:850,height:1100});await page.setContent(await readFile('/tmp/promise-recovered-print.html','utf8'),{waitUntil:'domcontentloaded'});await page.emulateMedia({media:'print'});
 const size=await page.locator('.el-promise').boundingBox();assert.ok(size.height<950,JSON.stringify(size));
 await page.pdf({path:'/tmp/promise-recovered-print.pdf',format:'Letter',printBackground:true});await page.locator('.el-promise').screenshot({path:'/tmp/promise-recovered-print.png'});
 assert.deepEqual(errors,[]);console.log('PASS: mobile/tablet/desktop, actual logo loading, keyboard banner, no overflow, rep delivery opt-out and Letter print layout');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true})}
