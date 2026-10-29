import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'punchlist-dashboard-'));
const fixture=`import React from 'react';
window.calls=[];
const initial=[{id:'p1',contact_id:'c1',customer:'Alpha',name:'Living room',number:'P1',can_submit:true,end_date:'2026-12-01',tasks:['a','b','c','d','e'].map(id=>({id,title:id,customer_description:'Adjustment '+id,visibility:'customer_visible',status:'open',request_id:null}))},{id:'p2',contact_id:'c1',customer:'Alpha',name:'Other project',can_submit:true,tasks:[{id:'other',title:'Other project',visibility:'internal',status:'open',request_id:null}]},{id:'p3',contact_id:'c2',customer:'Expired',name:'Old project',can_submit:false,tasks:[{id:'expired',title:'Expired adjustment',status:'open',request_id:null}]}];
const projects=JSON.parse(localStorage.getItem('test-projects')||JSON.stringify(initial));
export const useAuth=()=>({profile:{id:'admin'}});
export const useDepartments=()=>({hasModuleAccess:()=>true});
export const markPunchlistSeen=()=>{};
export const PunchlistInviteManager=()=>null;\nexport const SupportPhotos=()=>null;
export const supabase={rpc:async(name,args)=>{if(name==='get_test_tune_workspace')return {data:JSON.parse(JSON.stringify(projects)),error:null};window.calls.push([name,args]);if(name==='request_project_punchlist_visit'){for(const p of projects)for(const t of p.tasks)if(args.p_task_ids.includes(t.id))t.request_id='req1';localStorage.setItem('test-projects',JSON.stringify(projects));return {data:'req1',error:null};}return {data:null,error:null};},channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel(){}};`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{PunchlistAdminDashboard}from'./src/components/Production/PunchlistAdminDashboard';createRoot(document.getElementById('root')).render(<main className="p-2"><PunchlistAdminDashboard/></main>);`;
let browser;
const server=createServer(async(req,res)=>{const name=req.url.includes('app.js')?'app.js':req.url.includes('style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
try{
await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$|contexts\/DepartmentContext$|Shared\/Toast$|usePunchlistUnseenCount$|ProjectPunchlistWorkspace$|PunchlistInviteManager$|Shared\/SupportPhotos$|PunchlistTaskDetailModal$|ContactQuickViewModal$|CreateWorkOrderModal$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'tsx',resolveDir:process.cwd()}));}}]});
const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><div id="root"></div><script src="app.js"></script>');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const width of [375,390,1280]){
 await page.setViewportSize({width,height:800});await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.getByRole('checkbox',{name:'Select Adjustment a',exact:true}).waitFor();
 await page.getByRole('button',{name:'Filter Test and Tune tasks'}).click();
 await page.getByRole('dialog',{name:'Test and Tune filters'}).waitFor();
 await page.getByRole('combobox',{name:'Filter punchlist customer'}).selectOption('c1');
 assert.equal(await page.getByRole('combobox',{name:'Filter punchlist status'}).locator('option[value="all"]').textContent().then(t=>t.includes('6')),true);
 await page.getByRole('combobox',{name:'Filter punchlist project'}).selectOption('p1');
 assert.equal(await page.getByRole('combobox',{name:'Filter punchlist status'}).locator('option[value="all"]').textContent().then(t=>t.includes('5')),true);
 await page.getByRole('combobox',{name:'Filter punchlist source'}).selectOption('customer');
 assert.equal(await page.getByRole('checkbox',{name:'Select Adjustment a'}).count(),0);
 await page.getByRole('combobox',{name:'Filter punchlist source'}).selectOption('all');
 await page.getByRole('combobox',{name:'Filter punchlist project'}).selectOption('all');
 await page.getByRole('combobox',{name:'Filter punchlist customer'}).selectOption('all');
 await page.getByRole('combobox',{name:'Filter punchlist status'}).selectOption('unsubmitted');
 assert.equal(await page.getByRole('combobox',{name:'Filter punchlist status'}).inputValue(),'unsubmitted');
 await page.getByRole('combobox',{name:'Filter punchlist status'}).selectOption('all');
 await page.getByRole('button',{name:'Close filters'}).click();

 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.getByRole('checkbox',{name:'Select Expired adjustment',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name: width < 768 ? 'Open task Adjustment a' : 'Preview Adjustment a'}).first().dispatchEvent('click');
 const preview=page.getByRole('dialog',{name:'Test and Tune task: a'});
 await preview.waitFor();
 const bounds=await preview.boundingBox();
 assert.ok(bounds && bounds.x>=0 && bounds.x+bounds.width<=width+1,'Preview fits viewport even inside horizontally scrolling table');
 await page.getByRole('button',{name:'Close task detail'}).click();

 for(const id of ['a','b','c'])await page.getByRole('checkbox',{name:'Select Adjustment '+id,exact:true}).check();
 assert.equal(await page.getByRole('checkbox',{name:'Select Other project',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Request service',exact:true}).click();await page.getByRole('status').filter({hasText:'ready for scheduling'}).waitFor();
 assert.equal(await page.getByRole('checkbox',{name:'Select Adjustment a',exact:true}).count(),0);
 assert.equal(await page.getByRole('checkbox',{name:'Select Adjustment d',exact:true}).count(),1);
 const calls=await page.evaluate(()=>window.calls);assert.deepEqual(calls.find(c=>c[0]==='request_project_punchlist_visit')[1].p_task_ids,['a','b','c']);
 await page.reload();assert.equal(await page.getByRole('checkbox',{name:'Select Adjustment a',exact:true}).count(),0);await page.getByRole('checkbox',{name:'Select Adjustment d',exact:true}).waitFor();
 await page.getByRole('button',{name:'Filter Test and Tune tasks'}).click();
 await page.getByRole('combobox',{name:'Filter punchlist status'}).selectOption('requested');assert.equal(await page.getByRole('checkbox',{name:'Select Adjustment a'}).count(),0);
 await page.goto('http://127.0.0.1:'+server.address().port+'/?projectId=missing&contactId=c1');await page.getByRole('alert').filter({hasText:'unavailable or you no longer have access'}).waitFor();
 await page.goBack();await page.getByRole('button',{name: width < 768 ? 'Open task Adjustment d' : 'Preview Adjustment d'}).first().waitFor();
}
assert.deepEqual(errors,[]);
console.log('PASS: phone/desktop layout, exact grouped handoff, expired/project guards, persisted reload, history, missing context and browser back.');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
