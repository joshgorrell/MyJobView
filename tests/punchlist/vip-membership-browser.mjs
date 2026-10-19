import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'vip-membership-'));
const fixture=`
const params=new URLSearchParams(location.search);window.calls=[];window.paymentSettled=false;window.activated=false;
const plan={id:'plan',plan_name:'VIP Care',amount:25,description:'Service plan',billing_frequency:'monthly',is_active:true,show_on_portal:true,plan_type:'vip_plan'};
const subscription={id:'subscription',status:'active',start_date:'2026-01-01',next_billing_date:'2026-12-01',is_complimentary:params.has('comped'),custom_amount:params.has('comped')?0:25,plan};
const contact={id:'customer',full_name:'Alex Customer',email:'alex@example.com',street_address:'123 Main',city:'Town',state:'CA',zip_code:'90210'};
export const supabase={auth:{getUser:async()=>({data:{user:{id:'user',app_metadata:{is_portal_user:true,contact_id:'customer'}}}})},rpc:async(name)=>({data:{vip_service_access:params.has('comped')||window.activated},error:null}),functions:{invoke:async(name,args)=>{window.calls.push([name,args]);if(params.has('error'))return{data:{error:'Online VIP checkout is not ready. Please contact your representative.'},error:null};if(window.paymentSettled){window.activated=true;return{data:{status:'paid',total:27,environment:'sandbox'},error:null};}return{data:{status:'pending',total:27,payment_url:'https://connect.intuit.com/pay/900',environment:'sandbox'},error:null};}},from(table){const filters={};const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q;},gte:()=>q,order:()=>q,limit:()=>q,update:()=>q,maybeSingle(){return Promise.resolve({data:q.data(),error:null});},data(){if(table==='profiles')return params.has('no-profile')?null:{contact_id:'customer'};if(table==='contacts')return contact;if(table==='company_settings')return{company_email:'service@example.com'};if(table==='recurring_plans')return[plan];if(table==='recurring_subscriptions')return filters.status==='active'&&(params.has('comped')||params.has('expired')||window.activated)?subscription:null;return null;},then(resolve){return Promise.resolve({data:q.data(),error:null}).then(resolve);}};return q;}};
export const notify=()=>{};
`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{PortalVIPMembership}from'./src/components/Portal/PortalVIPMembership';createRoot(document.getElementById('root')).render(<PortalVIPMembership/>);`;
let browser;
const server=createServer(async(req,res)=>{const name=req.url.includes('app.js')?'app.js':req.url.includes('style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
try{
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|lib\/feedback$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/^fixture$/,namespace:'fixture'},()=>({contents:fixture,loader:'js',resolveDir:process.cwd()}));b.onResolve({filter:/PaymentMethodManager$|VIPMembershipFAQ$|TrialStatusBanner$/},args=>({path:args.path.split('/').pop(),namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:'export function '+args.path+'(){return null;}',loader:'js'}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
 await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><div id="root"></div><script src="app.js"></script>');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));const url='http://127.0.0.1:'+server.address().port;
 async function start(){await page.getByRole('button',{name:'Subscribe Now',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Prepare Secure Checkout',exact:true}).click();}
 for(const width of [375,1280]){
  await page.setViewportSize({width,height:900});await page.goto(url+'?expired');
  await start();await page.getByRole('link',{name:'Pay securely with QuickBooks',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Pay securely with QuickBooks',exact:true}).getAttribute('href'),'https://connect.intuit.com/pay/900');
  assert.equal(await page.getByRole('link',{name:'Continue to Service Requests',exact:true}).count(),0,'Unpaid stays locked');
  await page.getByRole('button',{name:'Check Payment Status',exact:true}).click();await page.getByRole('button',{name:'Check Payment Status',exact:true}).waitFor({state:'visible'});
  assert.equal(await page.getByRole('link',{name:'Continue to Service Requests',exact:true}).count(),0);
  await page.getByRole('heading',{name:'Activate VIP Membership',exact:true}).locator('..').getByRole('button').click();
  assert.equal(await page.evaluate(()=>window.activated),false,'Closing checkout cannot activate');await start();await page.getByRole('link',{name:'Pay securely with QuickBooks',exact:true}).waitFor();
  await page.evaluate(()=>window.paymentSettled=true);await page.getByRole('button',{name:'Check Payment Status',exact:true}).click();
  await page.getByRole('link',{name:'Continue to Service Requests',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Continue to Service Requests',exact:true}).getAttribute('href'),'/portal/punchlist?tab=service-requests');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok((await page.evaluate(()=>window.calls)).every(([name,args])=>name==='vip-membership-checkout'&&Object.keys(args.body).sort().join(',')==='contact_id,plan_id'),'No browser price/activation writes');
  await page.screenshot({path:'/tmp/vip-membership-'+width+'.png',fullPage:true});
 }
 await page.goto(url+'?no-profile');await start();await page.getByRole('link',{name:'Pay securely with QuickBooks',exact:true}).waitFor();
 await page.goto(url+'?comped');await page.getByRole('link',{name:'Go to Service Requests',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Subscribe Now',exact:true}).count(),0);
 await page.goto(url+'?error');await start();await page.getByRole('alert').filter({hasText:'checkout is not ready'}).waitFor();assert.equal(await page.getByRole('link',{name:'Continue to Service Requests',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: expired member -> server-priced checkout -> pending verification -> paid -> familiar service; comped access, configuration failure, phone/desktop.');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
