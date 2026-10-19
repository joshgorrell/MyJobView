import {build} from 'esbuild';
import assert from 'node:assert/strict';
const compiled=await build({entryPoints:['supabase/functions/_shared/vip-checkout.ts'],bundle:true,format:'esm',write:false});
const {openVipCheckout,reconcileVipCheckout}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const base={id:'checkout',organization_id:'org',contact_id:'customer',status:'pending',qbo_invoice_id:'900',qbo_customer_id:'100',qbo_realm_id:'realm',qbo_environment:'sandbox',total:27,subtotal:25,tax_amount:2,created_at:'2026-10-19',plan_name:'VIP',billing_frequency:'monthly'};
const connection={organization_id:'org',realm_id:'realm',environment:'sandbox',payments_enabled:true,vip_membership_item_id:'10'};
let checkout,invoice,confirmations,creates,paths,failConfirm=false;
const admin={from(table){assert.equal(table,'vip_membership_checkouts');const filters=[];let update;const q={select(){return q;},eq(key,value){filters.push([key,value]);return q;},update(values){update=values;return q;},maybeSingle(){return Promise.resolve(q.result());},result(){if(!filters.every(([key,value])=>checkout?.[key]===value))return{data:null,error:null};if(update)Object.assign(checkout,update);return{data:{...checkout},error:null};},then(resolve){return Promise.resolve(q.result()).then(resolve);}};return q;},async rpc(name,args){assert.equal(name,'confirm_vip_checkout_payment');assert.equal(args.p_checkout_id,checkout.id);confirmations++;if(failConfirm)return{error:{message:'Activation error'}};checkout.status='paid';return{data:true,error:null};}};
async function request(db,conn,method,path,payload){assert.equal(db,admin);assert.equal(conn,connection);paths.push(path);if(path.startsWith('item/'))return{ok:true,data:{Item:{Type:'Service',Active:true,IncomeAccountRef:{value:'50'}}}};if(method==='POST'){creates++;assert.equal(path,'invoice?requestid=vip-checkout');assert.equal(payload.CustomerRef.value,'100');assert.equal(payload.Line[0].Amount,25);assert.equal(payload.TxnTaxDetail.TotalTax,2);assert.equal(payload.AllowOnlineACHPayment,true);return{ok:true,data:{Invoice:{...invoice}}};}return{ok:true,data:{Invoice:{...invoice}}};}
function reset(){checkout={...base};invoice={Id:'900',CustomerRef:{value:'100'},TotalAmt:27,Balance:27,InvoiceLink:'https://connect.intuit.com/pay/900'};confirmations=0;creates=0;paths=[];failConfirm=false;}
reset();assert.equal(await reconcileVipCheckout(admin,connection,'900',request),'pending');assert.equal(confirmations,0,'Unpaid checkout stays locked');
invoice.Balance=1;assert.equal(await reconcileVipCheckout(admin,connection,'900',request),'pending');assert.equal(confirmations,0,'Partial payment stays locked');
invoice.Balance=0;assert.equal(await reconcileVipCheckout(admin,connection,'900',request),'paid');assert.equal(confirmations,1);assert.equal(await reconcileVipCheckout(admin,connection,'900',request),'paid');assert.equal(confirmations,1,'Duplicate webhook does not activate twice');
for(const patch of [{CustomerRef:{value:'wrong'}},{TotalAmt:26},{Balance:null},{Balance:-1},{Balance:'NaN'},{Id:'wrong'},{TotalAmt:0}]){reset();Object.assign(invoice,{Balance:0},patch);await assert.rejects(reconcileVipCheckout(admin,connection,'900',request),/provider review/);assert.equal(confirmations,0);}
reset();checkout.qbo_realm_id='other';assert.equal(await reconcileVipCheckout(admin,connection,'900',request),null);assert.equal(confirmations,0);
reset();checkout.qbo_environment='production';assert.equal(await reconcileVipCheckout(admin,connection,'900',request),null);
reset();checkout.status='cancelled';invoice.Balance=0;assert.equal(await reconcileVipCheckout(admin,connection,'900',request),'cancelled');assert.equal(confirmations,0);
reset();invoice.Balance=0;failConfirm=true;await assert.rejects(reconcileVipCheckout(admin,connection,'900',request),/activation needs/);
reset();checkout.qbo_invoice_id=null;checkout.qbo_customer_id=null;
let opened=await openVipCheckout(admin,connection,checkout,request,async()=> '100');assert.equal(opened.status,'pending');assert.equal(opened.total,27);assert.equal(opened.payment_url,invoice.InvoiceLink);assert.equal(creates,1);
opened=await openVipCheckout(admin,connection,checkout,request,async()=>assert.fail('Already linked'));assert.equal(creates,1,'Resume reuses invoice');assert.equal(confirmations,0,'Opening payment link does not grant access');
invoice.Balance=0;assert.equal((await openVipCheckout(admin,connection,checkout,request,async()=>assert.fail())).status,'paid');
reset();invoice.InvoiceLink='http://unsafe.test';await assert.rejects(openVipCheckout(admin,connection,checkout,request,async()=>assert.fail()),/link is invalid/);
reset();invoice.InvoiceLink=null;await assert.rejects(openVipCheckout(admin,connection,checkout,request,async()=>assert.fail()),/not made online payment available/);
reset();await assert.rejects(openVipCheckout(admin,{...connection,vip_membership_item_id:null},checkout,request,async()=>assert.fail()),/not ready/);
console.log('PASS: server-priced hosted checkout, stable invoice/retry, unpaid/partial/paid/cancelled, wrong customer/company/amount, duplicate events, and safe failure.');
// Exercise the actual HTTP boundary: authentication and ownership precede admin access.
const ts=await import('typescript');const vm=await import('node:vm');const fs=await import('node:fs/promises');
let handler,authUser={id:'user'},prepareError=null,adminReads=0,openedCalls=0,preparedArgs;
const caller={auth:{getUser:async()=>({data:{user:authUser},error:null})},rpc:async(name,args)=>{assert.equal(name,'prepare_vip_checkout');preparedArgs=args;return{data:prepareError?null:{id:'checkout'},error:prepareError};}};
const edgeAdmin={from(table){assert.equal(table,'vip_membership_checkouts');const q={select:()=>q,eq:()=>q,maybeSingle:async()=>{adminReads++;return{data:{...base},error:null};}};return q;}};
const source=await fs.readFile('supabase/functions/vip-membership-checkout/index.ts','utf8');const module={exports:{}};
vm.runInNewContext(ts.default.transpileModule(source,{compilerOptions:{module:ts.default.ModuleKind.CommonJS}}).outputText,{
 module,exports:module.exports,Request,Response,URL,console,Deno:{env:{get:()=> 'test'},serve(fn){handler=fn;}},require(name){
  if(name.startsWith('npm:'))return{createClient:()=>caller};
  if(name.endsWith('qbo-client.ts'))return{corsHeaders:{},getSupabaseAdmin:()=>edgeAdmin,getConnection:async()=>connection,qboRequest:request};
  if(name.endsWith('security-qbo-customer.ts'))return{ensureSecurityQboCustomer:()=>{}};
  if(name.endsWith('vip-checkout.ts'))return{openVipCheckout:async()=>{openedCalls++;return{status:'pending',payment_url:'https://connect.intuit.com/pay/900',total:27};}};
  throw new Error(name);
 }});
const http=body=>handler(new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)}));
authUser=null;assert.equal((await http({contact_id:'customer',plan_id:'plan'})).status,401);assert.equal(adminReads,0);
authUser={id:'user'};assert.equal((await http({contact_id:'customer',plan_id:'plan',amount:1})).status,400);assert.equal(adminReads,0);
prepareError={message:'Not authorized'};assert.equal((await http({contact_id:'other',plan_id:'plan'})).status,403);assert.equal(adminReads,0);
prepareError=null;let response=await http({contact_id:'customer',plan_id:'plan'});assert.equal(response.status,200);assert.equal((await response.json()).status,'pending');assert.equal(preparedArgs.p_contact_id,'customer');assert.equal(adminReads,1);assert.equal(openedCalls,1);
console.log('PASS: checkout HTTP authentication, contact ownership, no client pricing, and trusted admin access only after authorization.');
