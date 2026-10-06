import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'service-intake-'));
const fixture=`import React from 'react';window.calls=[];
export const useAuth=()=>({profile:{id:'staff',role:'service_manager'}});
export const AddressAutocomplete=({value,onChange,...props})=><input {...props} value={value} onChange={e=>onChange(e.target.value)}/>;
export const supabase={from(table){let payload;const q={select:()=>q,in:()=>q,eq:()=>q,order:()=>q,limit:()=>q,or:query=>{window.calls.push(['search',query]);return q;},insert:value=>{payload=value;window.calls.push([table,value]);return q;},single:async()=>({data:{id:'saved'},error:null}),then:resolve=>Promise.resolve({data:table==='contacts'?[{id:'c1',full_name:'John Smith',phone:'5551234567',street_address:'123 Main St',city:'Topeka'}]:table==='profiles'?[{id:'tech',full_name:'JP'}]:table==='projects'?[{id:'project',name:'Project',project_number:'101',job_site_address:{street:'Wrong project address'}}]:[],error:null}).then(result=>table==='projects'?new Promise(done=>setTimeout(()=>done(result),250)):result).then(resolve)};return q;}};`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{ServiceRequestForm}from'./src/components/Service/ServiceRequestForm';createRoot(document.getElementById('root')).render(<ServiceRequestForm onClose={()=>{}}/>);`;
let browser;
const server=createServer(async(req,res)=>{const name=req.url.includes('app.js')?'app.js':req.url.includes('style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
try{
await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$|Shared\/AddressAutocomplete$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'tsx',resolveDir:process.cwd()}));}}]});
const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><div id="root"></div><script src="app.js"></script>');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
for(const width of [375,390,430,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByPlaceholder('Search name, company, phone, or email...').waitFor();
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==='search').length),0);
 await page.getByPlaceholder('Search name, company, phone, or email...').fill('John');
 await page.getByRole('button').filter({hasText:'John Smith'}).click();
 if(width===375){await page.getByLabel('Request type').selectOption('project');await page.getByLabel('Request type').selectOption('service');await page.waitForTimeout(400);assert.equal(await page.getByText('Wrong project address',{exact:true}).count(),0,'Late project lookup must not change service location');}
 await page.getByPlaceholder('What needs to be done? *').fill('TV has no sound');
 const send=page.getByRole('button',{name:'Send to Service',exact:true});assert.equal(await send.isEnabled(),true);
 const box=await send.boundingBox();assert.ok(box.y+box.height<=844,`Submit visible at ${width}`);
 assert.equal(await page.evaluate(()=>document.querySelector('[role=dialog]').scrollWidth>document.querySelector('[role=dialog]').clientWidth),false);
 await send.click();const request=await page.evaluate(()=>window.calls.find(c=>c[0]==='service_requests')?.[1]);assert.equal(request.customer_contact_instruction,'dispatch');assert.equal(request.job_description,'TV has no sound');assert.deepEqual(request.requested_tech_ids,[]);assert.equal(request.earliest_date,null);assert.deepEqual(errors,[]);await page.close();
}
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
await page.getByRole('button',{name:'New Customer',exact:true}).click();
await page.getByPlaceholder('Customer Name *').fill('New Customer');await page.getByPlaceholder('Phone',{exact:true}).fill('5559876543');
await page.getByPlaceholder('What needs to be done? *').fill('New alarm request');
await page.getByText('Scheduling · ASAP by default',{exact:true}).click();
await page.getByLabel('Customer contact responsibility').selectOption('requester');
await page.getByLabel('Earliest date',{exact:true}).fill('2026-10-08');
await page.locator('input[type=date]').nth(1).fill('2026-10-10');
await page.getByRole('checkbox',{name:'JP'}).check();
await page.getByLabel('Billing type').selectOption('warranty');
await page.getByLabel('Warranty reference',{exact:true}).fill('Service 101');await page.getByLabel('Warranty reason',{exact:true}).fill('Return visit');
await page.setViewportSize({width:390,height:450});
const send=page.getByRole('button',{name:'Send to Service',exact:true});const box=await send.boundingBox();assert.ok(box.y+box.height<=450,'Submit stays visible with reduced keyboard viewport');
assert.equal(await page.evaluate(()=>document.querySelector('[role=dialog]').scrollWidth>document.querySelector('[role=dialog]').clientWidth),false);
const alerts=[];page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept();});
await page.locator('input[type=date]').nth(1).fill('2026-10-07');await send.click();assert.deepEqual(alerts,['Earliest date must be on or before Need By.']);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==='service_requests').length),0);
await page.locator('input[type=date]').nth(1).fill('2026-10-10');await send.click();const calls=await page.evaluate(()=>window.calls);const request=calls.find(c=>c[0]==='service_requests')[1];
assert.equal(calls.find(c=>c[0]==='contacts')[1].phone,'5559876543');assert.equal(request.job_location_address,'');assert.equal(request.customer_contact_instruction,'requester');assert.equal(request.earliest_date,'2026-10-08');assert.equal(request.requested_date,'2026-10-10');assert.equal(request.warranty_reference,'Service 101');assert.deepEqual(request.requested_tech_ids,['tech']);assert.equal(request.billable_by,'dispatch');assert.deepEqual(errors,[]);await page.close();
console.log('375/390/430/1280px intake, new customer, expanded scheduling/warranty, and keyboard viewport submission passed.');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
