import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const load=s=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const helpers=await load(await readFile(new URL('../../supabase/functions/_shared/security-payment-alert-email.ts',import.meta.url),'utf8'));
const alert={id:'delivery-id',lease_token:'lease',audience:'customer',reminder:0,kind:'payment_failed',title:'Automatic payment was not completed',detail:'Contact your provider. Do not email card or bank details.',contract_id:'contract-id',contract_number:'SC-1',to:'customer@example.com',from_email:'billing@example.com',from_name:'Electronic Life',company_name:'Electronic Life',support_email:'support@example.com',subdomain:'electroniclife'};
const message=helpers.paymentAlertMessage(alert);assert.ok(message.text.includes('https://electroniclife.myjobview.com/portal/security?contract=contract-id'));
assert.ok(!helpers.paymentAlertMessage({...alert,audience:'staff'}).text.includes('/portal/security'));assert.ok(!helpers.paymentAlertMessage({...alert,subdomain:'bad.example/evil'}).text.includes('bad.example'));
let posted;const fetcher=async(_url,args)=>{posted=args;return new Response(JSON.stringify({id:'provider-id'}),{status:200});};
assert.equal(await helpers.sendPaymentAlert(alert,'key',fetcher),'provider-id');assert.equal(posted.headers['Idempotency-Key'],'security-payment-alert-delivery-id');
await assert.rejects(helpers.sendPaymentAlert({...alert,to:null},'key',fetcher),/recipient/);await assert.rejects(helpers.sendPaymentAlert(alert,undefined,fetcher),/email service/);
await assert.rejects(helpers.sendPaymentAlert(alert,'key',async()=>new Response('{}',{status:503})),/HTTP 503/);await assert.rejects(helpers.sendPaymentAlert(alert,'key',async()=>new Response('{}',{status:200})),/confirmed/);
await helpers.sendPaymentAlert({...alert,title:'Changed'},'key',fetcher,message);assert.deepEqual(JSON.parse(posted.body),message);
const auth=await load(await readFile(new URL('../../supabase/functions/_shared/security-worker-auth.ts',import.meta.url),'utf8'));
let queue=[],calls=[],sendFails=false,recordFails=false;
const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='security_billing_worker_authorized')return {data:args.p_secret==='x'.repeat(40)};if(args.p_action==='lease')return {data:queue.shift()||null};if(args.p_action==='message')return {data:args.p_payload};if(args.p_action==='sent'&&recordFails)return {error:{message:'Recording failed'}};return {data:{success:true}};}};
globalThis.__alerts={getSupabaseAdmin:()=>admin,authorizeSecurityWorker:auth.authorizeSecurityWorker,paymentAlertMessage:helpers.paymentAlertMessage,validatePaymentAlertMessage:helpers.validatePaymentAlertMessage,sendPaymentAlert:async()=>{if(sendFails)throw new Error('Email provider unavailable');return 'provider-id';}};
const source=(await readFile(new URL('../../supabase/functions/security-payment-alerts/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
await load(`const {getSupabaseAdmin,authorizeSecurityWorker,sendPaymentAlert,paymentAlertMessage,validatePaymentAlertMessage}=globalThis.__alerts;const Deno={env:{get:()=>undefined},serve:h=>{globalThis.__alertHandler=h;}};\n`+source);
const request=secret=>new Request('https://test/worker',{method:'POST',headers:{Authorization:`Bearer ${secret}`}});
try {
 assert.equal((await globalThis.__alertHandler(request('invalid'))).status,401);assert.ok(!calls.some(c=>c.args.p_action==='scan'));
 queue=[alert];calls=[];assert.equal((await globalThis.__alertHandler(request('x'.repeat(40)))).status,200);assert.ok(calls.some(c=>c.args.p_action==='sent'));
 queue=[alert];calls=[];sendFails=true;await globalThis.__alertHandler(request('x'.repeat(40)));assert.ok(calls.some(c=>c.args.p_action==='failed'));assert.ok(!calls.some(c=>c.args.p_action==='sent'));
 queue=[alert];calls=[];sendFails=false;recordFails=true;await globalThis.__alertHandler(request('x'.repeat(40)));assert.ok(calls.some(c=>c.args.p_action==='failed'));
 assert.ok(calls.every(c=>['security_billing_worker_authorized','security_payment_alert_worker'].includes(c.name)));
 queue=[{...alert,to:null,frozen_message:message}];calls=[];recordFails=false;await globalThis.__alertHandler(request('x'.repeat(40)));assert.ok(calls.some(c=>c.args.p_action==='sent'),'Already-frozen valid recipient survives later settings changes');
}finally{delete globalThis.__alerts;delete globalThis.__alertHandler;}
console.log('Payment alert emails/worker passed: safe customer/staff links, server authorization, provider rejection, accepted IDs, frozen/idempotent retry payloads, recording failures and no charge calls.');
