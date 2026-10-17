import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const directory=await mkdtemp(join(tmpdir(),'mjv-activity-link-'));
const proposal='00000000-0000-0000-0000-000000000040';
const fixture=`window.queries=[];export const supabase={from(table){let proposal;const q=new Proxy({},{get(_,key){if(key==='eq')return(_,id)=>{proposal=id;return q};if(key==='then')return(resolve,reject)=>{window.queries.push({table,proposal});return Promise.resolve({error:null,data:table==='proposal_rooms'?[{id:'room',name:'Home Theater'}]:[{id:'visit',activity_type:'viewed',created_at:'2026-10-12T12:00:00Z',duration_seconds:120,metadata:{engagement:{trackingVersion:1,sections:{'room:room':120},clicks:{question_clicked:1}}}}]}).then(resolve,reject)};return()=>q;}});return q;}};`;
const entry=`import React from'react';import{createRoot}from'react-dom/client';import ProposalsView from'./src/components/Proposals/ProposalsView';localStorage.setItem('openProposalId','another-proposal');createRoot(document.getElementById('root')).render(<ProposalsView/>);`;
let browser;const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,file)));});
try{
 await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixture',setup(b){b.onResolve({filter:/(?:^|\/)supabase(?:\.ts)?$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/db/,namespace:'fixture'},()=>({contents:fixture}));b.onResolve({filter:/\/(ProposalBuilderCompact|ProposalsList|CreateProposalModal|VideoLibrary)$/},args=>({path:args.path.split('/').at(-1),namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`import React from'react';export default function Stub(props){return <div>Proposal editor: {props.proposalId}</div>}`,loader:'tsx',resolveDir:process.cwd()}));}}]});
 const css=(await readdir('dist/assets')).find(f=>f.startsWith('index-')&&f.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"></head><body class="theme-workspace"><div id="root"></div><script src="app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [390,1280]){
 await page.setViewportSize({width,height:850});await page.goto('http://127.0.0.1:'+server.address().port+(width===390?'/?tab=proposals&proposalId=':'/proposals?proposalId=')+proposal+'&proposalActivity=true');
 await page.getByRole('dialog',{name:'Activity',exact:true}).waitFor();await page.getByText('Most active viewing in Home Theater.',{exact:false}).waitFor();
 assert.ok(await page.getByText('Proposal editor: '+proposal,{exact:true}).isVisible());assert.ok((await page.evaluate(()=>window.queries)).every(q=>q.proposal===proposal),'Link overrides old saved proposal');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.getByRole('button',{name:'Close Activity'}).evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('button',{name:'Refresh'}).evaluate(el=>el===document.activeElement),true,'Focus remains in dialog');
 if(process.env.ENGAGEMENT_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.ENGAGEMENT_SCREENSHOT_DIR,'activity-link-'+width+'.png')});
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Activity'}).count(),0);assert.equal(new URL(page.url()).searchParams.has('proposalActivity'),false);
 await page.reload();await page.getByText('Proposal editor: '+proposal,{exact:true}).waitFor();assert.equal(await page.getByRole('dialog',{name:'Activity'}).count(),0,'Close does not reopen on reload');
 }
 assert.deepEqual(errors,[]);console.log('Activity links: real route/dialog, selected proposal, stale local state, mobile/desktop, focus trap, and close/reload pass');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
