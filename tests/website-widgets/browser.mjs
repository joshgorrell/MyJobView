import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const kinds=['sales-lead','service','feedback','chat','portal','analytics'];
const ids=Object.fromEntries(kinds.map((k,i)=>[k,'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0')]));
try{
 for(const width of [375,1280]){
 const page=await browser.newPage({viewport:{width,height:900}});
 let views=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://dealer.example/**',async route=>{
 const u=new URL(route.request().url());
 if(u.pathname.startsWith('/website-widgets/')){
 const file=u.pathname.split('/').pop();
 return route.fulfill({contentType:'application/javascript',body:await readFile(new URL('../../public/website-widgets/'+file,import.meta.url),'utf8')});
 }
 const selected=u.pathname==='/combined'?kinds:[u.pathname.slice(1)];
 return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main>'+selected.map(k=>'<script async src="/website-widgets/'+k+'.js" data-widget="'+ids[k]+'" data-config="https://api.example/functions/v1/website-widget-config"></script>').join('')+'</main>'});
 });
 await page.route('https://api.example/**',async route=>{
 const u=new URL(route.request().url());const kind=u.searchParams.get('kind');
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
 assert.equal(views,2);
 assert.deepEqual(errors,[]);
 await page.close();
 }
}finally{await browser.close();}
console.log('Standalone and combined widget browser smoke tests passed');
