import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const directory = await mkdtemp(join(tmpdir(), 'mjv-navigation-'));
const fixture = `
const profile={id:'employee',organization_id:'org',full_name:'Josh Example',role:'technician'};
export const useAuth=()=>({profile});
export const useDepartments=()=>({mainDepartments:[],footerDepartments:[],getUserModules:()=>[],starredModules:[],loading:false});
export const useEmployeeTimePolicy=()=>({dailyClock:true});
export const getOrganizationTimezone=async()=> 'America/Chicago';
export const formatDateInTimezone=()=> '2026-10-09';
window.actions=[];
const records=Array.from({length:10},(_,i)=>({id:'notice-'+i,type:i===0?'auto_clock_out':'work_order_assignment',related_id:'wo-'+i,title:i===0?'Auto Clock-Out: Needs Approval':'Work order assigned',body:'Technicians completed the installation. Follow up with the customer regarding remaining programming and additional equipment before returning to the project.',created_at:new Date(Date.now()-i*60000).toISOString(),is_read:i>1}));
export const supabase={from(table){const q=new Proxy({},{get(_,key){if(key==='then'){let data=table==='notifications'?records:table==='organizations'?{header_logo_url:'/logo.svg'}:table==='company_settings'?{}:table==='business_cards'?{}:table==='daily_clock_entries'?null:[];return(a,b)=>Promise.resolve({data,error:null}).then(a,b);}return()=>q;}});return q;},channel(){const q={on(){return q;},subscribe(){return q;},unsubscribe(){}};return q;},removeChannel(){}};
`;
const source = `import React from 'react';import {createRoot} from 'react-dom/client';import {Header} from './src/components/Layout/Header';document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')||'dark';createRoot(document.getElementById('root')).render(<div className="theme-workspace"><div style={{transform:'translateZ(0)'}}><Header activeTab="feed" isAdmin={false} onCreateContact={()=>{}} onCreateLead={()=>{}} onCreateServiceRequest={()=>{}} onCreateTask={()=>{}} onLeadClick={id=>window.actions.push(id)} onTabChange={tab=>window.actions.push(tab)} onMenuToggle={()=>window.actions.push('sidebar')}/></div><main style={{height:2000}}>Workspace content</main></div>);`;
const server = createServer(async (req, res) => {
  if(req.url==='/logo.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="40"><rect width="280" height="40" fill="#008dbc"/><text x="5" y="30" font-size="28" fill="white">Electronic Life</text></svg>');return;}
  const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(await readFile(join(directory,file)));
});
let browser;
try {
  await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){
    b.onResolve({filter:/supabase$|contexts\/AuthContext$|contexts\/DepartmentContext$|hooks\/useEmployeeTimePolicy$|lib\/timezoneUtils$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js',resolveDir:process.cwd()}));
    b.onResolve({filter:/TimeClockModal$|ManualJobTimeRequestModal$|RequestInternalTimeModal$|MyTimeView$|AppointmentsCalendar$/},args=>({path:args.path.split('/').at(-1),namespace:'empty'}));
    b.onLoad({filter:/.*/,namespace:'empty'},args=>({contents:'export const '+args.path+'=()=>null;',loader:'js'}));
  }}]});
  const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));
  await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
  await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:'+server.address().port;
  for(const theme of ['dark','light','mjv']) for(const [width,height] of [[320,640],[390,760],[430,932],[667,375],[768,900],[1024,768],[1440,900]]){
    await page.setViewportSize({width,height});await page.goto(url+'?theme='+theme);await page.waitForFunction(()=>document.querySelector('img')?.complete);
    const buttons=await page.locator('header button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()).filter(r=>r.width&&r.height));
    for(const [i,a] of buttons.entries()){
      assert.ok(a.x>=0&&a.right<=width,`${theme} ${width}: header containment`);
      for(const b of buttons.slice(i+1)) assert.ok(a.right<=b.x+.5||b.right<=a.x+.5||a.bottom<=b.y||b.bottom<=a.y,`${theme} ${width}: header buttons overlap`);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(width<768){await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Browse departments',exact:true}).click();assert.ok(await page.evaluate(()=>window.actions.includes('sidebar')));}

    const bell=page.getByRole('button',{name:'Notifications',exact:true}).filter({visible:true});await bell.click();
    const dialog=page.getByRole('dialog',{name:'Notifications'});await dialog.waitFor();
    await page.getByRole('button',{name:'Expand notification'}).first().waitFor();
    const rect=await dialog.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width&&rect.y>=56&&rect.y+rect.height<=height,`${theme} ${width}: panel containment ${JSON.stringify(rect)}`);
    assert.equal(await dialog.evaluate(el=>el.parentElement===document.body),true);
    await page.keyboard.press('Shift+Tab');assert.equal(await dialog.locator('button').last().evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Close notifications'}).evaluate(el=>document.activeElement===el),true);
    const colors=await dialog.evaluate(el=>[getComputedStyle(el).color,getComputedStyle(el).backgroundColor]);assert.notEqual(colors[0],colors[1]);

    assert.ok(await page.locator('.notification-list').evaluate(el=>el.scrollHeight>el.clientHeight),`${width}: internally scrollable`);
    await page.getByRole('button',{name:'Expand notification'}).first().click();
    assert.equal(await page.getByRole('button',{name:'Collapse notification'}).first().getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await bell.evaluate(el=>document.activeElement===el),true);
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    await bell.click();await page.getByRole('button',{name:/Auto Clock-Out: Needs Approval/}).click();await page.waitForFunction(()=>window.actions.includes('daily_clock'));assert.equal(await dialog.count(),0);
    await bell.click();await page.getByRole('button',{name:'Close notifications'}).click();assert.equal(await dialog.count(),0);
    if(process.env.NAVIGATION_SCREENSHOT_DIR&&theme==='dark'&&width===390){await bell.click();await page.screenshot({path:join(process.env.NAVIGATION_SCREENSHOT_DIR,'mobile-navigation.png')});await page.keyboard.press('Escape');}
    console.log(theme+' '+width+'x'+height+': header spacing, panel containment, scroll, expand, close and navigation pass');
  }
  assert.deepEqual(errors,[]);
} finally {await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
