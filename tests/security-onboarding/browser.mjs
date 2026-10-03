import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort'],{
 cwd:new URL('../../',import.meta.url),stdio:'ignore',env:{...process.env,VITE_SUPABASE_URL:'https://security-test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'},
});
process.on('exit',()=>server.kill());
let serverReady=false;
for(let attempt=0;attempt<50;attempt++) {
 try {serverReady=(await fetch('http://127.0.0.1:5173/tests/security-onboarding/browser.html')).ok;} catch { /* Starting */ }
 if(serverReady) break;
 await new Promise(resolve=>setTimeout(resolve,200));
}
assert.ok(serverReady,'Test Vite server started');
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/' : import.meta.url);
const { chromium }=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844}});
let saves=[]; let failNext=false; let added=false; let tokenized=false;
const existingMethod={id:'00000000-0000-0000-0000-000000000013',payment_type:'ach',display_brand:'Existing Bank',display_last4:'1234',exp_month:null,exp_year:null};
const newMethod={...existingMethod,id:'00000000-0000-0000-0000-000000000014',display_brand:'New Bank',display_last4:'6789'};
const contact={full_name:'Test Customer',email:'customer@example.com',phone:'5551231234',address_line1:'1 Main Street',city:'Topeka',state:'KS',zip_code:'66604'};
const document={contract_number:'SC-1',monthly_price:35,term_months:36,renewal_term_months:1,cancellation_notice_days:30,billing_mode:'autopay',mail_invoice_fee:0,autopay_authorization:'I authorize recurring automatic payments for security monitoring.',services:[{name:'Monitoring',monthly_price:35}],template:{name:'Monitoring agreement',contract_terms:'First clause\n\n' + 'Long readable terms. '.repeat(700)+'\n\nFINAL CLAUSE INCLUDED'},dealer:{company_name:'Electronic Life',company_email:'support@example.com',annual_billing_enabled:false,default_billing_preference:'monthly'}};
let agreement={id:'00000000-0000-0000-0000-000000000005',status:'pending_customer',contact,document,document_version:'v1',signed_snapshot_available:false,customer_signature:null,customer_signature_date:null,customer_completed_at:null,draft:{revision:0,current_step:1,form_data:null,saved_at:null}};
await context.route('https://security-test.supabase.co/**',async route=>{
 const body=route.request().postDataJSON();
 if(route.request().url().includes('/functions/v1/security-payment-methods')) {
  if(body.action==='list') return route.fulfill({json:{methods:added?[existingMethod,newMethod]:[existingMethod],environment:'sandbox'}});
  if(body.action==='add') {assert.equal(body.tokenValue,'qb-token');assert.equal(body.accountNumber,undefined);added=true;return route.fulfill({json:{method:newMethod}});}
  if(body.action==='verify') {assert.equal(body.methodId,newMethod.id);return route.fulfill({json:{method:newMethod}});}
 }
 if(body?.p_action==='get')return route.fulfill({json:agreement});
 if(body?.p_action==='save'){
  if(failNext){failNext=false;return route.fulfill({status:500,json:{message:'Simulated connection failure'}});}
  saves.push(body.p_payload);
  const p=body.p_payload;
  if(p.revision!==agreement.draft.revision)return route.fulfill({status:409,json:{message:'Updated in another window'}});
  agreement.draft={...p,revision:p.revision+1,saved_at:new Date().toISOString()};
  return route.fulfill({json:{revision:agreement.draft.revision,saved_at:agreement.draft.saved_at}});
 }
 if(body?.p_action==='submit'){
  const p=body.p_payload;
  agreement={...agreement,status:'pending_approval',customer_signature:p.signature,customer_signature_date:new Date().toISOString(),customer_completed_at:new Date().toISOString(),signed_snapshot_available:true,draft:null,document:{...document,...p.form_data,accepted_at:new Date().toISOString()}};
  return route.fulfill({json:{success:true}});
 }
 return route.fulfill({json:[]});
});
await context.route('https://sandbox.api.intuit.com/**',async route=>{
 const body=route.request().postDataJSON();assert.equal(body.bankAccount.accountNumber,'110000006789');tokenized=true;
 return route.fulfill({json:{value:'qb-token'}});
});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:5173/tests/security-onboarding/browser.html?token=00000000-0000-0000-0000-000000000007';
await page.goto(url);
await page.evaluate(() => { document.documentElement.style.colorScheme = 'dark'; });
await page.getByPlaceholder('Enter your full legal name').waitFor();
assert.deepEqual(await page.getByPlaceholder('Enter your full legal name').evaluate(el => { const s = getComputedStyle(el); return [s.colorScheme, s.backgroundColor, s.color]; }), ['light', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)'], 'White controls with black text inside a dark workspace');
await page.getByText('All changes saved',{exact:true}).waitFor();
await page.getByPlaceholder('Enter your full legal name').fill('Josh Test');
await page.getByText('All changes saved',{exact:true}).waitFor();
await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('heading',{name:'Property Details'}).waitFor();
await page.reload();
await page.getByRole('heading',{name:'Property Details'}).waitFor();
assert.equal(agreement.draft.current_step,2,'Current step restored after reload');
await page.getByRole('button',{name:'Back',exact:true}).click();
assert.equal(await page.getByPlaceholder('Enter your full legal name').inputValue(),'Josh Test');
failNext=true;
await page.getByPlaceholder('Enter your full legal name').fill('New Draft Name');
await page.getByText('Simulated connection failure').waitFor();
await page.getByRole('button',{name:'Retry save'}).click();
await page.getByText('All changes saved',{exact:true}).waitFor();
await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('button',{name:'Add Emergency Contact'}).click();
await page.getByRole('button',{name:'Add Emergency Contact'}).click();
for(let i=0;i<2;i++){
 await page.getByPlaceholder('Full name',{exact:true}).nth(i).fill('Contact '+i);
 await page.getByPlaceholder('(123) 456-7890',{exact:true}).nth(i).fill('555111111'+i);
 await page.getByPlaceholder('Unique codeword',{exact:true}).nth(i).fill('secret-'+i);
}
await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('button',{name:/Existing Bank ending 1234/}).click();
await page.getByRole('button',{name:'Add payment method',exact:true}).click();
await page.getByRole('combobox',{name:'Payment method type'}).selectOption('ach');
await page.getByLabel('Account holder name',{exact:true}).fill('Josh Test');
await page.getByLabel('Routing number',{exact:true}).fill('322079353');
await page.getByLabel('Account number',{exact:true}).fill('110000006789');
await page.getByLabel('Account holder phone',{exact:true}).fill('5551231234');
await page.getByRole('button',{name:'Save payment method',exact:true}).click();
await page.getByRole('button',{name:/New Bank ending 6789/}).waitFor();
assert.ok(tokenized && added,'Payment numbers tokenize directly with Intuit and token is stored server-side');
await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('heading',{name:'Sign Agreement'}).waitFor();
await page.getByRole('button',{name:'Save and finish later'}).click();
await page.getByText(/Your place is saved/).waitFor();
await page.reload();
await page.getByRole('heading',{name:'Sign Agreement'}).waitFor();
assert.equal(await page.getByRole('button',{name:'Tap to Sign'}).count(),1,'Signature is not restored');
const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download agreement',exact:true}).click()]);
assert.equal(download.suggestedFilename(),'SC-1-agreement.html');
await download.saveAs('/tmp/mjv-security-agreement.html');
const html=await readFile('/tmp/mjv-security-agreement.html','utf8');
assert.ok(html.includes('FINAL CLAUSE INCLUDED'));
assert.ok(!html.includes('secret-0'),'Downloaded agreement excludes monitoring codewords');
await page.getByText('Review terms and conditions',{exact:true}).click();
await page.screenshot({path:'/tmp/mjv-security-mobile.png',fullPage:true});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile page has no horizontal overflow');
await page.getByRole('button',{name:'Tap to Sign'}).click();
const box=await page.locator('canvas').boundingBox();
await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+180,box.y+100,{steps:10});await page.mouse.up();
await page.getByRole('button',{name:'Save Signature'}).click();
const complete=page.getByRole('button',{name:'Submit Agreement',exact:true});
assert.ok(await complete.isDisabled(),'Agreement and AutoPay consent required');
assert.equal(await page.getByRole('checkbox').nth(0).evaluate(el => getComputedStyle(el).colorScheme), 'light', 'Native checkboxes stay light');
await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
await complete.click();
await page.getByRole('heading',{name:'Agreement submitted',exact:true}).waitFor();
agreement.summary={monthly_price:35,amount_due:35,pending_payment_amount:0,start_date:'2026-09-30',initial_term_end:'2029-09-30',term_months:36,months_remaining:36,initial_term_complete:false,renewal_term_months:1,next_debit_at:null,billing_frequency:'monthly',billing_mode:'autopay',mail_invoice_fee:0,autopay_paused:false,autopay_revoked_at:null,latest_billing_status:'notice',invoices:[{number:'INV-1',status:'submitted',total:35,amount_due:35,due_date:'2026-10-10',payment_status:'notice'}]};
await page.reload();
await page.getByRole('region',{name:'Contract details'}).waitFor();
assert.equal(await page.getByText('Months left in initial term',{exact:true}).count(),1);
assert.equal(await page.getByRole('cell',{name:'INV-1',exact:true}).count(),1);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Contract summary fits mobile width');

