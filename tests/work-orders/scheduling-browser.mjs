import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'mjv-scheduling-'));
const fixture=`
window.calendarQueries=[];
const records={organizations:[{id:'org',timezone:'America/Chicago'}],work_orders:[{id:'wo',organization_id:'org',assigned_to:'a',title:'Basement installation',scheduled_date:'2026-10-12',scheduled_start_time:'08:45:00',scheduled_end_time:'09:15:00',status:'assigned'}],appointments:[{id:'meeting',organization_id:'org',assigned_technician:'a',title:'Private customer detail',appointment_date:'2026-10-12',start_time:'10:15:00',end_time:'10:45:00',is_private:true,status:'scheduled'}],pto_requests:[{id:'pto',organization_id:'org',employee_id:'b',start_date:'2026-10-12',end_date:'2026-10-12',status:'approved'}]};
export const supabase={from(table){let one=false;const predicates=[];const calls=[];const q=new Proxy({},{get(_,key){if(key==='then')return (done,fail)=>{window.calendarQueries.push({table,calls});return Promise.resolve({data:window.failCalendar&&table==='appointments'?null:one?records[table]?.[0]:(records[table]||[]).filter(row=>predicates.every(p=>p(row))),error:window.failCalendar&&table==='appointments'?{message:'Offline'}:null}).then(done,fail)};return(...args)=>{calls.push([key,...args]);if(key==='eq')predicates.push(r=>r[args[0]]===args[1]);if(key==='neq')predicates.push(r=>r[args[0]]!==args[1]);if(key==='in')predicates.push(r=>args[1].includes(r[args[0]]));if(key==='or'){const expression=args[0],lo=expression.match(/(scheduled_date|appointment_date)\\.gte\\.([\\d-]+)/),hi=expression.match(/(scheduled_date|appointment_date)\\.lte\\.([\\d-]+)/),extra=expression.match(/(scheduled_date|appointment_date)\\.eq\\.([\\d-]+)/);if(lo&&hi)predicates.push(r=>(r[lo[1]]>=lo[2]&&r[lo[1]]<=hi[2])||(extra&&r[extra[1]]===extra[2]));}if(key==='single'||key==='maybeSingle')one=true;return q}}});return q},channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){}};
`;
const source=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {WorkOrderSchedulePicker} from './src/components/Production/WorkOrderSchedulePicker';function App(){const [value,setValue]=useState({date:'2026-10-12',start:'',end:''}),[ids,setIds]=useState([]),[error,setError]=useState(null);window.selection={value,ids,error};return <form onSubmit={e=>{e.preventDefault();window.accidentalSubmits=(window.accidentalSubmits||0)+1}} style={{maxWidth:960,margin:'auto',padding:12}}><WorkOrderSchedulePicker organizationId="org" technicians={[{id:'a',full_name:'Alice'},{id:'b',full_name:'Ben'}]} technicianIds={ids} onTechniciansChange={setIds} value={value} onChange={setValue} onValidationChange={setError} earliestDate="2026-10-11"/></form>}createRoot(document.getElementById('root')).render(<App/>);`;
let browser;
const server=createServer(async(req,res)=>{try{const file=req.url?.startsWith('/app.js')?'app.js':req.url?.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(dir,file)))}catch{res.writeHead(404);res.end()}});
try{
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(dir,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|^\.\/supabase$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture}))}}]});
 const css=(await readdir('dist/assets')).find(name=>name.startsWith('index-')&&name.endsWith('.css'));
 await writeFile(join(dir,'style.css'),(await readFile('dist/assets/'+css,'utf8')) + (await readFile(join(dir,'app.css'),'utf8')));await writeFile(join(dir,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const viewport of [{width:1280,height:900},{width:768,height:1024},{width:390,height:844},{width:320,height:568}]){
  const page=await browser.newPage({viewport,timezoneId:'America/Los_Angeles'});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByText('Basement installation',{exact:true}).waitFor();assert.equal(await page.getByText('Private customer detail',{exact:true}).count(),0);
  const slot=(name,time,date='2026-10-12')=>page.getByRole('button',{name:'Schedule '+name+' on '+date+' at '+time,exact:true});
  assert.equal(await slot('Alice','9:00 AM').isEnabled(),false);assert.equal(await slot('Alice','9:30 AM').isEnabled(),false);assert.equal(await slot('Ben','11:00 AM').isEnabled(),false);
  await slot('Alice','11:00 AM').click();await page.waitForFunction(()=>window.selection.value.start==='11:00'&&window.selection.error===null);
  assert.deepEqual(await page.evaluate(()=>window.selection.ids),['a']);assert.equal(await page.getByLabel('Work order end time').inputValue(),'12:00');
  const draft=page.locator('[draggable="true"]').filter({hasText:'New work order'}).first();const target=slot('Alice','1:00 PM');
  await draft.evaluate(e=>e.scrollIntoView({block:'center'}));await draft.dragTo(target);await page.getByRole('button',{name:'Confirm move',exact:true}).waitFor();assert.equal(await page.getByLabel('Work order start time').inputValue(),'11:00');await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.getByLabel('Work order start time').inputValue(),'11:00');
  await draft.evaluate(e=>e.scrollIntoView({block:'center'}));await draft.dragTo(target);await page.getByRole('button',{name:'Confirm move',exact:true}).click();await page.waitForFunction(()=>window.selection.value.start==='13:00');
  const tabUrl=new URL(await page.getByRole('link',{name:'Pop out calendar'}).getAttribute('href'),page.url());assert.equal(tabUrl.searchParams.get('view'),'technicians');assert.equal(tabUrl.searchParams.get('date'),'2026-10-12');
  await page.evaluate(()=>{Element.prototype.requestFullscreen=async()=>{throw Error('Denied')}});await page.getByRole('button',{name:'Full screen calendar',exact:true}).click();await page.locator('.calendar-expanded').waitFor();await page.getByRole('button',{name:'Exit full screen calendar',exact:true}).click();assert.equal(await page.locator('.calendar-expanded').count(),0);assert.equal(await page.getByLabel('Work order start time').inputValue(),'13:00');
  await page.getByRole('button',{name:'Enter date & time',exact:true}).click();assert.equal(await slot('Alice','11:00 AM').count(),0);
  await page.getByLabel('Work order start time').fill('09:20');await page.getByLabel('Work order end time').fill('09:40');await page.waitForFunction(()=>window.selection.error===null);assert.equal(await page.getByLabel('Work order start time').inputValue(),'09:20');
  await page.getByLabel('Work order start time').fill('09:10');await page.getByText(/Already booked: Alice/).waitFor();
  await page.getByLabel('Work order start time').fill('11:00');await page.getByLabel('Work order end time').fill('10:00');await page.getByText(/End time must be after/).waitFor();
  await page.getByLabel('Work order end time').fill('12:00');await page.getByRole('button',{name:'Browse calendar',exact:true}).click();await page.getByLabel('Ben',{exact:true}).check();await page.getByText(/Already booked: Ben/).waitFor();await page.getByLabel('Ben',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Week',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
  await slot('Tue 13','11:00 AM','2026-10-13').click();await page.waitForFunction(()=>window.selection.value.date==='2026-10-13'&&window.selection.error===null);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Calendar stays inside viewport');
  if(viewport.width===1280){await page.screenshot({path:'/tmp/mjv-scheduling-desktop.png',fullPage:true});}
  if(viewport.width===390){await page.screenshot({path:'/tmp/mjv-scheduling-mobile.png',fullPage:true});}
  await page.getByRole('button',{name:'Month',exact:true}).click();await page.locator('[data-calendar-month-grid]').waitFor();await page.getByRole('button',{name:'View calendar on 2026-10-13',exact:true}).click();await page.getByRole('button',{name:'Gantt',exact:true}).click();await page.locator('[data-calendar-gantt]').waitFor();await page.getByRole('button',{name:'View Alice on 2026-10-13',exact:true}).click();await page.getByRole('button',{name:'Week',exact:true}).click();
  await page.evaluate(()=>{window.failCalendar=true});await page.getByRole('button',{name:'Refresh availability',exact:true}).click();await page.getByText('Availability could not be loaded. Retry before scheduling.',{exact:true}).first().waitFor();assert.equal(await slot('Tue 13','11:00 AM','2026-10-13').isEnabled(),false);
  await page.evaluate(()=>{window.failCalendar=false});await page.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>window.selection.error===null);
  assert.equal(await page.evaluate(()=>window.accidentalSubmits||0),0,'Calendar confirmation and cancel never submit the enclosing work-order form');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Calendar click booking, precise manual entry, full-duration conflicts, PTO, private titles, team scheduling, retry and responsive layouts passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
