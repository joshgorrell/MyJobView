import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
import {createServer} from 'vite';
const server=await createServer({configFile:'tests/employee-time/browser/vite.config.mjs'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
try{for(const size of [{width:320,height:568},{width:390,height:844},{width:1280,height:800}]){
 const page=await browser.newPage({viewport:size});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Time Clock browser error:',e.message);});
 await page.goto('http://127.0.0.1:5191');await page.getByRole('button',{name:/Install Speakers/}).waitFor();
 const box=await page.getByRole('dialog').boundingBox();assert.ok(box.width<=size.width && box.height<=size.height);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
 await page.getByRole('button',{name:'Record Job Time',exact:true}).waitFor();
 await page.locator('.qam-sheet').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
 const frame=await page.getByRole('dialog').boundingBox();
 const nav=await page.getByRole('navigation',{name:'Time Clock views'}).boundingBox();
 for(const tab of ['Time Off','Team','History','Calendar','Today']){
   await page.getByRole('button',{name:tab,exact:true}).click();
   const current=await page.getByRole('dialog').boundingBox();
   const currentNav=await page.getByRole('navigation',{name:'Time Clock views'}).boundingBox();
   for(const key of ['x','y','width','height']){
     assert.ok(Math.abs(current[key]-frame[key])<1,`Modal ${key} stays fixed on ${tab}`);
     assert.ok(Math.abs(currentNav[key]-nav[key])<1,`Tabs ${key} stays fixed on ${tab}`);
   }
 }

 await page.getByRole('button',{name:'Time Off',exact:true}).click();await page.getByText('My PTO requests').waitFor();
 await page.getByRole('button',{name:'Team',exact:true}).click();await page.getByText('Approved team absences').waitFor();
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByText('Approved Job Time').waitFor();
 await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByText('Personal daily calendar').waitFor();
 await page.getByRole('button',{name:'Scheduled Work Order'}).click();
 assert.deepEqual(await page.evaluate(()=>window.__navigation),{tab:'work_orders',params:{workOrderId:'calendar-wo'}});
 await page.goto('http://127.0.0.1:5191');await page.getByRole('button',{name:/Install Speakers/}).click();
 assert.deepEqual(await page.evaluate(()=>window.__navigation),{tab:'work_orders',params:{workOrderId:'wo'}});
 await page.goto('http://127.0.0.1:5191');await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Closed',exact:true}).waitFor();
 await page.goto('http://127.0.0.1:5191/?hourly');await page.getByRole('button',{name:'Start Your Day',exact:true}).waitFor();
 await page.locator('.qam-sheet').evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
 const punch=await page.getByRole('button',{name:'Start Your Day',exact:true}).boundingBox();assert.ok(punch.y>=0&&punch.y+punch.height<=size.height,'Daily clock action stays visible without scrolling');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Hourly Time Clock does not overflow');
 if(size.width===390){await mkdir('test-artifacts/time-clock',{recursive:true});await page.screenshot({path:'test-artifacts/time-clock/hourly-mobile.png',fullPage:true});}
 await page.goto('http://127.0.0.1:5191/?salary');
 const salaryClock=page.getByRole('button',{name:'Time Clock',exact:true});await salaryClock.waitFor();
 await salaryClock.click();await page.getByRole('button',{name:'Start Job Time',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Start Your Day',exact:true}).count(),0,'Salary job tools do not require a daily punch');
 await page.getByText('No daily clock required. Record job time below.').waitFor();
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByText('Recorded Job Time').waitFor();
 await page.getByRole('button',{name:'Today',exact:true}).click();await page.getByRole('button',{name:'Record Job Time',exact:true}).click();await page.getByLabel('Search customers').waitFor();
 assert.equal(await page.getByRole('dialog').count(),1,'Job entry replaces the hub with a single dialog');
 await page.getByRole('button',{name:'Test Customer',exact:true}).click();
 await page.getByRole('button',{name:/Project.*P-100.*Test Project/}).click();
 await page.getByLabel('Work notes').fill('Planning work for this project');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 assert.equal(await page.getByLabel('Work notes').inputValue(),'Planning work for this project','Refresh preserves the job form');
 await page.getByRole('button',{name:'Start Timer',exact:true}).click();
 await page.getByRole('navigation',{name:'Time Clock views'}).waitFor();
 assert.equal((await page.evaluate(()=>window.__timerCall)).name,'start_customer_job_time','Salary user starts project timer without daily punch');
 await page.getByRole('button',{name:'Record Job Time',exact:true}).click();
 await page.getByRole('button',{name:'Test Customer',exact:true}).click();
 await page.getByRole('button',{name:/Project.*P-100.*Test Project/}).click();
 await page.getByRole('button',{name:'Enter time already worked',exact:true}).click();
 await page.getByLabel('Work notes').fill('Completed the customer design');
 await page.getByRole('button',{name:'Submit Time for Review',exact:true}).click();
 await page.getByRole('navigation',{name:'Time Clock views'}).waitFor();
 const entry=await page.evaluate(()=>window.__timeWrite);
 assert.equal(entry.table,'manual_job_time_requests');
 assert.equal(entry.payload.project_id,'project');
 assert.equal(entry.payload.technician_id,'tech');

 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Salary Time Clock does not overflow');
 await page.goto('http://127.0.0.1:5191/?empty');
 await page.getByText('No jobs scheduled today.',{exact:false}).waitFor();
 await page.getByText('No approved sessions · Details',{exact:false}).waitFor();
 await page.locator('.qam-sheet').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
 assert.ok(await page.getByLabel('Today’s time overview').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Default empty Today overview fits without scrolling');
 for(const name of ['Record Job Time','Request Shop / Training Time']){
   const action=page.getByRole('button',{name,exact:true});
   const bounds=await action.boundingBox();
   assert.ok(bounds.y>=0 && bounds.y+bounds.height<=size.height,`${name} is visible without scrolling`);
 }
 if(size.width===1280){await page.screenshot({path:'test-artifacts/time-clock/empty-desktop.png',fullPage:true});}
 await page.getByRole('button',{name:'Request Shop / Training Time',exact:true}).click();
 await page.getByRole('heading',{name:'Request Shop / Training Time',exact:true}).waitFor();
 assert.equal(await page.getByRole('dialog').count(),1,'Internal request replaces the hub with a single dialog');
 for(const type of ['Shop Time','Training']) {
   await page.getByRole('button',{name:new RegExp(type)}).click();
   await page.getByRole('button',{name:'Next',exact:true}).click();
   await page.getByPlaceholder(/What (will you be doing|are you training on)/).fill('Preparing for the next installation');
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   assert.equal(await page.getByPlaceholder(/What (will you be doing|are you training on)/).inputValue(),'Preparing for the next installation');
   await page.getByRole('button',{name:'Back',exact:true}).click();
 }
 await page.keyboard.press('Escape');
 await page.getByRole('navigation',{name:'Time Clock views'}).waitFor();
 await page.getByRole('button',{name:'Request Shop / Training Time',exact:true}).click();
 await page.getByRole('button',{name:/Shop Time.*Cleaning/}).click();
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await page.getByPlaceholder(/What will you be doing/).fill('Organizing parts for installation');
 await page.getByRole('button',{name:'Submit Request',exact:true}).click();
 await page.getByText('Request Submitted!',{exact:true}).waitFor();
 const internal=await page.evaluate(()=>window.__timeWrite);
 assert.equal(internal.table,'internal_time_sessions');
 assert.equal(internal.payload.session_type,'shop_time');
 assert.equal(internal.payload.status,'pending_approval');
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('navigation',{name:'Time Clock views'}).waitFor();
 assert.deepEqual(errors,[]);await page.close();
}console.log('Command Center browser checks passed at 320px, 390px and desktop: fit, routing and Escape.');}finally{await browser.close();await server.close();}
