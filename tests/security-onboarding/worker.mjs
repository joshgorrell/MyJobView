import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const {authorizeSecurityWorker}=await import(compile(await readFile(new URL('../../supabase/functions/_shared/security-worker-auth.ts',import.meta.url),'utf8')));
const token='dedicated-worker-test-token-32-characters';
const req=(method='POST',secret=token)=>new Request('https://test/worker',{method,headers:{Authorization:`Bearer ${secret}`}});
let checks=0;
assert.equal(await authorizeSecurityWorker(req('GET'),token,async()=>{checks++;return true;}),false);
assert.equal(await authorizeSecurityWorker(req('POST','browser-jwt'),undefined,async()=>true),false);
assert.equal(await authorizeSecurityWorker(req(),token,async()=>false),true);
assert.equal(await authorizeSecurityWorker(req(),undefined,async()=>true),true);
assert.equal(await authorizeSecurityWorker(req(),undefined,async()=>{throw new Error('unavailable');}),false);
assert.equal(checks,0);
let queue=[],calls=[],chargeCalls=[],qboCalls=[],connected=true,noticeOk=true,balance=35;
const invoice={id:'invoice',qbo_invoice_id:'qb-invoice',invoice_number:'INV-1',total:35,tax_amount:0,due_date:'2026-11-25',invoice_line_items:[]};
const rows={security_contracts:{contact_id:'contact',security_payment_method_id:'method',contract_number:'SC-1'},invoices:invoice,
 contacts:{qbo_customer_id:'qb-customer',email:'test@example.com'},company_settings:{from_email:'billing@example.com',company_email:'support@example.com'},organizations:{subdomain:'test'},security_payment_methods:{payment_type:'ach',qbo_method_id:'vault-bank'}};
const admin={rpc:async(name,args)=>{
 calls.push({name,args});if(name==='security_billing_worker_authorized')return {data:args.p_secret===token,error:null};
 const action=args.p_action;if(action==='lease')return {data:queue.shift()||null,error:null};
 if(action==='charge')return {data:{cycle:{amount:35,request_id:'stable-request-id'},method:rows.security_payment_methods},error:null};
 return {data:{success:true},error:null};
},from:table=>{const query={select:()=>query,update:()=>query,eq:()=>query,single:async()=>({data:rows[table],error:null})};return query;}};
globalThis.__worker={getSupabaseAdmin:()=>admin,getConnection:async()=>({environment:'sandbox',payments_enabled:connected,security_monitoring_item_id:'item'}),getValidAccessToken:async()=>'server-token',
 qboRequest:async(_a,_c,method,path,body)=>{qboCalls.push({method,path,body});return {ok:true,data:path.startsWith('payment?')?{Payment:{Id:'accounting-payment'}}:{Invoice:{Id:'qb-invoice',TotalAmt:invoice.total,Balance:balance}}};},upsertEntityMapping:async()=>{},authorizeSecurityWorker,
 securityCharge:async(...args)=>{chargeCalls.push(args);return {state:args[8]?'paid':'pending',processor_id:'ach-1',processor_status:args[8]?'SETTLED':'PENDING'};}};
