import assert from 'node:assert/strict';import {chromium} from 'playwright';import {createServer} from 'vite';
const server=await createServer({configFile:'tests/leads/browser/vite.config.mjs'});await server.listen();const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
try{for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5197');
await page.getByPlaceholder('John Doe').waitFor();assert.equal(await page.getByText('Username',{exact:false}).count(),0);assert.equal(await page.getByPlaceholder('Acme Corp').count(),0);
const layout=await page.evaluate(()=>{const dialog=document.querySelector('[role="dialog"]');const body=dialog?.querySelector('.qam-body');const overlay=dialog?.parentElement;return {bodyOverflow:body&&getComputedStyle(body).overflowY,overlayOverflow:overlay&&getComputedStyle(overlay).overflowY,dialogWidth:dialog?.getBoundingClientRect().width,viewportWidth:innerWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth}});
assert.equal(layout.bodyOverflow,'visible','New Lead must not scroll inside its modal body');
assert.equal(layout.overlayOverflow,'auto','New Lead should scroll as one overlay page');
assert.ok(layout.dialogWidth<=layout.viewportWidth+1,'Dialog must fit viewport width');
assert.equal(layout.horizontalOverflow,false,'No horizontal page overflow');
await page.getByLabel('Business customer').check();await page.getByPlaceholder('Acme Corp').fill('Business');await page.getByLabel('Business customer').uncheck();assert.equal(await page.getByPlaceholder('Acme Corp').count(),0);
await page.getByRole('button',{name:'Existing Customer',exact:true}).click();assert.ok(await page.getByRole('button',{name:'Create Lead',exact:true}).isDisabled());
const search=page.getByPlaceholder('Search by name, company, email, or phone...');await search.fill('Alex');
assert.equal(await page.locator('[class*="max-h-64"][class*="overflow-y-auto"]').count(),0,'Customer results must not have nested scrolling');
await page.getByRole('button').filter({hasText:'one@example.com'}).click();assert.equal(await page.getByRole('combobox').inputValue(),'rep');assert.equal(await page.getByPlaceholder('John Doe').count(),0);
await page.getByRole('button',{expanded:false}).filter({hasText:'Alex Smith'}).click();await page.getByText('1 First St, Topeka, KS, 66601',{exact:true}).waitFor();await page.getByText('785-111-1111',{exact:true}).waitFor();
await page.getByRole('combobox').selectOption('fishbowl');await page.getByRole('button',{name:'Change',exact:true}).click();await search.fill('Alex');await page.getByRole('button').filter({hasText:'two@example.com'}).click();assert.equal(await page.getByRole('combobox').inputValue(),'fishbowl');
await page.getByRole('button',{name:'Create Lead',exact:true}).click();await page.waitForFunction(()=>window.__writes?.some(x=>x.table==='leads'));const lead=await page.evaluate(()=>window.__writes.find(x=>x.table==='leads').data);assert.equal(lead.converted_from_contact_id,'two');assert.equal(lead.assigned_to,null);assert.equal(lead.is_fishbowl,true);assert.ok(lead.username);assert.deepEqual(errors,[]);await page.close();
}console.log('Lead browser checks passed: responsive page scrolling, mobile, business fields, duplicate identities, details, rep inheritance, queue and generated handle.');}finally{await browser.close();await server.close();}
