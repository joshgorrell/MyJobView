import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
import {createServer} from 'vite';
const server=await createServer({configFile:'tests/employee-time/browser/vite.config.mjs'});await server.listen();
const browser=await chromium.launch({headless:true});
try{for(const size of [{width:320,height:568},{width:390,height:844},{width:1280,height:800}]){
 const page=await browser.newPage({viewport:size});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5191');await page.getByRole('button',{name:/Install Speakers/}).waitFor();
 const box=await page.getByRole('dialog').boundingBox();assert.ok(box.width<=size.width && box.height<=size.height);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
 await page.getByRole('button',{name:'Daily Calendar',exact:true}).click();await page.getByText('Personal daily calendar').waitFor();
 await page.getByRole('button',{name:'Scheduled Work Order'}).click();
 assert.deepEqual(await page.evaluate(()=>window.__navigation),{tab:'work_orders',params:{workOrderId:'calendar-wo'}});
 await page.goto('http://127.0.0.1:5191');await page.getByRole('button',{name:/Install Speakers/}).click();
 assert.deepEqual(await page.evaluate(()=>window.__navigation),{tab:'work_orders',params:{workOrderId:'wo'}});
 await page.goto('http://127.0.0.1:5191');await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Closed',exact:true}).waitFor();
 assert.deepEqual(errors,[]);await page.close();
}console.log('Command Center browser checks passed at 320px, 390px and desktop: fit, routing and Escape.');}finally{await browser.close();await server.close();}
