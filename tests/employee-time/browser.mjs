import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
import {createServer} from 'vite';
const server=await createServer({configFile:'tests/employee-time/browser/vite.config.mjs'});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
try {
  await mkdir('test-artifacts/time-clock',{recursive:true});
  for(const size of [{width:320,height:568},{width:390,height:844},{width:1280,height:800}]) {
    for(const type of ['job','hourly','salary']) {
      const page=await browser.newPage({viewport:size});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const url='http://127.0.0.1:5191/'+(type==='job'?'': '?'+type);
      await page.goto(url);
      if(type==='salary') {
        await page.getByRole('button',{name:'Time Clock',exact:true}).click();
      }
      await page.getByRole('dialog').waitFor();
      const tabs=page.getByRole('tablist',{name:'Time Clock'});
      await tabs.waitFor();
      for(const name of ['Daily Clock','Job Clock','My Time']) {
        assert.equal(await tabs.getByRole('tab',{name}).count(),1,name+' exists');
      }
      for(const old of ['Team','Calendar','Time Off','History','Today']) {
        assert.equal(await tabs.getByRole('tab',{name:old,exact:true}).count(),0,'Retired tab '+old);
      }
      await tabs.getByRole('tab',{name:'Daily Clock'}).click();
      if(type==='hourly') await page.getByRole('button',{name:'Start Your Day'}).waitFor();
      else await page.getByText('Daily Clock not required').waitFor();
      await tabs.getByRole('tab',{name:'Job Clock'}).click();
      await page.getByRole('heading',{name:'Job Clock'}).waitFor();
      await tabs.getByRole('tab',{name:'My Time'}).click();
      await page.getByText('Your recent daily, job, shop, and training time entries.',{exact:false}).waitFor();
      await tabs.getByRole('tab',{name:'Job Clock'}).click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow '+size.width+' '+type);
      const box=await page.getByRole('dialog').boundingBox();
      assert.ok(box.width<=size.width && box.height<=size.height,'Dialog fits viewport '+size.width+' '+type);
      if(size.width===390) await page.screenshot({path:'test-artifacts/time-clock/'+type+'-mobile.png'});
      if(type!=='salary') {
        await page.getByRole('button',{name:/Install Speakers/}).click();
        assert.deepEqual(await page.evaluate(()=>window.__navigation),{tab:'work_orders',params:{workOrderId:'wo'}});
        assert.equal(await page.getByRole('dialog').count(),0,'Work Order navigation closes the Time Clock');
      }
      assert.deepEqual(errors,[],'No browser errors '+type);
      await page.close();
    }
  }
  console.log('Canonical Time Clock browser checks passed: 3 tabs, policy, routing and fit at 320, 390 and 1280px.');
} finally {await browser.close();await server.close();}
