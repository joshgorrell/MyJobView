import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const directory = await mkdtemp(join(tmpdir(), 'mjv-proposal-source-'));
const fixture = `
const profile={id:'rep',role:'sales',is_sales_rep:true};export const useAuth=()=>({profile});
export const supabase={from(table){let id;const q=new Proxy({}, {get(_,key){
 if(key==='then')return(resolve)=>Promise.resolve({data:[],error:null}).then(resolve);
 if(key==='eq')return(k,v)=>{if(k==='id')id=v;return q};
 if(key==='maybeSingle')return async()=>({data:table==='contacts'?{id,contact_name:'Contact '+id,zip_code:'66604'}:table==='leads'?{id,contact_name:'Lead '+id}:null,error:null});
 return()=>q;
}});return q}};
`;
let browser;
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', req.url.startsWith('/app.js') ? 'text/javascript' : 'text/html');
  res.end(await readFile(join(directory, req.url.startsWith('/app.js') ? 'app.js' : 'index.html')));
});
try {
  await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import View from './src/components/Proposals/ProposalsView';import Modal from './src/components/Proposals/CreateProposalModal';createRoot(document.getElementById('root')).render(location.search.includes('direct')?<Modal onClose={()=>{}} onCreated={()=>{}}/>:<View/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){
    b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$/},()=>({path:'data',namespace:'fixture'}));
    b.onResolve({filter:/\/ProposalsList$/},()=>({path:'list',namespace:'fixture'}));
    b.onResolve({filter:/\/CustomerLocationSelector$/},()=>({path:'locations',namespace:'fixture'}));
    b.onResolve({filter:/\/taxCalculations$/},()=>({path:'tax',namespace:'fixture'}));
    b.onResolve({filter:/\/ProposalBuilderCompact$|\/VideoLibrary$|\/ProposalActivityDialog$/},()=>({path:'unused',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),loader:'tsx',contents:path==='data'?fixture:path==='list'?`import React from 'react';export default function List({onCreateNew}){return <button onClick={onCreateNew}>New Proposal</button>}`:path==='locations'?`import React from 'react';export function CustomerLocationSelector({value}){return <div data-testid="location">{value||'No location'}</div>}`:path==='tax'?`export const lookupTaxRateByZip=async()=>({combined_rate:0.09});export const formatTaxRate=()=> '9%';`:`export default function Empty(){return null};export const ProposalActivityDialog=Empty;`}));
  }}]});
  await writeFile(join(directory,'index.html'),'<html><body><div id="root"></div><script src="/app.js"></script></body></html>');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const draft={title:'Wrong customer project',selectedResult:{id:'old',contact_name:'Old Customer',source:'contact',zip_code:'90210',raw:{}},selectedLocation:{id:'wrong-location',zip_code:'90210'},zipCode:'90210',manualTaxRate:'22',taxEnvironment:'commercial',taxProjectType:'remodel'};
  await page.addInitScript(d=>sessionStorage.setItem('myjobview:create-proposal-draft',JSON.stringify(d)),draft);
  const base='http://127.0.0.1:'+server.address().port;
  for(const query of ['createContactId=new','createLeadId=new']){
    await page.goto(base+'?'+query);
    await page.getByText(query.startsWith('createContact')?'Contact new':'Lead new',{exact:true}).waitFor();
    assert.equal(await page.locator('input').first().inputValue(),'Proposal for '+(query.startsWith('createContact')?'Contact new':'Lead new'));
    assert.equal(await page.getByText('Old Customer',{exact:true}).count(),0);
    assert.equal(await page.locator('select').first().inputValue(),'residential');
    assert.equal(await page.locator('select').nth(1).inputValue(),'general_installation_repair');
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('myjobview:create-proposal-draft')).manualTaxRate),'');
    if(query.startsWith('createContact'))assert.equal(await page.getByTestId('location').innerText(),'No location');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(new URL(page.url()).search,'');
    await page.getByRole('button',{name:'New Proposal',exact:true}).click();
    assert.equal(await page.getByText('Contact new',{exact:true}).count(),0);
    assert.equal(await page.getByText('Lead new',{exact:true}).count(),0);
    assert.equal(await page.locator('input').first().inputValue(),'');
  }
  await page.goto(base+'?direct');
  await page.getByText('Old Customer',{exact:true}).waitFor();
  assert.equal(await page.locator('input').first().inputValue(),'Wrong customer project');
  assert.deepEqual(errors,[]);
  console.log('Contact/Lead entry ignores unrelated drafts; cancel clears source; ordinary draft restoration passes.');
} finally {
  await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});
}
