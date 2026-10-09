import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.USER_SETUP_PLAYWRIGHT_MODULE || 'playwright');
const directory = await mkdtemp(join(tmpdir(), 'mjv-user-browser-'));
const root = process.cwd();
const fixture = `
window.calls=[];
const profile={id:'employee',organization_id:'org',role:'sales',role_id:'role',employment_classification:'employee',full_name:'Test Employee',email:'employee@example.com',username:'testemployee',is_active:true};
const config={id:'config',effective_from:'2026-01-01',effective_to:null,compensation_type:'hourly',requires_daily_clock:true,requires_time_allocation:true,payroll_time_basis:'daily_clock',expected_weekly_hours:40,standard_start_time:'08:00:00',standard_end_time:'17:00:00',work_days:['monday','tuesday','wednesday','thursday','friday'],overtime_eligible:true,pto_eligible:true,pay_schedule_id:'schedule',reviewed_at:'2026-01-01'};
const departments=Array.from({length:5},(_,i)=>({id:'dept'+i,display_name:['Pipeline','Production','Dispatch','Finance','Admin'][i],name:'dept'+i,color:'#0088cc',is_active:true}));
const modules=departments.flatMap(d=>Array.from({length:8},(_,i)=>({id:d.id+'module'+i,department_id:d.id,display_name:d.display_name+' Module '+(i+1),module_key:'module'+i,is_active:true})));
const records={roles:[{id:'role',role_key:'sales',display_name:'Sales',description:'Sales role'},{id:'adminrole',role_key:'admin',display_name:'Administrator',description:'Admin role'}],company_offices:[{id:'office',office_name:'Topeka'}],departments,role_department_access:departments.map(d=>({department_id:d.id,has_access:true})),department_modules:modules,role_module_access:modules.map(m=>({module_id:m.id,has_access:true})),pay_schedules:[{id:'schedule',name:'Weekly',frequency:'weekly',is_active:true}],profiles:[profile],employees:[{id:'emp',user_id:'employee',hire_date:'2026-01-01',employment_status:'active',termination_date:null,employee_number:'100'}],employee_payroll_configs:[config],user_offices:[{office_id:'office'}],user_setup_reviews:[{user_id:'employee',reviewed_sections:['profile','access','permissions','notifications','pay','sales']}]};
if(location.search.includes('unreviewed')){profile.employment_classification='unreviewed';records.employees=[];records.employee_payroll_configs=[];}
export const supabase={from(table){let one=false;let operation='select';let input;let columns='*';const filters=[];const result=()=>{let data=records[table]||[];if(table==='profiles'&&filters.some(f=>f[0]==='id'&&f[1]==='admin'))data=[{id:'admin',role:'admin'}];if(operation!=='select')window.calls.push({table,operation,input});if(operation==='update'&&table==='profiles'&&window.fixtureUpdateError)return Promise.resolve({data:null,error:{message:'Fixture update rejected',code:'TEST'}});if(window.fixtureFail===table)return Promise.resolve({data:null,error:{message:'Fixture failure'}});if(operation==='upsert'&&table==='user_setup_reviews')records[table]=[input];return Promise.resolve({data:one?(data[0]||null):data,error:null});};const q=new Proxy({},{get(_,k){if(k==='then')return (done,fail)=>result().then(done,fail);if(k==='single'||k==='maybeSingle')return ()=>{one=true;return result()};if(k==='select')return c=>{columns=c;return q};if(k==='eq')return (k,v)=>{filters.push([k,v]);return q};if(['update','insert','delete','upsert'].includes(k))return v=>{operation=k;input=v;return q};return()=>q}});return q},auth:{getUser:async()=>({data:{user:{id:'admin'}}}),getSession:async()=>({data:{session:{access_token:'fixture'}}})},rpc:async(name,input)=>{window.calls.push({rpc:name,input});return {error:window.fixtureRpcError===name?{message:'Fixture setup rejected'}:null}}};
export {profile};`;
const source = `import React from 'react';import {createRoot} from 'react-dom/client';import {AddUserForm} from './src/components/Admin/AddUserForm';import {EditUserForm} from './src/components/Admin/EditUserForm';import {profile} from 'fixture';window.fetch=async(url,options)=>{window.calls.push({create:true,input:JSON.parse(options.body)});return {ok:true,json:async()=>({user:{id:'newuser'}})}};createRoot(document.getElementById('root')).render(location.search.includes('edit')?<EditUserForm user={profile} onClose={()=>{window.formClosed=true}} onSuccess={()=>{window.saved=true}}/>:<AddUserForm onClose={()=>{}} onSuccess={()=>{window.created=true}}/>);`;
let browser;
const server = createServer(async (req, res) => {
  try {
    const filename = req.url?.startsWith('/app.js')
      ? 'app.js'
      : req.url?.startsWith('/style.css')
        ? 'style.css'
        : 'index.html';
    res.setHeader(
      'Content-Type',
      filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html',
    );
    res.end(await readFile(join(directory, filename)));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
try {
  await build({
    stdin: { contents: source, resolveDir: root, loader: 'tsx' },
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    outfile: join(directory, 'app.js'),
    define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://fixture.example"' },
    plugins: [
      {
        name: 'fixture',
        setup(b) {
          b.onResolve({ filter: /lib\/supabase$|^fixture$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture }));
        },
      },
    ],
  });
  const css = (await readdir('dist/assets')).find((p) => p.startsWith('index-') && p.endsWith('.css'));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(directory, 'style.css'), await readFile('dist/assets/' + css));
  await writeFile(
    join(directory, 'index.html'),
    '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>',
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('Browser console', m.text());
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Review / User Card', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Create User', exact: true }).isEnabled(), false);
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByPlaceholder('John Doe').fill('New Employee');
  await page.getByPlaceholder('john@example.com').fill('new@example.com');
  await page.getByRole('button', { name: 'Review & Continue' }).click();
  await page.getByPlaceholder('Minimum 6 characters').fill('NeverPrintThis');
  await page.getByRole('button', { name: /^Employee.*Enable/ }).click();
  await page.getByRole('button', { name: 'Review & Continue' }).click();
  await page.getByRole('button', { name: 'Review & Continue' }).click();
  await page.getByLabel('Mentions', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Review & Continue' }).click();
  await page.getByRole('button', { name: 'Review & Continue' }).click();
  assert.ok((await page.locator('form').innerText()).includes('pay schedule'));
  await page.locator('select').last().selectOption('schedule');
  await page.getByRole('button', { name: 'Review & Continue' }).click();
  await page.getByLabel(/^Technician/).check();
  await page.getByLabel(/^Sales Rep/).check();
  await page.getByRole('button', { name: 'Review & Continue' }).click();

  assert.equal(await page.evaluate(() => window.calls.filter((c) => c.create).length), 0);
  assert.equal(await page.getByRole('button', { name: 'Create User', exact: true }).isEnabled(), true);
  assert.equal((await page.locator('.user-data-card').innerText()).includes('NeverPrintThis'), false);
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await page.waitForFunction(() => window.created);
  assert.equal(await page.evaluate(() => window.calls.filter((c) => c.create).length), 1);
  assert.ok(
    await page.evaluate(() =>
      window.calls.some((c) => c.rpc === 'classify_as_employee' && c.input.p_pay_schedule_id === 'schedule'),
    ),
  );
  assert.ok(
    await page.evaluate(() => window.calls.some((c) => c.table === 'profiles' && c.input?.notify_on_mention === false)),
  );
  assert.ok(await page.evaluate(() => window.calls.some(c => c.create && c.input.is_technician === true && c.input.is_sales_rep === true)));
  await page.goto(url + '/?edit');
  await page.getByRole('button', {name:'Assignments & Sales',exact:true}).click();
  await page.getByLabel(/^Technician/).check();
  await page.getByLabel('Sales representative (business designation)',{exact:true}).check();
  await page.getByRole('button', { name: 'Pay & Time', exact: true }).click();
  const hours = page.locator('input[type="number"]').last();
  await hours.fill('35');
  const effective = page.locator('input[type="date"]');
  await effective.fill('2026-11-01');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.waitForFunction(() => window.saved && window.formClosed);
  assert.ok(await page.evaluate(() => window.calls.some(c => c.table === 'profiles' && c.operation === 'update' && c.input.is_technician === true && c.input.is_sales_rep === true)));
  assert.ok(
    await page.evaluate(() =>
      window.calls.some(
        (c) =>
          c.rpc === 'update_employee_and_config' &&
          c.input.p_effective_date === '2026-11-01' &&
          c.input.p_expected_weekly_hours === 35,
      ),
    ),
  );
  await page.goto(url + '/?edit');
  for (const name of [
    'Profile',
    'Access & Employment',
    'Permissions',
    'Notifications',
    'Pay & Time',
    'Assignments & Sales',
    'Review / User Card',
  ])
    await page.getByRole('button', { name, exact: true }).click();
  assert.ok((await page.locator('.user-data-card').innerText()).includes('Admin Module 8: Enabled'));
  if (process.env.USER_SETUP_SCREENSHOT_DIR) {
    const dir = resolve(process.env.USER_SETUP_SCREENSHOT_DIR);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: join(dir, 'desktop.png') });
  }
  await page.evaluate(() => {
    const append = Node.prototype.appendChild;
    Node.prototype.appendChild = function (node) {
      const result = append.call(this, node);
      if (node instanceof HTMLIFrameElement)
        node.contentWindow.print = () => {
          window.printRequested = true;
        };
      return result;
    };
  });
  await page.getByRole('button', { name: 'Print / Save as PDF' }).click();
  await page.waitForTimeout(100);
  const printFrame = page.frames()[1];
  assert.ok(printFrame);
  const geometry = await printFrame
    .locator('body')
    .evaluate((el) => ({ scroll: el.scrollHeight, height: el.clientHeight, width: el.scrollWidth }));
  assert.ok(geometry.width<=750);
  assert.equal((await printFrame.locator('body').innerText()).includes('NeverPrintThis'), false);
  const printPage = await browser.newPage({ viewport: { width: 749, height: 955 } });
  await printPage.setContent(await printFrame.content());
  const extents = await printPage
    .locator('dt,dd,p,h2,h3')
    .evaluateAll((nodes) =>
      nodes.map((el) => ({ bottom: el.getBoundingClientRect().bottom, right: el.getBoundingClientRect().right })),
    );
  assert.ok(
    extents.every((r) => r.bottom <= 956 && r.right <= 750),
    'Printed content clipped',
  );
  const pdf=await printPage.pdf({preferCSSPageSize:true});
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1,'User card must fit one PDF page');
  if (process.env.USER_SETUP_SCREENSHOT_DIR) {
    await printPage.screenshot({ path: join(resolve(process.env.USER_SETUP_SCREENSHOT_DIR), 'print.png') });
    await printPage.pdf({
      path: join(resolve(process.env.USER_SETUP_SCREENSHOT_DIR), 'user-card.pdf'),
      preferCSSPageSize: true,
    });
  }
  await printPage.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  for (const section of ['Profile', 'Access & Employment', 'Permissions']) {
    const button = page.getByRole('button', { name: section, exact: true });
    const box = await button.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, 'Every section remains visible on mobile');
    await button.click();
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.USER_SETUP_SCREENSHOT_DIR)
    await page.screenshot({ path: join(resolve(process.env.USER_SETUP_SCREENSHOT_DIR), 'mobile.png') });
  // The legacy restriction must be absent in both forms; selection must be visible
  // and save through the classification RPC without enabling employee payroll.
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto(url + '/?edit&unreviewed');
    await page.getByRole('button', { name: 'Permissions', exact: true }).click();
    assert.equal(await page.getByText('Team Pulse (Discussion) Visibility').count(), 0);
    assert.equal(await page.getByText('Flow Message Visibility', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Access & Employment', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm as Non-Employee User', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Non-Employee Selected', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.ok((await page.getByRole('status').innerText()).includes('Save the user'));
    assert.equal(await page.getByText('This legacy user has not been classified yet.', { exact: false }).count(), 0);
    // Switching to Employee cancels the pending non-employee action.
    await page.getByRole('button', { name: 'Make this person an Employee', exact: true }).click();
    assert.equal(await page.getByRole('status').count(), 0);
    await page.getByRole('button', { name: 'Select Non-Employee Instead', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Non-Employee Selected', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.waitForFunction(() => window.saved && window.formClosed);
    assert.ok(await page.evaluate(() => window.calls.some(c => c.rpc === 'classify_as_non_employee' && c.input.p_user_id === 'employee' && c.input.p_reviewed_by === 'admin')));
    assert.equal(await page.evaluate(() => window.calls.some(c => c.rpc === 'classify_as_employee' || c.rpc === 'update_employee_and_config')), false);
    assert.equal(await page.evaluate(() => window.calls.some(c => c.table === 'profiles' && Object.hasOwn(c.input || {}, 'discussion_visibility_scope'))), false);
  }
  await page.goto(url + '/?edit&unreviewed');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.locator('input[type="text"]').first().fill('');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  assert.ok((await page.getByRole('alert').innerText()).includes('Enter a full name and valid email'));
  assert.equal(await page.evaluate(() => window.calls.some(c => c.table === 'profiles' && c.operation === 'update')), false);
  await page.locator('input[type="text"]').first().fill('Test Employee');
  await page.evaluate(() => {window.fixtureUpdateError=true;});
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByRole('alert').filter({hasText:'Fixture update rejected'}).waitFor();
  assert.equal(await page.evaluate(() => !!window.formClosed), false);
  await page.goto(url + '/?edit');
  await page.evaluate(() => {window.fixtureRpcError='update_employee_and_config';});
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByRole('alert').filter({hasText:'The profile saved, but the remaining setup did not finish'}).waitFor();
  assert.equal(await page.evaluate(() => !!window.formClosed), false);
  await page.goto(url);
  await page.getByRole('button', { name: /^Permissions/ }).click();
  assert.equal(await page.getByText('Team Pulse (Discussion) Visibility').count(), 0);
  assert.equal(await page.getByText('Flow Message Visibility', { exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  console.log('Browser setup, save payloads, future effective date, print content, desktop/mobile navigation passed.');
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await rm(directory, { recursive: true, force: true });
}
