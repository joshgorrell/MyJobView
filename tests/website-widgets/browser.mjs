import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const kinds=['sales-lead','service','feedback','chat','portal','analytics'];
const ids=Object.fromEntries(kinds.map((k,i)=>[k,'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0')]));
try{
 for(const width of [375,1280]){
 const page=await browser.newPage({viewport:{width,height:900}});
 const submissions=[];let failService=true;
 await page.addInitScript(()=>{window.turnstile={render(_container,options){queueMicrotask(()=>options.callback('synthetic-proof'));return 'test-widget';},remove(){}};});
 let views=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://assets.example/website-widgets/**',async route=>{
 const file=new URL(route.request().url()).pathname.split('/').pop();
 return route.fulfill({contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:await readFile(new URL('../../public/website-widgets/'+file,import.meta.url),'utf8')});
 });
 await page.route('https://dealer.example/**',async route=>{
 const u=new URL(route.request().url());
 if(u.pathname.startsWith('/website-widgets/')){
 const file=u.pathname.split('/').pop();
 return route.fulfill({contentType:'application/javascript',body:await readFile(new URL('../../public/website-widgets/'+file,import.meta.url),'utf8')});
 }
 const selected=u.pathname==='/combined'?kinds:[u.pathname.slice(1)];
 return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main>'+selected.map(k=>'<script async src="https://assets.example/website-widgets/'+k+'.js" data-widget="'+ids[k]+'" data-config="https://api.example/functions/v1/website-widget-config"></script>').join('')+'</main>'});
 });
 await page.route('https://api.example/**',async route=>{
 const u=new URL(route.request().url());const kind=u.searchParams.get('kind');
 if(u.pathname.includes('/submit-website-')){const headers={'Access-Control-Allow-Origin':'https://dealer.example','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});submissions.push(route.request().postDataJSON());if(u.pathname.endsWith('-service')&&failService){failService=false;return route.fulfill({status:503,headers,body:'{}'});}return route.fulfill({status:200,headers,body:'{}'});}
 if(u.pathname.endsWith('/website-analytics')){views++;return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'https://dealer.example'},body:'{}'});}
 return route.fulfill({json:{kind,branding:{name:'Test Dealer',color:'#2563eb'},turnstileSiteKey:'test',portalUrl:'https://portal.example/login',interests:['Audio'],businessHours:true},headers:{'Access-Control-Allow-Origin':'https://dealer.example'}});
 });
 for(const kind of [...kinds,'combined']){
 await page.goto('https://dealer.example/'+kind);
 if(kind==='analytics'){await page.waitForFunction(()=>document.readyState==='complete');await page.waitForTimeout(300);continue;}
 const expected=kind==='combined'?5:1;
 await page.waitForFunction(n=>Array.from(document.querySelectorAll('main>div')).filter(x=>x.shadowRoot).length===n,expected);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow '+kind);
 }
 await page.goto('https://dealer.example/service');
 const form=page.locator('main>div').locator('form');
 for(const [name,value] of Object.entries({name:'Test Visitor',email:'test@example.com',phone:'7855550100',address:'123 Test',city:'Topeka',state:'KS',zip:'66601',description:'Synthetic request'}))await form.locator('[name="'+name+'"]').fill(value);
 await form.locator('[name=consent]').check();
 await form.getByRole('button',{name:'Submit service request'}).click();
 await form.getByRole('status').filter({hasText:'Please try again'}).waitFor();
 await form.getByRole('button',{name:'Submit service request'}).click();
 await form.getByRole('status').filter({hasText:'Request received'}).waitFor();
 assert.equal(submissions[0].requestId,submissions[1].requestId);
 assert.equal(submissions[1].consent,true);assert.equal(submissions[1].botToken,'synthetic-proof');
 await page.goto('https://dealer.example/feedback');
 await form.locator('[name=rating]').selectOption('needs_attention');
 await form.locator('[name=comment]').fill('Synthetic feedback');
 await form.getByRole('button',{name:'Send feedback'}).click();
 await form.getByRole('status').filter({hasText:'Thank you'}).waitFor();
 assert.equal(submissions[2].rating,'needs_attention');
 assert.equal(views,2);
 assert.deepEqual(errors,[]);
 await page.close();
 }
}finally{await browser.close();}
console.log('Standalone and combined widget browser smoke tests passed');
