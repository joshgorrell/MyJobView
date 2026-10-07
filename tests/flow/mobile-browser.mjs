import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const directory = await mkdtemp(join(tmpdir(), 'mjv-flow-mobile-'));
const fixture = `
import {useState} from 'react';
export const useAuth=()=>({profile:{id:'rep',organization_id:'org'}});
export const useDepartments=()=>({hasModuleAccess:()=>true});
window.actions=[];
const records=Array.from({length:10},(_,i)=>({id:i+1,created_at:new Date(Date.now()-i*60000).toISOString(),customer_name:'Customer '+i,project_name:'Home theater project',actor_name:'Josh Gorrell',category:'update',source_table:'flow_updates',source_id:'update-'+i,summary:'Project update with a long summary to check truncation',preview:'Technicians will return tomorrow to complete the installation.',viewed:i>1,mentioned_user_ids:['rep']}));
export function useFlow(filters){window.filters=filters;const [events,setEvents]=useState(records);return {events,loading:false,loadingMore:false,hasMore:false,error:'',pending:0,connected:true,refresh:async()=>window.actions.push(['refresh']),markViewed:async(ids,viewed=true)=>{window.actions.push(['viewed',ids,viewed]);setEvents(old=>old.map(e=>ids.includes(e.id)?{...e,viewed}:e));}};}
export const supabase={from(){const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>Promise.resolve({data:[],error:null}).then(a,b);return()=>q}});return q}};
`;
const source = `import React from 'react';import {createRoot} from 'react-dom/client';import Flow from './src/components/Flow/Flow';const params=new URLSearchParams(location.search);document.documentElement.dataset.theme=params.get('theme')||'dark';createRoot(document.getElementById('root')).render(<main className="p-3"><header style={{height:56}}>Electronic Life</header><nav style={{height:40}}>Product Catalog · Punchlist</nav><div style={{height:40}}>Flow · Discussions</div><Flow projectId={params.has('scoped')?'project':undefined} dark={params.has('dark')}/></main>);`;
const server = createServer(async (req, res) => {
  const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(await readFile(join(directory,file)));
});
let browser;
try {
  await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/supabase$|contexts\/AuthContext$|contexts\/DepartmentContext$|lib\/flow\/useFlow$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js',resolveDir:process.cwd()}));}}]});
  const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));
  await writeFile(join(directory,'style.css'),Buffer.concat([await readFile('dist/assets/'+css),await readFile(join(directory,'app.css'))]));
  await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:'+server.address().port;
  for (const width of [320,375,390,430]) {
    await page.setViewportSize({width,height:760});await page.goto(url);await page.locator('.flow-row').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.getByRole('textbox',{name:'Search activity',exact:true}).isVisible(),false);
    assert.equal(await page.locator('.flow-kind').count(),0);
    assert.equal(await page.locator('.flow-view-tabs').isVisible(),false);
    await page.getByRole('combobox',{name:'Flow view',exact:true}).selectOption('company');
    await page.getByRole('combobox',{name:'Flow view',exact:true}).selectOption('all');
    const toolbarHeight=await page.locator('.flow-toolbar').evaluate(el=>el.getBoundingClientRect().height);
    assert.ok(toolbarHeight<50,JSON.stringify({width,toolbarHeight}));
    assert.equal(await page.locator('.flow-footnote').isVisible(),false);
    const headerHeight=await page.locator('.flow').evaluate(el=>el.querySelector('.flow-row').getBoundingClientRect().top-el.getBoundingClientRect().top);
    assert.ok(headerHeight<=205,JSON.stringify({width,headerHeight}));
    const visible=await page.locator('.flow-row').evaluateAll(rows=>rows.filter(r=>r.getBoundingClientRect().bottom<=innerHeight).length);
    assert.ok(visible>=6,JSON.stringify({width,visible}));
    assert.equal(await page.evaluate(()=>window.filters.my_work),false);
    await page.getByRole('button',{name:'Filters',exact:true}).click();
    await page.getByRole('button',{name:'Today',exact:true}).click();assert.ok(await page.evaluate(()=>window.filters.since&&window.filters.until));
    await page.getByRole('button',{name:'@ Mentions',exact:true}).click();assert.equal(await page.evaluate(()=>window.filters.mentions_only),true);
    await page.getByRole('button',{name:'New only',exact:true}).click();assert.equal(await page.evaluate(()=>window.filters.new_only),true);
    await page.getByRole('combobox',{name:'Show activity type',exact:true}).filter({visible:true}).selectOption('messages');assert.equal(await page.evaluate(()=>window.filters.kind),'messages');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.getByRole('button',{name:'Filters (4)',exact:true}).click();await page.locator('.flow-chips button').click();assert.equal(await page.evaluate(()=>window.filters.kind),'');
    await page.getByRole('button',{name:'Search activity',exact:true}).click();const input=page.getByRole('textbox',{name:'Search activity',exact:true});await input.fill('Julio');await page.waitForFunction(()=>window.filters.search==='Julio');assert.equal(await input.evaluate(el=>document.activeElement===el),true);
    const colors=await input.evaluate(el=>[getComputedStyle(el).color,getComputedStyle(el).backgroundColor]);assert.deepEqual(colors,['rgb(30, 41, 59)','rgba(0, 0, 0, 0)']);
    await page.getByRole('button',{name:'Hide activity search',exact:true}).click();await page.waitForFunction(()=>window.filters.search==='');assert.equal(await input.isVisible(),false);
    await page.getByRole('button',{name:'Refresh Flow',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.actions.at(-1)),['refresh']);
    await page.locator('.flow-row-main').first().click();assert.equal(await page.locator('.flow-detail').isVisible(),true);assert.equal(await page.getByRole('link',{name:'Open customer'}).count(),0);
    await page.locator('.flow-row-main').first().click();await page.getByRole('button',{name:'Mark shown viewed',exact:true}).click();assert.equal(await page.locator('.flow-row--new').count(),0);
    await page.getByRole('button',{name:'About Flow unread indicators',exact:true}).click();assert.equal(await page.locator('.flow-footnote').isVisible(),true);
    await page.getByRole('button',{name:'About Flow unread indicators',exact:true}).click();
    await page.getByRole('button',{name:'Update',exact:true}).click();assert.equal(await page.locator('.flow-composer').isVisible(),true);await page.getByRole('button',{name:'Update',exact:true}).click();
    if(process.env.FLOW_SCREENSHOT_DIR){await page.goto(url);await page.locator('.flow-row').first().waitFor();await page.screenshot({path:join(process.env.FLOW_SCREENSHOT_DIR,`flow-${width}.png`)});}
    console.log(`${width}px: feed begins ${headerHeight}px into card; ${visible} rows visible; controls pass`);
    await page.goto(url+'?scoped&dark');await page.locator('.flow-row').first().waitFor();assert.equal(await page.locator('.flow-segment').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.setViewportSize({width:1280,height:900});await page.goto(url);await page.locator('.flow-row').first().waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Search activity',exact:true}).isVisible(),false);
  assert.equal(await page.locator('.flow-kind').count(),0);assert.equal(await page.locator('.flow-view-tabs').isVisible(),true);await page.getByRole('tab',{name:'Company',exact:true}).click();await page.getByRole('tab',{name:'All',exact:true}).click();assert.equal(await page.locator('.flow-column-head').isVisible(),true);assert.equal(await page.locator('.flow-footnote').isVisible(),true);
  assert.equal(await page.locator('.flow-search-toggle').isVisible(),true);assert.equal(await page.locator('.flow-help-toggle').isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const width of [768,1024]){await page.setViewportSize({width,height:900});await page.goto(url);await page.locator('.flow-row').first().waitFor();assert.ok(await page.locator('.flow-toolbar').evaluate(el=>el.getBoundingClientRect().height<50));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  assert.deepEqual(errors,[]);console.log('Desktop and scoped views pass; no browser errors');
} finally {await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
