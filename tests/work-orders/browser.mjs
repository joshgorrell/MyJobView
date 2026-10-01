import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
const {createServer}=await import('vite');
const server=await createServer({configFile:'tests/work-orders/browser/vite.config.mjs'});
await server.listen();
const browser=await chromium.launch({headless:true});
try {
 for (const size of [{width:390,height:844},{width:320,height:568},{width:390,height:420},{width:1280,height:800}]) {
  const page=await browser.newPage({viewport:size});
  const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message);});page.on('console',msg=>{if(msg.type()==='error')console.error(msg.text());});
  await page.goto('http://127.0.0.1:5187');
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await page.getByPlaceholder('e.g. Install camera system — east wing').fill('Rough-in visit');
  const phase=page.locator('select').first();await phase.selectOption('rough');
  await page.getByRole('button',{name:'Test Technician'}).click();
  await page.getByRole('button',{name:'Assigned install',exact:false}).click();
  await page.getByRole('button',{name:'Add 1 task',exact:true}).click();
  await page.getByRole('heading',{name:'Tasks for this work order (1)'}).waitFor();
  assert.equal(await page.getByText('Finished work',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Browse all phases',exact:true}).click();
  await page.getByRole('button').filter({hasText:'Trim'}).last().click();
  await page.getByRole('button',{name:/Trim work/}).waitFor();
  const rect=await dialog.boundingBox();assert.ok(rect.width<=size.width && rect.height<=size.height+1,'Dialog must fit viewport');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
  const create=page.getByRole('button',{name:/Create Work Order/});const footer=await create.boundingBox();assert.ok(footer.y>=0 && footer.y+footer.height<=size.height+1,'Create action stays visible');
  await create.click();
  await page.waitForFunction(()=>window.__inserts?.some(record=>record.table==='work_order_tasks'));
  const inserts=await page.evaluate(()=>window.__inserts);
  assert.equal(inserts.find(record=>record.table==='work_orders').value[0].labor_phase_id,'rough');
  assert.deepEqual(inserts.find(record=>record.table==='work_order_tasks').value.map(task=>task.project_task_id),['assigned'],'Only explicit tasks assigned');
  await page.goto('http://127.0.0.1:5187?checklist');
  await page.getByText('Tasks for this work order',{exact:true}).waitFor();
  assert.equal(await page.getByText('Assigned install',{exact:true}).count(),1);
  await page.locator('summary').click();await page.getByText('Other rough work',{exact:true}).waitFor();
  assert.equal(await page.getByText('Trim work',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Browse all phases',exact:true}).click();await page.getByText('Trim work',{exact:true}).waitFor();
  assert.equal(await page.locator('ul button').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[],'No browser runtime errors');
  await page.close();
 }
 console.log('Browser checks passed at 320px, 390px, short viewport, and desktop widths.');
} finally {await browser.close();await server.close();}
