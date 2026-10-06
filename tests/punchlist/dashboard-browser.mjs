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
const contact=(full_name)=>({full_name,email:full_name+'@example.com',phone:'5551234'});
const records=[{id:'a1',contact_id:'a',title:'Old issue',details:'Older Alpha item',contact:contact('Alpha'),status:'draft',created_at:'2026-10-01'},
{id:'b1',contact_id:'b',title:'Newest issue',details:'Newest Beta item',contact:contact('Beta'),status:'draft',created_at:'2026-10-05'},
{id:'a2',contact_id:'a',title:'Second issue',details:'Second Alpha item',contact:contact('Alpha'),status:'draft',created_at:'2026-10-03'},
{id:'a3',contact_id:'a',title:'Requested issue',details:'Requested Alpha item',contact:contact('Alpha'),status:'requested',created_at:'2026-10-02',service_request_id:'existing',service_request:{id:'existing',status:'open',work_order_id:null}}];
const requests={existing:{id:'existing',status:'open',work_order_id:null,contact_id:'a',customer_name:'Alpha',job_description:'Existing Alpha request',priority:'normal',source_type:'punchlist'}};
export const useAuth=()=>({profile:{id:'admin'},loading:false});
export const useToast=()=>({warning:msg=>window.calls.push(['warning',msg]),error:msg=>window.calls.push(['error',msg]),success:()=>{},confirm:(msg,fn)=>fn()});
export const markPunchlistSeen=()=>{};
export const PunchlistInviteManager=()=>null;export const PunchlistTaskDetailModal=()=>null;export const ContactQuickViewModal=()=>null;
export const CreateWorkOrderModal=({serviceRequest,onSuccess,onClose})=><div role='dialog'><p>Schedule: {serviceRequest.customer_name}</p><button onClick={()=>{window.calls.push(['work-order',serviceRequest.contact_id]);onSuccess();}}>Save Work Order</button><button onClick={onClose}>Cancel Scheduling</button></div>;
export const supabase={channel:()=>({on(){return this},subscribe(){return{unsubscribe(){}}}}),from(table){let id;const q={select:()=>q,order:()=>q,eq:(key,value)=>{id=value;return q},single:async()=>({data:requests[id],error:null}),then:resolve=>Promise.resolve({data:records,error:null}).then(resolve)};return q;},rpc:async(name,args)=>{window.calls.push([name,args]);const id='request-'+args.p_contact_id;requests[id]={id,status:'open',work_order_id:null,contact_id:args.p_contact_id,customer_name:args.p_contact_id==='a'?'Alpha':'Beta',job_description:'Selected items',priority:'normal',source_type:'punchlist'};records.filter(t=>args.p_task_ids.includes(t.id)).forEach(t=>{t.status='requested';t.service_request_id=id;t.service_request={id,status:'open',work_order_id:null};});return{data:id,error:null}}};`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{PunchlistAdminDashboard}from'./src/components/Production/PunchlistAdminDashboard';createRoot(document.getElementById('root')).render(<main className="p-2"><PunchlistAdminDashboard/></main>);`;
let browser;
const server=createServer(async(req,res)=>{const name=req.url.includes('app.js')?'app.js':req.url.includes('style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
try{
await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$|Shared\/Toast$|usePunchlistUnseenCount$|PunchlistInviteManager$|PunchlistTaskDetailModal$|ContactQuickViewModal$|CreateWorkOrderModal$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'tsx',resolveDir:process.cwd()}));}}]});
const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><div id="root"></div><script src="app.js"></script>');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const width of [375,390,1280]){
 await page.setViewportSize({width,height:800});await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('checkbox',{name:'Select Newest Beta item',exact:true}).waitFor();
 assert.deepEqual(await page.getByRole('checkbox').evaluateAll(rows=>rows.map(r=>r.getAttribute('aria-label'))),['Select Newest Beta item','Select Second Alpha item','Select Requested Alpha item','Select Older Alpha item']);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const heights=await page.getByTestId('punchlist-toolbar').locator('button,input,select').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));assert.equal(new Set(heights).size,1);
 await page.getByRole('checkbox',{name:'Select Second Alpha item',exact:true}).check();assert.equal(await page.getByRole('checkbox',{name:'Select Newest Beta item',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Select all visible items for this customer',exact:true}).click();assert.equal(await page.getByRole('checkbox').filter({checked:true}).count(),3);
 await page.getByRole('button',{name:'Clear selection',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:'Select Newest Beta item',exact:true}).isEnabled(),true);
 await page.getByRole('combobox',{name:'Punchlist order',exact:true}).selectOption('customer');assert.equal(await page.getByRole('checkbox').first().getAttribute('aria-label'),'Select Second Alpha item');
 await page.getByRole('textbox',{name:'Search punchlist items',exact:true}).fill('Beta');assert.equal(await page.getByRole('checkbox').count(),1);
}
await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Request Service',exact:true}).click();await page.getByRole('button',{name:'Request Service (1)',exact:true}).click();
await page.getByRole('checkbox').check();assert.equal(await page.getByRole('button',{name:'Request Service',exact:true}).isDisabled(),true);
await page.getByRole('button',{name:'Schedule',exact:true}).click();await page.getByRole('button',{name:'Continue to Schedule',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Save Work Order',exact:true}).click();
const calls=await page.evaluate(()=>window.calls);assert.equal(calls.filter(c=>c[0]==='request_punchlist_service').length,1);assert.deepEqual(calls.find(c=>c[0]==='request_punchlist_service')[1].p_task_ids,['b1']);assert.deepEqual(calls.find(c=>c[0]==='work-order'),['work-order','b']);assert.deepEqual(errors,[]);
console.log('Phone/desktop toolbar, newest/customer/search views, customer-locked selection and service/scheduling checks passed.');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
