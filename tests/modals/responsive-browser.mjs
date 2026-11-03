import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const directory = await mkdtemp(join(tmpdir(), 'mjv-modals-'));
const fixture = `
export const useAuth=()=>({profile:{company_id:'company'}});
export const supabase={from(table){const q={select(){return q},eq(){return q},order(){return q},single(){return Promise.resolve({data:table==='proposals'?{title:'Living Room Upgrade'}:{zip_code:'66604'},error:null})},then(resolve){return Promise.resolve({data:Array.from({length:20},(_,i)=>({id:'c'+i,full_name:'Customer '+i,company_name:'',email:'customer@example.com',zip_code:i===0?null:'66604'})),error:null}).then(resolve)}};return q},rpc(){window.duplicated=true;return Promise.resolve({data:'copy',error:null})}};
`;
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {DuplicateProposalModal} from './src/components/Proposals/DuplicateProposalModal';
const close=()=>{window.closed=true};
createRoot(document.getElementById('root')).render(location.search.includes('legacy')?<div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-lg max-w-2xl w-full"><div className="p-6 border-b">Header</div><div className="p-6 space-y-6 max-h-[calc(100vh-12rem)] overflow-y-auto">{Array.from({length:40},(_,i)=><p key={i}>Long content row {i}</p>)}</div><div className="p-6 border-t"><button>Save</button></div></div></div>:<DuplicateProposalModal proposalId="proposal" currentContactId="current" currentContactName="Josh Gorrell" onClose={close} onSuccess={close} onOpenRevisionManager={()=>window.revision=true}/>);
`;
const server=createServer(async(req,res)=>{const name=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)))});
let browser;
try {
  await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture}));}}]});
  const css=(await readdir('dist/assets')).find(name=>name.startsWith('index-')&&name.endsWith('.css'));
  await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css,'utf8')+'\n'+await readFile('src/responsive-modals.css','utf8'));
  await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:'+server.address().port;
  const fits=async()=>{await page.waitForTimeout(400);const metrics=await page.locator('.duplicate-proposal-body').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight}));assert.ok(metrics.scroll<=metrics.height+1,JSON.stringify(metrics));const bounds=await page.getByRole('dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=-1&&bounds.x+bounds.width<=page.viewportSize().width+1&&bounds.y+bounds.height<=page.viewportSize().height+1,JSON.stringify(bounds));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)};
  for(const size of [{width:375,height:667},{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:1024,height:768},{width:1280,height:900}]) {
    await page.setViewportSize(size);await page.goto(url);
    await page.getByPlaceholder('Enter proposal title').waitFor();await page.waitForFunction(()=>document.querySelector('input[placeholder="Enter proposal title"]').value.length>0);
    await fits();assert.equal(await page.getByRole('button',{name:'Duplicate Proposal',exact:true}).isEnabled(),false);
    await page.getByLabel('I understand this counts as a separate proposal.').check();assert.equal(await page.getByRole('button',{name:'Duplicate Proposal',exact:true}).isEnabled(),true);
    await page.getByRole('button',{name:/Different Customer/}).click();await page.getByRole('button',{name:/Customer 1 customer/}).first().waitFor();await fits();
    assert.equal(await page.getByRole('button',{name:/Customer 0/}).isEnabled(),false);
    await page.getByRole('button',{name:/Customer 1 customer/}).first().click();await page.getByRole('button',{name:'Duplicate Proposal',exact:true}).click();await page.waitForFunction(()=>window.duplicated===true);
    await page.goto(url);await page.getByRole('button',{name:'Why does this matter?'}).click();await page.waitForTimeout(400);const action=await page.getByRole('button',{name:'Duplicate Proposal',exact:true}).boundingBox();assert.ok(action.y+action.height<=size.height+1);assert.ok(await page.locator('.duplicate-proposal-body').evaluate(el=>el.scrollHeight>=el.clientHeight));
    await page.goto(url+'?legacy');await page.getByRole('button',{name:'Save',exact:true}).waitFor();const save=await page.getByRole('button',{name:'Save',exact:true}).boundingBox();assert.ok(save.y>=0&&save.y+save.height<=size.height);assert.equal(await page.locator('.overflow-y-auto').evaluate(el=>el.scrollHeight>el.clientHeight),true);
    await page.evaluate(()=>{const overlay=document.querySelector('.fixed.inset-0');const panel=overlay.firstElementChild;overlay.classList.add('responsive-modal-overlay');overlay.classList.remove('flex','items-center','justify-center');panel.classList.add('responsive-modal-panel');const layout=document.createElement('div');layout.className='responsive-modal-layout min-h-screen p-4';overlay.append(layout);layout.append(panel)});
    const nestedSave=await page.getByRole('button',{name:'Save',exact:true}).boundingBox();assert.ok(nestedSave.y+nestedSave.height<=size.height);assert.equal(await page.locator('.overflow-y-auto').evaluate(el=>el.scrollHeight>el.clientHeight),true);
    console.log(size.width+'x'+size.height+': normal duplicate form fits; long-content actions remain visible');
  }
  await page.setViewportSize({width:390,height:420});await page.goto(url);await page.getByRole('button',{name:'Duplicate Proposal',exact:true}).waitFor();await page.waitForTimeout(400);const keyboardAction=await page.getByRole('button',{name:'Duplicate Proposal',exact:true}).boundingBox();assert.ok(keyboardAction.y+keyboardAction.height<=420);
  assert.deepEqual(errors,[]);
} finally {await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
