import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const directory = await mkdtemp(join(tmpdir(), 'mjv-sales-'));
const fixture = `
const params=new URLSearchParams(location.search);
const role=params.get('role')||'admin';
const profile={id:'self',organization_id:'org',role,is_sales_rep:params.get('rep')==='true'};
export const useAuth=()=>({profile});
window.rpcCalls=[];window.navActions=[];
export const useDepartments=()=>({starredModules:Array.from({length:8},(_,i)=>({id:String(i),module_key:i===0?'sales_dashboard':'favorite_'+i,display_name:'Favorite '+i,icon:'Star'})),loading:false,hasModuleAccess:()=>true});
export const useTaskCount=()=>2;export const useFishbowlCount=()=>3;
const reps=[{id:'alphabetical',first_name:'Aaron',last_name:'Example'},{id:'self',first_name:'Zach',last_name:'Self'}];
const dashboard=id=>({repId:id,repDisplayName:id==='self'?'Zach Self':'Aaron Example',monthlyTrend:[],bookedSales:{total:id==='self'?200:100,count:1,prevTotal:0,avgSale:100},pipeline:{total:50,count:1},closeRate:{wonCount:id==='self'?1:9,lostCount:1},quota:{}});
export const supabase={from(table){const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>Promise.resolve({data:table==='profiles'?(params.has('empty')?[]:reps):[],error:null,count:0}).then(a,b);return()=>q;}});return q;},async rpc(name,args){window.rpcCalls.push({name,args});if(name==='get_sales_goal_leaderboard')return{data:{entries:[]},error:null};if(name==='get_sales_team_dashboard')return{data:{reps:params.has('partial')?[dashboard('self')]:args.p_rep_ids.map(dashboard)},error:null};await new Promise(r=>setTimeout(r,25));return{data:dashboard(args?.p_target_rep_id||'self'),error:null};}};
`;
const stubNames=['AnnualGoalHero','SalesKpiGrid','SalesTrendChart','SalesGoalLeaderboard','SalesAttentionList','DashboardSkeleton','HotLeadsCard','StaleLeadsCard','DeclineReasonsCard','PeriodStatsRow','RecentProposalsCard','RecentActivityCard','DailyRecap','DailySalesTotalsPanel'];
let browser;
const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,file)));});
try {
 await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {SalesDashboardPage} from './src/components/SalesDashboard/SalesDashboardPage';import {QuickAccessNavigation} from './src/components/Layout/QuickAccessNavigation';createRoot(document.getElementById('root')).render(<div><div className="p-3"><QuickAccessNavigation activeModule="sales_dashboard" onModuleChange={key=>window.navActions.push(key)}/></div><SalesDashboardPage/></div>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/\/supabase$|\/AuthContext$|\/DepartmentContext$|\/useTaskCount$|\/useFishbowlCount$/},()=>({path:'fixture',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js'}));
 b.onResolve({filter:/salesDashboardCalculations$/},()=>({path:'calculations',namespace:'calculations'}));
 b.onLoad({filter:/.*/,namespace:'calculations'},()=>({contents:'export const computeGoalProgress=()=>({});export const computeAttentionItems=()=>[];',loader:'js'}));
 b.onResolve({filter:new RegExp('/('+stubNames.join('|')+')$')},args=>({path:args.path.split('/').at(-1),namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:'export const '+args.path+'=()=>null;',loader:'js'}));
 }}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));
 await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port;
 const teamEnabled=(await readFile('src/components/SalesDashboard/SalesDashboardPage.tsx','utf8')).includes('SalesTeamOverview');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const role of ['sales','service_manager','admin','manager','sales_manager']){
   await page.goto(url+'?role='+role+'&rep=true');
   await page.locator('p').filter({hasText:/^Zach Self$/}).waitFor();
   assert.equal(await page.evaluate(()=>window.rpcCalls.some(c=>c.args?.p_target_rep_id==='alphabetical')),false);
   if(!['admin','manager','sales_manager'].includes(role))assert.equal(await page.getByRole('combobox').count(),0);
   else {
    await page.getByRole('combobox',{name:'Salesperson'}).selectOption('alphabetical');
    await page.getByText('Viewing: Aaron Example',{exact:true}).waitFor();
    if(teamEnabled){await page.getByRole('button',{name:'All sales reps',exact:true}).click();await page.getByRole('button',{name:'My dashboard',exact:true}).click();}
    else await page.getByRole('combobox',{name:'Salesperson'}).selectOption('self');
    await page.locator('p').filter({hasText:/^Zach Self$/}).waitFor();
   }
   const favorites=page.getByRole('navigation',{name:'Bookmarked pages'});
   assert.equal(await favorites.getByRole('button').count(),8);
   await favorites.getByRole('button',{name:'Favorite 7',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.navActions.at(-1)),'favorite_7');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,role+' '+width+' overflow');
  }
  for(const role of ['sales','tech','finance']) {
   await page.goto(url+'?role='+role);
   await page.getByText('You do not have access to the Sales Dashboard.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.rpcCalls.length),0);
  }
  await page.goto(url+'?role=manager');
  if(teamEnabled){
   await page.getByRole('heading',{name:'Salespeople (2)',exact:true}).waitFor();
   assert.ok((await page.locator('body').innerText()).includes('83.3%'));
   await page.getByRole('button',{name:/Aaron Example/}).click();await page.getByText('Viewing: Aaron Example',{exact:true}).waitFor();
   await page.getByRole('button',{name:'All sales reps',exact:true}).click();await page.getByRole('heading',{name:'Salespeople (2)',exact:true}).waitFor();
  } else {
   await page.getByText(/Select a salesperson to view/).waitFor();
   assert.equal(await page.evaluate(()=>window.rpcCalls.some(c=>c.name==='get_my_sales_dashboard')),false);
   await page.getByRole('combobox').selectOption('alphabetical');await page.getByText('Viewing: Aaron Example',{exact:true}).waitFor();
   await page.getByRole('combobox').selectOption('');await page.getByText(/Select a salesperson to view/).waitFor();
   assert.equal(await page.getByText('Viewing: Aaron Example',{exact:true}).count(),0);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('PASS '+width+'px: rep defaults, management selection/reset, responsive controls, all bookmarks reachable'+(teamEnabled?', team return and weighted totals':''));
 }
 if(teamEnabled){
  await page.goto(url+'?role=manager&empty=true');await page.getByText('No active sales reps found.').waitFor();
  assert.equal(await page.evaluate(()=>window.rpcCalls.some(c=>c.name==='get_sales_team_dashboard')),false);
  await page.goto(url+'?role=manager&partial=true');await page.getByRole('alert').waitFor();assert.equal(await page.getByText(/^Booked sales/).count(),0);
 }
 assert.deepEqual(errors,[]);
} finally {await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