const source=(await readFile(new URL('../../supabase/functions/security-recurring-billing/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const shim=`const {getSupabaseAdmin,getConnection,getValidAccessToken,qboRequest,upsertEntityMapping,securityCharge,authorizeSecurityWorker}=globalThis.__worker;\nconst Deno={env:{get:key=>({RESEND_API_KEY:'test-mail-key',SECURITY_ACH_SETTLED_STATUS:'SETTLED'}[key])},serve:h=>{globalThis.__workerHandler=h;}};\n`;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response('{}',{status:noticeOk?200:503});
await import(compile(shim+source));
const cycle=state=>({id:'cycle',contract_id:'contract',organization_id:'org',invoice_id:'invoice',state,lease_token:'lease',amount:35,processor_id:'ach-1'});
const reset=states=>{queue=states.map(cycle);calls=[];chargeCalls=[];qboCalls=[];connected=true;noticeOk=true;balance=35;};
try {
 reset([]);assert.equal((await globalThis.__workerHandler(req('POST','x'.repeat(40)))).status,401);assert.ok(!calls.some(c=>c.args?.p_action==='generate'));
 reset(['preparing','notice']);assert.equal((await globalThis.__workerHandler(req())).status,200);
 assert.deepEqual(calls.filter(c=>c.name==='security_recurring_billing').map(c=>c.args.p_action),['generate','lease','prepare','lease','notice','lease']);assert.equal(chargeCalls.length,0,'Notice never initiates a charge');
 // QB accounting receives the exact itemized customer invoice, including
 // annual discounts and the separately itemized mailed-invoice fee.
 for (const example of [
  {total:50,tax:0,lines:[{description:'Central station monitoring — monthly monitoring, 2026-11-10 through 2026-12-10 (agreement SC-1)',quantity:1,unit_price:35,amount:35},{description:'Alarm.com cellular service — monthly monitoring, 2026-11-10 through 2026-12-10 (agreement SC-1)',quantity:1,unit_price:15,amount:15}]},
  {total:686.4,tax:62.4,lines:[{description:'Central station monitoring — annual monitoring, 2026-11-10 through 2027-11-10 (agreement SC-1)',quantity:1,unit_price:378,amount:378},{description:'Alarm.com cellular service — annual monitoring, 2026-11-10 through 2027-11-10 (agreement SC-1)',quantity:1,unit_price:162,amount:162},{description:'Mailed invoice fee ($7 per month), 2026-11-10 through 2027-11-10',quantity:12,unit_price:7,amount:84}]},
 ]) {
  reset(['notice']);Object.assign(invoice,{qbo_invoice_id:null,total:example.total,tax_amount:example.tax,invoice_line_items:example.lines});
  await globalThis.__workerHandler(req());
  const synced=qboCalls.find(c=>c.path.startsWith('invoice?'));
  assert.ok(synced,'Recurring invoice is sent to QuickBooks before the notice');
  assert.deepEqual(synced.body.Line.map(l=>({description:l.Description,quantity:l.SalesItemLineDetail.Qty,unit_price:l.SalesItemLineDetail.UnitPrice,amount:l.Amount})),example.lines,'Accounting sees the same service descriptions, quantities, unit prices and line costs');
  assert.equal(synced.body.CustomerRef.value,'qb-customer');assert.equal(synced.body.DocNumber,invoice.invoice_number);assert.equal(synced.body.DueDate,invoice.due_date);
  assert.equal(synced.body.TxnTaxDetail.TotalTax,example.tax);
  assert.equal(Math.round((synced.body.Line.reduce((sum,l)=>sum+l.Amount,0)+example.tax)*100),Math.round(example.total*100));
  assert.equal(chargeCalls.length,0,'Invoice synchronization cannot itself charge the customer');
 }
 Object.assign(invoice,{qbo_invoice_id:'qb-invoice',total:35,tax_amount:0,invoice_line_items:[]});
 reset(['notice']);noticeOk=false;await globalThis.__workerHandler(req());assert.ok(calls.some(c=>c.args?.p_action==='defer'));assert.ok(!calls.some(c=>c.args?.p_action==='notice'));
 reset(['ready']);rows.invoices=null;await globalThis.__workerHandler(req());assert.equal(chargeCalls.length,0,'Missing invoice prevents an automatic debit');rows.invoices=invoice;
 reset(['ready']);connected=false;await globalThis.__workerHandler(req());assert.equal(chargeCalls.length,0);
 reset(['ready']);balance=34;await globalThis.__workerHandler(req());assert.equal(chargeCalls.length,0);
 reset(['ready','pending','paid']);await globalThis.__workerHandler(req());
 assert.equal(chargeCalls.length,2);assert.equal(chargeCalls[0][5],'stable-request-id');assert.equal(chargeCalls[0][8],undefined);assert.equal(chargeCalls[1][8],'ach-1','Pending settlement is reconciled with the existing processor ID');
 const results=calls.filter(c=>c.args?.p_action==='result');assert.deepEqual(results.map(c=>c.args.p_payload.state),['pending','paid']);
 assert.equal(qboCalls.find(c=>c.path.startsWith('payment?')).body.Line[0].LinkedTxn[0].TxnId,'qb-invoice','Accounting receipt applies to the exact invoice');
 assert.equal(qboCalls.find(c=>c.path.startsWith('payment?')).body.ProcessPayment,false,'Accounting recording cannot debit the customer again');
 assert.ok(calls.some(c=>c.args?.p_action==='accounting'));
} finally {globalThis.fetch=originalFetch;delete globalThis.__worker;delete globalThis.__workerHandler;}
console.log('Billing worker tests passed: dedicated authentication, invoice preparation, notice failures, setup and balance guards, pending settlement reconciliation, and accounting without a second charge.');
