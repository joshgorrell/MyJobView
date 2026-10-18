import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const directory = await mkdtemp(join(tmpdir(), 'mjv-assignment-'));
const fixture = `
window.calls=[];window.saved=0;window.formClosed=0;
export const useAuth=()=>({profile:{id:'staff',full_name:'Staff Member',organization_id:'org'}});
export const useAutoSave=()=>({restoreSavedData:()=>null,clearSavedData:()=>{}});
export const offlineSupabaseInsert=async(table,value)=>{window.calls.push({table,value});return {data:{id:'saved'},error:null}};
export const offlineSupabaseUpdate=async(table,value,id)=>{window.calls.push({table,value,id});return {data:{id},error:null}};
export const supabase={from(table){const data=table==='contacts'?[{id:'customer',contact_name:'John Smith',email:'john@example.com'}]:table==='profiles'?[{id:'staff',full_name:'Staff Member'},{id:'tech',full_name:'Technician'}]:table==='departments'?[{id:'service',display_name:'Service'}]:table==='priority_levels'?[{id:'normal',name:'Medium',slug:'medium'},{id:'urgent',name:'High',slug:'high'}]:[];const q={select:()=>q,eq:()=>q,order:()=>q,single:async()=>({data:table==='points_configuration'?{task_completion_points:10}:{google_calendar_connected:false},error:null}),then:resolve=>Promise.resolve({data,error:null}).then(resolve)};return q;}};`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{TaskForm}from'./src/components/Tasks/TaskForm';
const query=new URLSearchParams(location.search);const task=query.has('edit')?{id:'existing',title:'Existing assignment',description:'Existing details',priority:'medium',status:'pending',assigned_to:'tech',contact_id:'customer',due_date:'2026-10-23T00:00:00Z'}:undefined;
createRoot(document.getElementById('root')).render(<TaskForm supportMode={query.has('support')} task={task} onClose={()=>window.formClosed++} onSuccess={()=>window.saved++}/>);`;
const server=createServer(async(req,res)=>{const name=req.url.startsWith('/app.js')?'app.js':req.url.startsWith('/style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
let browser;
try {
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$|hooks\/useAutoSave$|lib\/offlineSupport$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'tsx',resolveDir:process.cwd()}));}}]});
 const css=(await readdir('dist/assets')).find(name=>/^index-.*\.css$/.test(name));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;
 const fits=async height=>{await page.waitForFunction(()=>{const d=document.querySelector('.qam-sheet');return d&&d.getBoundingClientRect().bottom<=innerHeight+1;});const box=await page.getByRole('dialog').boundingBox();assert.ok(box.y>=-1&&box.y+box.height<=height+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const submit=page.locator('button[type=submit]').last();const bounds=await submit.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height+1,'Footer must stay visible');};
 for(const theme of ['dark','light'])for(const width of [320,390,768,1280])for(const support of [false,true]){
  await page.setViewportSize({width,height:900});await page.goto(url+(support?'?support':''));await page.getByPlaceholder('Follow up with customer').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350);
  const title=page.getByPlaceholder('Follow up with customer');const assignee=page.locator('select').first();const t=await title.boundingBox(),a=await assignee.boundingBox();if(width>=640)assert.ok(Math.abs(t.y-a.y)<2,'Title and assignee share a row');else assert.ok(a.y>t.y,'Phone fields stack');
  await fits(900);if(width===1280){assert.ok((await page.getByRole('dialog').boundingBox()).height<750,'Short form should size to content');if(process.env.ASSIGNMENT_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.ASSIGNMENT_SCREENSHOT_DIR,theme+'-'+(support?'support':'assignment')+'.png')});}
  await title.fill(support?'Support: Restore remote access':'Call customer');
  if(support){await page.getByRole('button',{name:'Create Support Request',exact:true}).click();await page.getByText('Select a customer contact for this support request.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),0);}
  await assignee.selectOption(support?'dept:service':'tech');await page.getByText('Search or select contact...',{exact:true}).click();await page.getByRole('button',{name:/John Smith/}).click();
  await page.getByRole('button',{name:/\+ Details/}).click();await page.locator('input[type=date]').fill('2026-10-24');
  await page.getByRole('button',{name:'Fill with AI',exact:true}).click();await page.getByPlaceholder('Type the details, or use the microphone...').fill('Keep all form controls accessible');
  await page.getByRole('button',{name:'Close AI form fill',exact:true}).click();await page.getByRole('button',{name:'Create new contact',exact:true}).click();await page.getByPlaceholder('John Doe').fill('Draft contact');
  await page.setViewportSize({width,height:450});await fits(450);await page.locator('button[type=submit]').last().click();await page.waitForFunction(()=>window.saved===1);
  const request=await page.evaluate(()=>window.calls.find(c=>c.table==='tasks').value);assert.equal(request.title,support?'Support: Restore remote access':'Call customer');assert.equal(request.contact_id,'customer');assert.equal(request.assigned_to,support?null:'tech');assert.equal(request.assigned_department_id,support?'service':null);assert.ok(request.due_date.startsWith('2026-10-24'));assert.equal(request.points,10);
  console.log(theme+' '+width+'px '+(support?'support':'assignment')+': content sizing, layout, contact validation, expanded form, keyboard footer and save passed');
 }
 await page.setViewportSize({width:1280,height:900});await page.goto(url+'?edit');await page.getByPlaceholder('Follow up with customer').waitFor();assert.equal(await page.getByPlaceholder('Follow up with customer').inputValue(),'Existing assignment');assert.equal(await page.locator('select').first().inputValue(),'tech');await page.getByPlaceholder('Follow up with customer').fill('Updated assignment');await page.getByRole('button',{name:'Update Assignment',exact:true}).click();await page.waitForFunction(()=>window.saved===1);const update=await page.evaluate(()=>window.calls.find(c=>c.table==='tasks'));assert.equal(update.id,'existing');assert.equal(update.value.title,'Updated assignment');assert.equal(update.value.contact_id,'customer');
 await page.goto(url);await page.getByPlaceholder('Follow up with customer').fill('Unsaved assignment');await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);assert.equal(await page.evaluate(()=>window.formClosed),1);assert.deepEqual(errors,[]);console.log('Existing assignment updates and cancel-without-write passed; no browser errors');
} finally {await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
