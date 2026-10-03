import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const moduleFrom=source=>import('data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64'));
const {maskedPayment,paymentsOrigin}=await moduleFrom(await readFile(new URL('../../supabase/functions/_shared/security-payment-vault.ts',import.meta.url),'utf8'));
let staffAllowed=false,allowed=true,enabled=true,mail=false,linked=true,adminReads=0,providerReads=0,stored;
const contract={contact_id:'customer-1',organization_id:'org-1'};
const chain=table=>{
 const filters={};let write;
 const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q;},upsert:data=>{write=data;return q;},
  single:async()=>result(),maybeSingle:async()=>result()};
 function result(){
  adminReads++;
  if(table==='security_contracts')return {data:{...contract,security_billing_mode:mail?'mail':'autopay'}};
  if(table==='organizations')return {data:{payment_processor:'quickbooks'}};
  if(table==='contacts')return {data:{qbo_customer_id:linked?'qb-customer-1':null}};
  if(table==='security_payment_methods') {
   if(write){stored=write;return {data:{id:'method-1',payment_type:write.payment_type,display_last4:write.display_last4}};}
   return {data:filters.id==='method-1'?{qbo_customer_id:'qb-customer-1',qbo_method_id:'qb-bank-1',payment_type:'ach'}:null};
  }
  throw new Error('Unexpected table '+table);
 }
 return q;
};
globalThis.__securityEdgeDeps={
 createClient:()=>({rpc:async(name)=> (name==='staff_security_onboarding' ? staffAllowed : allowed)?{data:{status:'pending_customer',customer_completed_at:null}}:{error:{message:'Denied'}}}),
 corsHeaders:{},getSupabaseAdmin:()=>({from:chain}),getConnection:async()=>({environment:'sandbox',payments_enabled:enabled}),
 getValidAccessToken:async()=>'server-only-access-token',getQboIdByLocalId:async()=>null,maskedPayment,paymentsOrigin,
 vaultRequest:async(origin,access,customer,type,token,id)=>{
  providerReads++;assert.equal(customer,'qb-customer-1');assert.equal(access,'server-only-access-token');
  const method={id:'qb-bank-1',accountNumber:'xxxxxxxx6789',bankName:'Bank',routingNumber:'000000000'};
  return token || id ? method : type==='ach'?[method]:[];
 },
};
const source=(await readFile(new URL('../../supabase/functions/security-payment-methods/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
await moduleFrom(`const {createClient,corsHeaders,getSupabaseAdmin,getConnection,getValidAccessToken,getQboIdByLocalId,maskedPayment,paymentsOrigin,vaultRequest}=globalThis.__securityEdgeDeps;
const Deno={env:{get:()=>''},serve:handler=>{globalThis.__securityPaymentHandler=handler;}};
${source}`);
const call=async(body)=>{
 const response=await globalThis.__securityPaymentHandler(new Request('https://test.example',{method:'POST',body:JSON.stringify({contractId:'contract-1',token:'invitation',...body})}));
 return {status:response.status,body:await response.json()};
};
allowed=false;assert.equal((await call({action:'list'})).status,403);assert.equal(adminReads,0,'Denied invitations do not reach service-role reads');
staffAllowed=true;assert.equal((await call({action:'list',token:''})).status,200,'Authorized staff use the same enrollment gateway');
staffAllowed=false;assert.equal((await call({action:'list',token:''})).status,403,'Staff access is enforced before provider reads');adminReads=0;providerReads=0;
allowed=true;assert.equal((await call({action:'add',cardNumber:'4111111111111111'})).status,400,'Raw payment data is rejected');
enabled=false;assert.equal((await call({action:'list'})).status,409);assert.equal(providerReads,0,'Accounting-only credentials cannot enroll methods');
enabled=true;mail=true;assert.equal((await call({action:'list'})).status,400);mail=false;
linked=false;assert.equal((await call({action:'list'})).status,409);linked=true;
assert.equal((await call({action:'verify',methodId:'another-customer-method'})).status,400);
let result=await call({action:'list'});assert.equal(result.status,200);assert.equal(result.body.methods[0].display_last4,'6789');
assert.ok(!JSON.stringify(result.body).includes('server-only-access-token'));assert.equal(stored.accountNumber,undefined);assert.equal(stored.routingNumber,undefined);
result=await call({action:'add',paymentType:'ach',tokenValue:'real-short-lived-token'});assert.equal(result.status,200);
assert.equal((await call({action:'verify',methodId:'method-1'})).status,200);
delete globalThis.__securityEdgeDeps;delete globalThis.__securityPaymentHandler;
console.log('Payment edge tests passed: access denial, token-only input, Payments capability, customer mapping, method ownership, masked responses.');
