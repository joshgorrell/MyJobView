import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'project-support-'));
const fixture=`
const params=new URLSearchParams(location.search);window.calls=[];
const task={id:'shared',description:'Kitchen speaker needs tuning',status:'open',progress:'pending',source:'customer',requested:false,photos:[]};
const state={organization_id:'org',vip_service_access:!params.has('no-vip'),projects:[{id:'current',name:'Home installation',number:'P-101',can_submit:!params.has('expired'),end_date:'2026-12-01',days_remaining:params.has('expired')?0:params.has('last-day')?0:params.has('one-day')?1:43,tasks:[task]},{id:'past',name:'Earlier installation',number:'P-099',can_submit:false,end_date:'2026-08-01',days_remaining:0,tasks:[{...task,id:'old',description:'Earlier adjustment',status:'completed'}]}],requests:[{id:'sr1',description:'Network troubleshooting',created_at:'2026-10-19',status:'open',photos:[]}],legacy_items:[]};
const staffTasks=[{id:'internal',title:'Private staff task',description:'Private instructions',status:'open',progress_status:'pending',visibility:'internal',source:'manual',estimated_hours:1}];
export const useAuth=()=>({profile:{id:'user',contact_id:'customer'},user:{app_metadata:{}},loading:false});
export const supabase={rpc:async(name,args)=>{window.calls.push([name,args]);if(name==='get_customer_support')return{data:structuredClone(state),error:null};if(name==='submit_project_punchlist_item'){state.projects[0].tasks.push({...task,id:args.p_submission_id,description:args.p_description});return{data:args.p_submission_id,error:null};}if(name==='submit_vip_service_request'){state.requests.unshift({id:args.p_submission_id,description:args.p_description,status:'open',created_at:'2026-10-19',photos:[]});return{data:args.p_submission_id,error:null};}if(name==='request_project_punchlist_visit'){state.projects[0].tasks.filter(t=>args.p_task_ids.includes(t.id)).forEach(t=>t.requested=true);return{data:'request',error:null};}return{data:[],error:null};},
from(table){let mutation;const q={select:()=>q,eq:()=>q,order:()=>q,in:()=>q,insert:(data)=>{mutation=data;return q;},update:(data)=>{mutation=data;return q;},then(resolve){if(mutation){window.calls.push(['write',table,mutation]);staffTasks.push({...mutation,id:'new',progress_status:'pending'});}return Promise.resolve({data:table==='project_tasks'?staffTasks:[],error:null}).then(resolve);}};return q;},
storage:{from:()=>({upload:async(path)=>{window.calls.push(['upload',path]);return{error:null};},createSignedUrls:async()=>({data:[],error:null})})}};
`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{PortalPunchlist}from'./src/components/Portal/PortalPunchlist';import ProjectTasksList from './src/components/Projects/ProjectTasksList';createRoot(document.getElementById('root')).render(<main className="p-4">{location.search.includes('staff')?<ProjectTasksList projectId="project" canEdit/>:<PortalPunchlist isEmbedded/>}</main>);`;
let browser;
const server=createServer(async(req,res)=>{const name=req.url.includes('app.js')?'app.js':req.url.includes('style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
try{
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/^fixture$/,namespace:'fixture'},()=>({contents:fixture,loader:'js',resolveDir:process.cwd()}));b.onResolve({filter:/LegacyHandoffReview$/},()=>({path:'legacy',namespace:'fixture'}));b.onLoad({filter:/legacy/,namespace:'fixture'},()=>({contents:'export default function Legacy(){return null}',loader:'js'}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><div id="root"></div><script src="app.js"></script>');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;
 for(const width of [375,1280]){
  await page.setViewportSize({width,height:900});await page.goto(url);await page.getByRole('heading',{name:'Add Punchlist Item',exact:true}).waitFor();await page.getByRole('heading',{name:'Test & Tune · 43 days remaining',exact:true}).waitFor();await page.getByText('What happens afterward?',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('textbox',{name:'What needs attention?'}).fill('Master bedroom speaker needs adjusting');
  await page.getByRole('button',{name:'Add Item',exact:true}).click();await page.getByRole('status').filter({hasText:'Item added'}).waitFor();
  await page.getByRole('checkbox',{name:'Select Master bedroom speaker needs adjusting for service',exact:true}).check();
  await page.getByRole('button',{name:'Request Service (1)',exact:true}).click();await page.getByRole('status').filter({hasText:'Service requested'}).waitFor();
  assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call[0]==='request_project_punchlist_visit').length,1);
  await page.screenshot({path:'/tmp/project-punchlist-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'Service Requests',exact:true}).click();
  await page.getByRole('textbox',{name:'Describe the issues you want us to address'}).fill('Wi-Fi drops upstairs\nDoorbell camera is offline');
  await page.getByRole('textbox',{name:'Service address',exact:true}).fill('123 Main Street');
  await page.getByRole('button',{name:'Submit Service Request',exact:true}).click();await page.getByRole('status').filter({hasText:'Service request submitted'}).waitFor();
  assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call[0]==='submit_vip_service_request').length,1);
 }
 await page.goto(url+'?last-day');await page.getByRole('heading',{name:'Test & Tune · Ends today',exact:true}).waitFor();await page.goto(url+'?one-day');await page.getByRole('heading',{name:'Test & Tune · 1 day remaining',exact:true}).waitFor();
 await page.goto(url+'?expired');await page.getByRole('heading',{name:'Test & Tune · Ended',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Add Item',exact:true}).count(),0);await page.getByRole('button',{name:'Service Requests',exact:true}).click();await page.getByRole('button',{name:'Submit Service Request',exact:true}).waitFor();
 await page.goto(url+'?expired&no-vip');await page.getByRole('button',{name:'Service Requests',exact:true}).click();await page.getByText('An active paid or complimentary VIP plan is required',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Submit Service Request',exact:true}).count(),0);await page.getByText('Network troubleshooting',{exact:true}).waitFor();
 await page.goto(url+'?staff');await page.getByRole('button',{name:'Add Punchlist Item',exact:true}).click();await page.getByLabel('Internal title',{exact:true}).fill('Staff-only follow-up');await page.getByLabel('Internal instructions / notes',{exact:true}).fill('Do not show this to customer');
 assert.equal(await page.getByRole('combobox',{name:'Visibility',exact:true}).inputValue(),'internal');assert.equal(await page.getByLabel('Customer description',{exact:false}).count(),0);
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('summary').filter({hasText:'Staff-only follow-up'}).waitFor();let writes=(await page.evaluate(()=>window.calls)).filter(c=>c[0]==='write');assert.equal(writes[0][2].visibility,'internal');assert.equal(writes[0][2].customer_description,null);
 await page.getByRole('button',{name:'Add Punchlist Item',exact:true}).click();await page.getByLabel('Internal title',{exact:true}).fill('Private engineering title');await page.getByRole('combobox',{name:'Visibility',exact:true}).selectOption('customer_visible');await page.getByLabel('Customer description',{exact:false}).fill('We will adjust the living room controls');await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('summary').filter({hasText:'Private engineering title'}).waitFor();
 writes=(await page.evaluate(()=>window.calls)).filter(c=>c[0]==='write');assert.equal(writes[1][2].customer_description,'We will adjust the living room controls');
 await page.screenshot({path:'/tmp/staff-project-punchlist.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: phone/desktop layout, customer item + visit, multi-issue VIP service, expired access/history, and default-private staff sharing.');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
