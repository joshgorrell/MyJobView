import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('supabase/functions/invoice-portal-delivery/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function run({authorized=true,invoiceStatus='submitted',portal=true,email='customer@example.com',sendOK=true,savedPayload=null}={}) {
 let handler;const updates=[],messages=[],calls=[];
 const invoice={id:'invoice',organization_id:'org',status:invoiceStatus,portal_visible:portal,invoice_number:'42',amount_due:425,total:425,work_order_billing_request_id:'request',qbo_payment_url:'https://connect.intuit.com/pay/real',contacts:{email,full_name:'Customer <unsafe>'}};
 const db={rpc:async(name)=>{calls.push(name);return {data:name==='security_billing_worker_authorized'?authorized:[{invoice_id:'invoice',organization_id:'org',attempts:1,revision:1,email_payload:savedPayload}],error:null};},from(table){const filters=[];let update;const q={select:()=>q,eq:(...args)=>{filters.push(args);return q;},update:value=>{update=value;return q;},single:async()=>({data:table==='invoices'?invoice:table==='company_settings'?{portal_invoices_enabled:true,from_email:'billing@dealer.com',company_name:'Dealer',portal_url:'https://dealer.myjobview.com'}:{subdomain:'dealer'},error:null}),then:resolve=>{updates.push({table,update,filters});return Promise.resolve({error:null}).then(resolve);}};return q;}};
 const exports={};vm.runInNewContext(source,{exports,Request,Response,URL,Date,console,Deno:{serve:fn=>handler=fn},require(name){if(name.includes('qbo-client'))return{getSupabaseAdmin:()=>db};if(name.includes('qbo-invoice-push'))return{pushInvoice:()=>{throw Error('Must not push a payment-ready invoice');}};if(name.includes('system-email'))return{sendSystemEmail:async init=>{messages.push(init);return new Response('{}',{status:sendOK?200:503});}};throw Error(name);}});
 const response=await handler(new Request('https://worker',{method:'POST',headers:{Authorization:'Bearer dedicated-worker-secret'}}));return{response,updates,messages,calls};
}
let result=await run({authorized:false});assert.equal(result.response.status,401);assert.deepEqual(result.calls,['security_billing_worker_authorized']);assert.equal(result.messages.length,0);
for(const options of [{invoiceStatus:'draft'},{invoiceStatus:'void'},{portal:false}]){result=await run(options);assert.equal(result.messages.length,0);assert.ok(result.updates.some(u=>u.update?.status==='skipped'));}
result=await run({email:null});assert.ok(result.updates.some(u=>u.update?.status==='failed'&&u.update.error==='Customer email is missing'));assert.equal(result.messages.length,0);
result=await run();assert.equal(result.messages.length,1);const payload=JSON.parse(result.messages[0].body);assert.ok(payload.html.includes('Customer &lt;unsafe&gt;'));assert.ok(payload.html.includes('dealer.myjobview.com'));assert.equal(result.messages[0].headers['Idempotency-Key'],'invoice-portal-invoice-v1');assert.ok(result.updates.some(u=>u.update?.status==='sent'));
const snapshot=JSON.parse(JSON.stringify(result.updates.find(u=>u.update?.email_payload).update.email_payload));
result=await run({sendOK:false,savedPayload:snapshot});assert.deepEqual(JSON.parse(result.messages[0].body),snapshot);assert.ok(result.updates.some(u=>u.update?.status==='failed'&&u.update.available_at));assert.ok(!result.updates.some(u=>u.update?.status==='sent'));
console.log('Worker authentication, private/draft suppression, missing-email failure, scoped delivery and idempotent retries passed.');
