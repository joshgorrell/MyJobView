import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:http';
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'service-approval-'));
const mock=`window.calls=[];let approval={id:'request',customer_name:'Jane Customer',description:'Restore living room audio',terms:'Labor: $150/hour. Trip: $75. Minimum: one hour.',version:'v1',accepted_at:null,payment_method_id:null,waived:false,closed:false,ready:false};
export const useAuth=()=>({profile:{id:'staff',role:new URLSearchParams(location.search).get('role')||'service_manager'}});
export const supabase={rpc:async(name,payload)=>{window.calls.push([name,payload]);if(name==='portal_service_approval'){if(payload.p_action==='accept'){approval={...approval,accepted_at:'2026-10-28T12:00:00Z',accepted_by:payload.p_name,ready:!!approval.payment_method_id};}return {data:approval,error:null};}return {data:{},error:null};},functions:{invoke:async(name,{body})=>{window.calls.push([name,body]);if(name==='service-approval-payment-methods'){if(body.action==='verify'){approval={...approval,payment_method_id:'method',ready:!!approval.accepted_at};return {data:{method:{id:'method'}}};}return {data:{methods:[{id:'method',payment_type:'ach',display_brand:'Bank',display_last4:'1234'}],environment:'sandbox'}};}return {data:{success:true}};}}};`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/components/Portal/ServiceApprovalPage';import{ServiceApprovalPanel}from './src/components/Service/ServiceApprovalPanel';const staff=new URLSearchParams(location.search).has('role');createRoot(document.getElementById('root')).render(staff?<ServiceApprovalPanel request={{id:'request',status:'pending_customer',service_approval_required:true,service_terms:'Labor $150/hour'}} onChanged={()=>window.changed=true}/>:<Page/>);`;
const server=createServer(async(req,res)=>{const file=req.url.includes('app.js')?'app.js':req.url.includes('style.css')?'style.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(dir,file)));});let browser;
try {
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(dir,'app.js'),plugins:[{name:'mock',setup(b){b.onResolve({filter:/\/supabase$|contexts\/AuthContext$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'js',resolveDir:process.cwd()}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(dir,'style.css'),await readFile('dist/assets/'+css));await writeFile(join(dir,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><div id="root"></div><script src="app.js"></script>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox']});
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const width of [375,1280]) {
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/?request=request&token=token');
  await page.getByRole('heading',{name:'Prepare your service appointment'}).waitFor();
  await page.getByText('Bank ending 1234').click();await page.waitForFunction(()=>window.calls.some(c=>c[0]==='service-approval-payment-methods'&&c[1].action==='verify'));
  assert.equal(await page.getByText('Your request is ready to schedule.',{exact:false}).count(),0);
  await page.getByLabel('Your name',{exact:true}).fill('Jane Customer');await page.getByLabel('I agree to the service rates and terms shown above.').check();await page.getByRole('button',{name:'Accept Rates & Terms'}).click();
  await page.getByText('Your request is ready to schedule.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:900}});await page.goto(base+'/?role=sales');await page.getByRole('button',{name:'Send / Resend Customer Request'}).waitFor();assert.equal(await page.getByRole('button',{name:'Override & Allow Scheduling'}).count(),0);
 await page.goto(base+'/?role=service_manager');await page.getByRole('button',{name:'Override & Allow Scheduling'}).click();assert.equal(await page.getByRole('button',{name:'Confirm Override'}).isDisabled(),true);
 await page.getByLabel('Override reason',{exact:true}).fill('Existing customer—approved to proceed');await page.getByRole('button',{name:'Confirm Override'}).click();await page.waitForFunction(()=>window.changed);
 const call=await page.evaluate(()=>window.calls.find(c=>c[0]==='staff_service_approval'));assert.equal(call[1].p_reason,'Existing customer—approved to proceed');
 await page.close();console.log('Service approval browser: mobile/desktop customer steps and manager-only override with required reason passed.');
}finally{await browser?.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
