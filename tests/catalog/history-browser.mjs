import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({configFile:'tests/catalog/history/vite.config.mjs'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5199/?mode=edit');
 await page.getByLabel('Discontinue item',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Discontinue item',{exact:true}).isChecked(),true);
 const status=page.getByRole('region',{name:'Product status'});
 assert.equal(await status.evaluate(el=>el===el.parentElement.lastElementChild),true,'Status controls are the last form section');
 await page.getByLabel('Archive item',{exact:true}).check();
 await page.getByRole('button',{name:'Save Product',exact:true}).click();await page.waitForFunction(()=>window.saved);
 assert.equal(await page.evaluate(()=>window.productPatch.is_active),false);assert.equal(await page.evaluate(()=>window.productPatch.is_discontinued),true);
 await page.goto('http://127.0.0.1:5199');await page.getByRole('button',{name:'History',exact:true}).click();
 await page.getByText('P-200',{exact:true}).waitFor();await page.getByText('SO-100',{exact:true}).waitFor();await page.getByText('INV-100',{exact:true}).waitFor();await page.getByText('WO-100',{exact:true}).waitFor();assert.equal(await page.getByText('P-100',{exact:true}).count(),0,'Converted proposal appears only as its sales order');
 await page.getByRole('button',{name:'Work orders (1)',exact:true}).click();assert.equal(await page.getByText('INV-100',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.goto('http://127.0.0.1:5199/?error=1');await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('alert').filter({hasText:'Invoices could not be loaded'}).waitFor();await page.getByText('P-200',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);await page.close();console.log(`Bottom status controls, archive save and document history passed at ${width}px`);
}}finally{await browser.close();await server.close();}
