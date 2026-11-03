import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const directory=await mkdtemp(join(tmpdir(),'action-rewards-'));
const fixture=`window.calls=[];window.failLoad=false;window.failSave=false;window.settings={enabled:true,invoice_points_per_dollar:0.04454699,job_clock_points:38,review_points:100,value_points:10000,value_dollars:100};
export function useAuth(){return{profile:{id:'employee',organization_id:'org'}}}
export const supabase={async rpc(name,args){window.calls.push([name,args]);if(name==='get_employee_action_rewards')return{error:window.failLoad?{message:'Load failed'}:null,data:{settings:window.settings,attendance:{early:77,on_time:77,late:-5,very_late:-10},photo_points:1}};
if(name==='get_employee_review_reward_queue')return{error:null,data:{employees:[{id:'rep',full_name:'Michael Colley'},{id:'tech',full_name:'Technician'}],reviews:[{id:'review',contact_name:'Completed customer review',sent_at:'2026-11-01'}]}};
if(window.failSave)return{error:{message:'Save failed'},data:null};if(name==='save_employee_action_rewards')window.settings={enabled:args.p_enabled,invoice_points_per_dollar:args.p_invoice_rate,job_clock_points:args.p_job_points,review_points:args.p_review_points,value_points:args.p_value_points,value_dollars:args.p_value_dollars};return{data:null,error:null}}};`;
const source=`import React from'react';import{createRoot}from'react-dom/client';import{ActionRewards}from'./src/components/Rewards/ActionRewards';createRoot(document.getElementById('root')).render(<ActionRewards admin={location.search.includes('admin')}/>);`;
const server=createServer(async(req,res)=>{const name=req.url.includes('app.js')?'app.js':req.url.includes('style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
let browser;
try{
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixture',setup(b){b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'tsx',resolveDir:process.cwd()}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><body class="bg-gray-900 p-3"><div id="root"></div><script src="app.js"></script></body>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox',...(process.env.CHROMIUM_EXTRA_ARGS||'').split(' ').filter(Boolean)]});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;
 for(const theme of ['dark','light'])for(const width of[320,390,768,1440]){
  await page.setViewportSize({width,height:1100});await page.goto(url+'?admin');await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.getByRole('button',{name:'Save action points'}).waitFor();
  await page.getByText('65 on-time days + 130 job clock-ins: 9,945 points ≈ $99.45').waitFor();await page.getByText('0.04454699 points / $1 collected before tax').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Fits '+width+' '+theme);
 }
 await page.getByLabel('Verified review points',{exact:true}).fill('0');await page.getByRole('button',{name:'Save action points'}).click();await page.waitForFunction(()=>window.calls.some(c=>c[0]==='save_employee_action_rewards'));assert.equal(await page.evaluate(()=>window.calls.find(c=>c[0]==='save_employee_action_rewards')[1].p_review_points),0);await page.getByText('Verified customer review:',{exact:false}).first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Award verified review points'}).isDisabled(),true);
 await page.getByLabel('Verified review points',{exact:true}).fill('100');await page.getByRole('button',{name:'Save action points'}).click();await page.waitForFunction(()=>window.settings.review_points===100);
 await page.getByLabel('Employee',{exact:true}).selectOption('tech');await page.getByLabel('Completed review request').selectOption('review');await page.getByLabel('Individual review URL or verification evidence').fill('https://example.com/individual-review');await page.getByRole('button',{name:'Award verified review points'}).click();await page.waitForFunction(()=>window.calls.some(c=>c[0]==='award_employee_review_points'));assert.equal(await page.evaluate(()=>window.calls.find(c=>c[0]==='award_employee_review_points')[1].p_user),'tech');
 await page.evaluate(()=>window.failSave=true);await page.getByRole('button',{name:'Save action points'}).click();await page.getByRole('alert').waitFor();await page.evaluate(()=>window.failSave=false);
 await page.evaluate(()=>window.failLoad=true);await page.getByRole('button',{name:'Refresh action values'}).click();await page.getByRole('alert').waitFor();await page.evaluate(()=>window.failLoad=false);await page.getByRole('button',{name:'Retry action values'}).click();await page.waitForFunction(()=>!document.querySelector('[role=alert]'));
 await page.goto(url);await page.getByText('0.04454699 points / $1 collected before tax').waitFor();assert.equal(await page.getByRole('button',{name:'Save action points'}).count(),0);assert.equal(await page.getByLabel('Employee',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Award verified review points'}).count(),0);assert.equal(await page.getByText('1 points',{exact:true}).count(),1);
 assert.deepEqual(errors,[]);console.log('Action Rewards UI: shared employee/admin action values at 320/390/768/1440, earning examples, zero rules, review recognition and visible error/retry passed.');
}finally{await browser?.close();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