const [signedDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download signed agreement',exact:true}).click()]);
await signedDownload.saveAs('/tmp/mjv-security-signed-agreement.html');
assert.ok((await readFile('/tmp/mjv-security-signed-agreement.html','utf8')).includes('Customer signature'));
await page.goto('file:///tmp/mjv-security-agreement.html');
await page.emulateMedia({media:'print'});
await page.pdf({path:'/tmp/mjv-security-agreement.pdf',format:'Letter'});
assert.ok(await page.getByText('FINAL CLAUSE INCLUDED',{exact:false}).count());
assert.ok(saves.every(s=>s.form_data.paymentDetails===undefined && s.form_data.signature===undefined && !JSON.stringify(s).includes('110000006789')),'All browser draft requests omit payment data and signatures');
assert.deepEqual(errors,[],'No runtime errors');
const staffContext=await browser.newContext({viewport:{width:390,height:844}});
let insertedContract;
await staffContext.route('https://security-test.supabase.co/**', async route => {
  const u = new URL(route.request().url());
  if (u.pathname.endsWith('/auth/v1/user')) return route.fulfill({json:{id:'staff-user'}});
  if (u.pathname.endsWith('/security_contract_templates')) return route.fulfill({json:[{id:'template-1',name:'Monitoring',description:'Initial term [term]'}]});
  if (u.pathname.endsWith('/monitoring_services')) return route.fulfill({json:[{id:'service-1',name:'Monitoring',monthly_price:35,category:'Monitoring'}]});
  if (u.pathname.endsWith('/contacts')) return route.fulfill({json:{id:'00000000-0000-0000-0000-000000000004',first_name:'Test',last_name:'Customer',full_name:'Test Customer',email:'customer@example.com',phone:'5551231234',street_address:'1 Main Street',city:'Topeka',state:'KS',zip_code:'66604',company_name:''}});
  if (u.pathname.endsWith('/profiles')) return route.fulfill({json:{role:'admin',organization_id:'org-1'}});
  if (u.pathname.endsWith('/rpc/staff_security_onboarding') && route.request().method()==='POST') {
    insertedContract={...route.request().postDataJSON().p_payload,renewal_term_months:1};
    return route.fulfill({json:{id:'new-contract',...insertedContract}});
  }
  return route.fulfill({json:[]});
});
const staffPage=await staffContext.newPage();
// Supply a synthetic authenticated session. No real credentials are used.
await staffPage.addInitScript(() => {
  localStorage.setItem('sb-security-test-auth-token',JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'staff-user'}}));
  document.documentElement.style.colorScheme='dark';
});
await staffPage.goto('http://127.0.0.1:5173/tests/security-onboarding/browser.html?staff');
await staffPage.getByRole('button',{name:'36 months',exact:true}).waitFor();
assert.equal(await staffPage.getByRole('button',{name:'36 months',exact:true}).getAttribute('aria-pressed'),'true','36 is the default');
for (const months of [12,24,36,48,60]) {
  const term=staffPage.getByRole('button',{name:`${months} months`,exact:true});
  await term.click();
  assert.equal(await term.getAttribute('aria-pressed'),'true');
  insertedContract=undefined;
  await staffPage.getByRole('button',{name:'Create Agreement',exact:true}).click();
  for (let attempt=0;attempt<50 && !insertedContract;attempt++) await new Promise(resolve=>setTimeout(resolve,100));
  await staffPage.getByRole('button',{name:'Create Agreement',exact:true}).waitFor();
  assert.equal(insertedContract?.term_months,months,'Selected initial term is saved');
  assert.equal(insertedContract?.renewal_term_months,1,'Renewal remains month-to-month');
}
for (const selector of ['input[type="text"]','select','textarea','input[type="checkbox"]']) {
  assert.deepEqual(await staffPage.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);return [s.colorScheme,s.backgroundColor,s.color];}),['light','rgb(255, 255, 255)','rgb(0, 0, 0)']);
}
assert.ok(await staffPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Staff creation fits mobile');
let printPayload;
await staffContext.route('https://security-test.supabase.co/functions/v1/generate-blank-contract-form',async route=>{printPayload=route.request().postDataJSON();await route.fulfill({contentType:'text/html',body:'<h1>Handwritten onboarding form</h1>'});});
await staffPage.goto('http://127.0.0.1:5173/tests/security-onboarding/browser.html?print');
await staffPage.getByRole('combobox',{name:'Agreement template'}).selectOption('template-1');
await staffPage.getByRole('combobox',{name:'Initial term'}).selectOption('24');
await staffPage.getByRole('checkbox').check();
insertedContract=undefined;
const [paperPopup]=await Promise.all([staffPage.waitForEvent('popup'),staffPage.getByRole('button',{name:'Print Blank Form',exact:true}).click()]);
await paperPopup.getByRole('heading',{name:'Handwritten onboarding form'}).waitFor();
assert.equal(printPayload.term_months,24);assert.deepEqual(printPayload.service_ids,['service-1']);assert.equal(insertedContract,undefined,'Blank printing never calls contract creation');
assert.ok(await staffPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Blank print options fit mobile');
await paperPopup.close();
await staffPage.goto('file:///tmp/mjv-security-blank-form.html');await staffPage.emulateMedia({media:'print'});
await staffPage.pdf({path:'/tmp/mjv-security-blank-form.pdf',format:'Letter'});
assert.ok(await staffPage.getByText('FINAL CLAUSE INCLUDED',{exact:false}).count());
await staffContext.close();
const reviewContext=await browser.newContext({viewport:{width:390,height:844}});
const reviewRecord={id:'review-contract',organization_id:'org-1',status:'pending_approval',customer_completed_at:'2026-10-01T12:00:00Z',onboarding_revision:0,
  contract_number:'SC-REVIEW',monthly_price:35,term_months:36,renewal_term_months:1,cancellation_notice_days:30,account_type:'residential',security_billing_mode:'autopay',service_account_numbers:{alarm_com:'Original account'},
  contact,emergency_contacts:[{contact_name:'First',phone_number:'5551111111',password_codeword:'one',can_authorize_entry:true},{contact_name:'Second',phone_number:'5552222222',password_codeword:'two',can_authorize_entry:false}],onboarding_agreement_snapshot:{...document,personalInfo:contact,propertyInfo:{address_line1:'1 Main',city:'Topeka',state:'KS',zip_code:'66604'}},services:[]};
let correctionCount=0;
await reviewContext.addInitScript(record=>{window.__reviewRecord=record;document.documentElement.style.colorScheme='dark';},reviewRecord);
await reviewContext.route('https://security-test.supabase.co/**',async route=>{
 if(route.request().url().includes('/rpc/security_correct_onboarding')) {
  const body=route.request().postDataJSON();assert.equal(body.p_revision,correctionCount);assert.ok(body.p_reason);
  correctionCount++;
  await reviewPage.evaluate(patch=>{window.__reviewRecord={...window.__reviewRecord,...patch,onboarding_revision:window.__reviewRecord.onboarding_revision+1};},body.p_patch);
  return route.fulfill({json:{revision:correctionCount}});
 }
 return route.fulfill({json:[]});
});
const reviewPage=await reviewContext.newPage();
await reviewPage.goto('http://127.0.0.1:5173/tests/security-onboarding/browser.html?review');
await reviewPage.getByRole('heading',{name:'Review completed contract'}).waitFor();
assert.equal(await reviewPage.locator('input,textarea,select').count(),0,'All review fields are locked by default');
await reviewPage.getByRole('button',{name:'Edit Alarm.com account number',exact:true}).click();
await reviewPage.getByRole('textbox',{name:'Alarm.com account number',exact:true}).fill('Accidental edit');
await reviewPage.getByRole('button',{name:'Cancel',exact:true}).click();
assert.equal(correctionCount,0,'Cancel does not persist changes');
await reviewPage.getByText('Original account',{exact:true}).waitFor();
await reviewPage.getByRole('button',{name:'Edit Alarm.com account number',exact:true}).click();
await reviewPage.getByRole('textbox',{name:'Alarm.com account number',exact:true}).fill('1234567');
await reviewPage.getByRole('textbox',{name:'Reason for correction'}).fill('Manager entered account number');
await reviewPage.getByRole('button',{name:'Save correction',exact:true}).click();
await reviewPage.getByText('1234567',{exact:true}).waitFor();
assert.equal(correctionCount,1);assert.equal(await reviewPage.locator('input,textarea,select').count(),0,'Fields relock after saving');
await reviewPage.getByRole('button',{name:'Edit Phone',exact:true}).click();
assert.deepEqual(await reviewPage.getByRole('textbox',{name:'Phone',exact:true}).evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color];}),['rgb(255, 255, 255)','rgb(0, 0, 0)']);
await reviewPage.getByRole('button',{name:'Cancel',exact:true}).click();
assert.ok(await reviewPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Review fits mobile');
await reviewPage.goto('http://127.0.0.1:5173/tests/security-onboarding/browser.html?review&readonly');
await reviewPage.getByRole('heading',{name:'Review completed contract'}).waitFor();assert.equal(await reviewPage.getByRole('button',{name:/^Edit /}).count(),0,'Read-only staff do not receive edit controls');
await reviewContext.close();
const activation=await context.newPage();
await activation.goto('http://127.0.0.1:5173/tests/security-onboarding/browser.html?activation');
const startInput=activation.getByLabel('Monitoring starts',{exact:true}),firstInput=activation.getByLabel('First payment scheduled',{exact:true});
assert.equal(await startInput.isDisabled(),true);assert.equal(await firstInput.isDisabled(),true);assert.equal(await activation.getByRole('button',{name:'Complete and Activate'}).isDisabled(),true);
await activation.getByRole('button',{name:'Edit activation dates'}).click();await startInput.fill('2026-11-10');await firstInput.fill('2026-11-25');
await activation.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await startInput.inputValue(),'');
await activation.getByRole('button',{name:'Edit activation dates'}).click();await startInput.fill('2026-11-10');await firstInput.fill('2026-11-25');
assert.deepEqual(await firstInput.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color];}),['rgb(255, 255, 255)','rgb(0, 0, 0)']);
await activation.getByRole('button',{name:'Save activation dates'}).click();assert.equal(await firstInput.isDisabled(),true);assert.equal(await activation.getByRole('button',{name:'Complete and Activate'}).isDisabled(),false);
assert.ok(await activation.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Activation dates fit mobile');
await activation.close();
await context.addInitScript(()=>{window.__summary={monthly_price:35,amount_due:0,pending_payment_amount:0,start_date:'2026-11-10',first_payment_date:'2026-11-25',first_payment_made_at:null,initial_term_end:'2027-11-10',term_months:12,months_remaining:12,initial_term_complete:false,renewal_term_months:1,next_debit_at:null,billing_frequency:'monthly',billing_mode:'autopay',mail_invoice_fee:0,autopay_paused:false,autopay_revoked_at:null,latest_billing_status:null,invoices:[]};});
const summaryPage=await context.newPage();await summaryPage.goto('http://127.0.0.1:5173/tests/security-onboarding/browser.html?summary');
await summaryPage.getByText('First payment scheduled:',{exact:false}).waitFor();assert.ok((await summaryPage.locator('body').innerText()).includes('Not yet confirmed'));
await summaryPage.close();
await context.close();await browser.close();
server.kill();
console.log('Browser tests passed: all five initial terms saved with monthly renewal, light controls in dark theme, mobile resume, failure/retry, save for later, signature reset, existing/new payment selection, AutoPay consent, signed download and print layout.');
