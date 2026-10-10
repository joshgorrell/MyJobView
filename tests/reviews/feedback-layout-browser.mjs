import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const directory = await mkdtemp(join(tmpdir(), 'mjv-navigation-'));
const fixture = `
const profile={id:'employee',organization_id:'org',full_name:'Josh Example',role:'admin'};
export const useAuth=()=>({profile});
export const useDepartments=()=>({mainDepartments:[],footerDepartments:[],getUserModules:()=>[],starredModules:[{id:"product",module_key:"products",display_name:"Product Catalog",icon:"Menu"},{id:"punchlist",module_key:"punchlist",display_name:"Punchlist",icon:"Menu"},{id:"reviews",module_key:"reviews",display_name:"Feedback",icon:"Star"}],loading:false});
export const useTaskCount=()=>0;export const useFishbowlCount=()=>0;export const useToast=()=>({error(){},warning(){},success(){}});
export const useEmployeeTimePolicy=()=>({dailyClock:true});
export const getOrganizationTimezone=async()=> 'America/Chicago';
export const formatDateInTimezone=()=> '2026-10-09';
window.actions=[];
const records=Array.from({length:10},(_,i)=>({id:'notice-'+i,type:i===0?'auto_clock_out':'work_order_assignment',related_id:'wo-'+i,title:i===0?'Auto Clock-Out: Needs Approval':'Work order assigned',body:'Technicians completed the installation. Follow up with the customer regarding remaining programming and additional equipment before returning to the project.',created_at:new Date(Date.now()-i*60000).toISOString(),is_read:i>1}));
export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},from(table){const q=new Proxy({},{get(_,key){if(key==='then'){let data=table==='notifications'?records:table==='organizations'?{header_logo_url:'/logo.svg'}:table==='company_settings'?{}:table==='business_cards'?{}:table==='daily_clock_entries'?null:[];return(a,b)=>Promise.resolve({data,error:null}).then(a,b);}return()=>q;}});return q;},channel(){const q={on(){return q;},subscribe(){return q;},unsubscribe(){}};return q;},removeChannel(){}};
`;
const source = `import React from 'react';import {createRoot} from 'react-dom/client';import {Header} from './src/components/Layout/Header';import {QuickAccessNavigation} from './src/components/Layout/QuickAccessNavigation';import ReviewsView from './src/components/Sales/ReviewsView';createRoot(document.getElementById('root')).render(<><Header activeTab="reviews" isAdmin onCreateContact={()=>{}} onCreateLead={()=>{}} onCreateServiceRequest={()=>{}} onCreateTask={()=>{}} onLeadClick={()=>{}} onTabChange={()=>{}} onMenuToggle={()=>{}}/><div className="px-3 py-1.5"><QuickAccessNavigation activeModule="reviews" onModuleChange={()=>{}}/></div><main className="px-3 py-3"><ReviewsView/></main></>);`;
const server = createServer(async (req, res) => {
  if(req.url==='/logo.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="40"><rect width="280" height="40" fill="#008dbc"/><text x="5" y="30" font-size="28" fill="white">Electronic Life</text></svg>');return;}
  const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(await readFile(join(directory,file)));
});
let browser;
try {
  await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,define:{'import.meta.env.VITE_SUPABASE_URL':'"https://fixture.test"'},format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){
    b.onResolve({filter:/supabase$|contexts\/AuthContext$|contexts\/DepartmentContext$|hooks\/useEmployeeTimePolicy$|hooks\/useTaskCount$|hooks\/useFishbowlCount$|Shared\/Toast$|lib\/timezoneUtils$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js',resolveDir:process.cwd()}));
    b.onResolve({filter:/ProposalFollowUps$|LostOpportunityReviews$/},()=>({path:'review-child',namespace:'review-child'}));
    b.onLoad({filter:/.*/,namespace:'review-child'},()=>({contents:'export default ()=>null;',loader:'js'}));
    b.onResolve({filter:/TimeClockModal$|ManualJobTimeRequestModal$|RequestInternalTimeModal$|MyTimeView$|AppointmentsCalendar$/},args=>({path:args.path.split('/').at(-1),namespace:'empty'}));
    b.onLoad({filter:/.*/,namespace:'empty'},args=>({contents:'export const '+args.path+'=()=>null;',loader:'js'}));
  }}]});
  const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));
  await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
  await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fixture.test/**',route=>route.fulfill({json:{subject:'Example lifecycle email',html:'<p>Example email</p>'}}));
  const url='http://127.0.0.1:'+server.address().port;
  for(const [width,height] of [[320,640],[390,844],[430,932],[667,375],[768,1024],[1024,768],[1440,900]]){
    await page.setViewportSize({width,height});await page.goto(url);await page.getByRole('heading',{name:'Feedback',exact:true}).waitFor();
    const buttons=await page.locator('header').first().locator('button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()).filter(r=>r.width&&r.height));
    for(const [i,a] of buttons.entries()){
      assert.ok(a.x>=0&&a.right<=width,'header containment '+width);
      for(const b of buttons.slice(i+1))assert.ok(a.right<=b.x+.5||b.right<=a.x+.5||a.bottom<=b.y||b.bottom<=a.y,'header overlap '+width);
    }
    const section=page.getByRole('region',{name:'Job review emails'});await section.waitFor();
    for(const card of await section.locator('article').all()){
      const rect=await card.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width,'card containment '+width);
      if(width<640)assert.ok(rect.height<=90,'compact card '+width);
      const description=card.locator('p');assert.equal(await description.evaluate(el=>el.clientHeight<=parseFloat(getComputedStyle(el).lineHeight)+1),true,'one line description');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page overflow '+width);
    const favorite=page.getByRole('navigation',{name:'Bookmarked pages'}).getByRole('button',{name:/Feedback/});
    const favoriteRect=await favorite.boundingBox();assert.ok(favoriteRect.x>=0&&favoriteRect.x+favoriteRect.width<=width,'active favorite visible');
    for(const label of ['Proposal Check','Lost Opportunities','Job Reviews'])await page.getByRole('navigation',{name:'Feedback sections'}).getByRole('button',{name:label,exact:true}).click();
    await section.getByRole('button',{name:'Preview example: Job Completion · Day 0'}).click();await page.getByTitle('Email preview').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
    await section.locator('article').nth(1).locator('button').first().click();await page.getByRole('heading',{name:'Ask About Their Experience'}).waitFor();
    await page.getByRole('button',{name:'Back to emails',exact:true}).click();
    await page.getByRole('button',{name:'Ask for a Google Review',exact:true}).click();await page.getByRole('heading',{name:'Ask for a Google Review',exact:true}).waitFor();
    console.log(width+'x'+height+': header, compact cards, favorites, tabs, preview and review actions pass');
  }
  assert.deepEqual(errors,[]);
} finally {await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
