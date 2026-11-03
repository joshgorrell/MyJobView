import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('supabase/functions/_shared/qbo-invoice-push.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function run({status='submitted',total=635,remoteTotal=635,mapping=null,missingItems=false,stale=false}={}) {
 const invoice={id:'invoice',status,total,tax_amount:10,invoice_date:'2026-10-06',due_date:'2026-10-06',contacts:{qbo_customer_id:'customer'},invoice_line_items:[{description:'Part',quantity:2,unit_price:100,amount:200,item_type:'material',is_taxable:true,sort_order:1,cost:20,notes:'INTERNAL'},{description:'Service labor',quantity:4.25,unit_price:100,amount:425,item_type:'labor',is_taxable:false,sort_order:0}]};
 const writes=[],calls=[],mappings=[];
 const db={from(table){let update;const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:invoice,error:null}),update:value=>{update=value;return q;},then:resolve=>{writes.push({table,update});return Promise.resolve({error:null}).then(resolve);}};return q;}};
 const exports={};const helpers={getSupabaseAdmin:()=>db,getEntityMapping:async()=>mapping,upsertEntityMapping:async(...args)=>mappings.push(args),logSyncOperation:async()=>{},qboRequest:async(_db,_connection,method,path,payload)=>{calls.push({method,path,payload});if(stale&&method==='POST'&&calls.filter(c=>c.method==='POST').length===1)return{ok:false,data:{Fault:{Error:[{code:'3200'}]}}};return{ok:true,data:{Invoice:path.includes('include=invoiceLink')?{InvoiceLink:'https://connect.intuit.com/pay/actual-link'}:{Id:'qbo42',SyncToken:'2',TotalAmt:remoteTotal,Balance:remoteTotal}}};}};
 vm.runInNewContext(source,{exports,console,Date,require:()=>helpers});
 const result=await exports.pushInvoice(db,{payments_enabled:true,service_labor_item_id:missingItems?null:'labor-income',service_parts_item_id:'parts-income'},'org','invoice');return{result,writes,calls,mappings};
}
for(const status of ['draft','void']){const r=await run({status});assert.equal(r.result.success,false);assert.equal(r.calls.length,0);}
let r=await run();assert.equal(r.result.success,true);const payload=r.calls[0].payload;assert.equal(r.calls[0].path,'invoice?requestid=invoice');assert.equal(payload.Line[0].SalesItemLineDetail.ItemRef.value,'labor-income');assert.equal(payload.Line[1].SalesItemLineDetail.ItemRef.value,'parts-income');assert.equal(payload.Line[1].SalesItemLineDetail.UnitPrice,100);assert.equal(payload.TxnTaxDetail.TotalTax,10);assert.equal(payload.AllowOnlineACHPayment,true);assert.equal(payload.AllowOnlineCreditCardPayment,true);assert.ok(!JSON.stringify(payload).includes('INTERNAL'));assert.ok(r.writes.some(w=>w.update.qbo_payment_url==='https://connect.intuit.com/pay/actual-link'));
r=await run({remoteTotal:625});assert.equal(r.result.success,false);assert.equal(r.writes.length,0,'A mismatched remote tax total never changes the published local invoice');assert.equal(r.mappings.length,1,'Mapping preserves the same remote invoice for correction/retry');
r=await run({missingItems:true});assert.equal(r.result.success,false);assert.equal(r.calls.length,0);
r=await run({mapping:{qbo_id:'qbo42',qbo_sync_token:'1'},stale:true});assert.equal(r.result.success,true);assert.equal(r.calls.filter(c=>c.method==='POST').length,2);assert.equal(r.calls.filter(c=>c.method==='POST')[1].payload.SyncToken,'2');assert.equal(r.calls.filter(c=>c.method==='POST')[1].payload.Id,'qbo42');
console.log('QuickBooks income mappings, selling prices, tax-total protection, issued payment link and update retry checks passed.');
