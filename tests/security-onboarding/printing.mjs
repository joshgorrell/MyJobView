import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
const compileBranding=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const {securityAgreementBranding}=await import(compileBranding(await readFile(new URL('../../supabase/functions/_shared/security-agreement-branding.ts',import.meta.url),'utf8')));
globalThis.__branding=securityAgreementBranding;
let authorized = true;
const calls = [];
const document = {term_months:24,renewal_term_months:1,cancellation_notice_days:30,monthly_price:35,
  template:{name:'Monitoring <template>',contract_terms:'Initial [term]\nFINAL CLAUSE INCLUDED'},
  services:[{name:'Monitoring'}],dealer:{company_name:'Dealer <One>',company_logo_url:'https://example.com/logo.png',company_email:'support@example.com',website:'https://example.com',phone:'555-123-4567',address:'1 Dealer St',print_accent_color:'#ffcc00',annual_billing_enabled:true,annual_discount_type:'percentage',annual_discount_percentage:10},
  autopay_authorization:'Recurring mandate <text>'};
globalThis.__print = {createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'staff'}}})},
  rpc:async(name,args)=>{calls.push({name,...args});return authorized ? {data:args.p_action==='get'?{document}:document} : {error:{message:'Denied'}};},
  from:()=>{throw new Error('Printing must not perform table writes or unrestricted reads');}})};
const source=(await readFile(new URL('../../supabase/functions/generate-blank-contract-form/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const compiled=ts.transpileModule(`const {createClient}=globalThis.__print; const securityAgreementBranding=globalThis.__branding; const Deno={env:{get:()=>''},serve:h=>globalThis.__printHandler=h};\n${source}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const call=(id='',auth=true)=>globalThis.__printHandler(new Request(`https://test.example${id?'?contractId='+id:''}`,{method:id?'GET':'POST',headers:auth?{Authorization:'Bearer synthetic','Content-Type':'application/json'}:{},...(!id?{body:JSON.stringify({template_id:'template',service_ids:['service'],term_months:24})}:{})}));
assert.equal((await call('',false)).status,401);assert.equal(calls.length,0);
authorized=false;assert.equal((await call()).status,403);
authorized=true;const result=await call();assert.equal(result.status,200);const html=await result.text();
assert.equal(calls.at(-1).p_action,'print_form');assert.equal(calls.at(-1).p_id,null);
for(const text of ['Initial 24 months','FINAL CLAUSE INCLUDED','Billing Frequency','Annual','Recurring Payment Authorization','Service Account Numbers','Installation Date','Customer Signature','Assigned when entered online','Printing this form does not create']) assert.ok(html.includes(text),text);
assert.ok(!html.includes('Monitoring &lt;template&gt;'), 'Internal template title is not dealer branding');
for(const text of ['Dealer &lt;One&gt;','https://example.com/logo.png','1 Dealer St','555-123-4567','#ffcc00','color:#111111','Security Monitoring Agreement']) assert.ok(html.includes(text),text);assert.ok(html.includes('Recurring mandate &lt;text&gt;'));
await writeFile('/tmp/mjv-security-blank-form.html',html);
assert.equal((await call('existing')).status,200);assert.equal(calls.at(-1).p_action,'get');
delete globalThis.__print;delete globalThis.__printHandler;
console.log('Print tests passed: authenticated read-only blank/existing forms, no creation, web fields, billing choice, mandate, selected term and escaped content.');
// Customer-facing copies must not disclose the staff allocation, even if a staff
// caller passes the full internal lines to the renderer.
const compileCustomer=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const {customerSecurityInvoiceLines}=await import(compileCustomer(await readFile(new URL('../../supabase/functions/_shared/security-customer-invoice.ts',import.meta.url),'utf8')));
const detailed=[{description:'Internal monitoring price',quantity:1,unit_price:35,amount:35},{description:'Internal cellular price',quantity:1,unit_price:15,amount:15}];
const accountInvoice={id:'account-invoice',security_billing_cycle_id:'cycle',subtotal:50,tax:0,total:50,amount_due:50,amount_paid:0,status:'submitted',invoice_number:'SEC-1',invoice_date:'2026-11-10',contacts:{contact_name:'Customer'},payments:[],invoice_line_items:detailed};
assert.equal(customerSecurityInvoiceLines(accountInvoice,detailed).length,1);
assert.equal(customerSecurityInvoiceLines({...accountInvoice,security_billing_cycle_id:null},detailed),detailed,'Other invoice itemization remains unchanged');
globalThis.__customerLines=customerSecurityInvoiceLines;
const portalSource=(await readFile(new URL('../../src/lib/portalInvoicePrint.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const {buildPortalInvoicePrintHTML}=await import(compileCustomer('const customerSecurityInvoiceLines=globalThis.__customerLines;\n'+portalSource));
const customerHtml=buildPortalInvoicePrintHTML(accountInvoice,detailed,[],{});
assert.ok(customerHtml.includes('Security monitoring and related services'));assert.ok(customerHtml.includes('50.00'));
assert.ok(!customerHtml.includes('35.00')&&!customerHtml.includes('15.00')&&!customerHtml.includes('Internal cellular'));
const {securityAgreementHtml}=await import(compileCustomer('const securityAgreementBranding=globalThis.__branding;\n'+(await readFile(new URL('../../src/lib/securityAgreementDocument.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'')));
const contractHtml=securityAgreementHtml({...document,monthly_price:50,services:[{name:'Monitoring',monthly_price:35},{name:'Cellular',monthly_price:15}]},'Accepted terms',{},null,null);
for(const text of ['Dealer &lt;One&gt;','https://example.com/logo.png','1 Dealer St','555-123-4567','#ffcc00']) assert.ok(contractHtml.includes(text),text);
assert.ok(contractHtml.includes('50.00'));assert.ok(contractHtml.includes('Monitoring'));assert.ok(!contractHtml.includes('35.00')&&!contractHtml.includes('15.00'));
const pdfSource=(await readFile(new URL('../../supabase/functions/generate-invoice-pdf/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const pdfModule=await import(compileCustomer('const customerSecurityInvoiceLines=globalThis.__customerLines;const Deno={serve:()=>{}};\n'+pdfSource+'\nexport {generateInvoiceHTML};'));
const pdfHtml=pdfModule.generateInvoiceHTML(accountInvoice,{});
assert.ok(pdfHtml.includes('Security monitoring and related services'));assert.ok(!pdfHtml.includes('35.00')&&!pdfHtml.includes('15.00')&&!pdfHtml.includes('Internal cellular'));
const detailSource=await readFile(new URL('../../src/components/Invoices/InvoiceDetailModal.tsx',import.meta.url),'utf8');
const staffPrint=await import(compileCustomer('const customerSecurityInvoiceLines=globalThis.__customerLines;const formatPaymentTerms=()=>"";\n'+detailSource.slice(detailSource.indexOf('function buildPrintHTML('))+'\nexport {buildPrintHTML};'));
const staffPrintHtml=staffPrint.buildPrintHTML(accountInvoice,null);
assert.ok(staffPrintHtml.includes('Security monitoring and related services'));assert.ok(!staffPrintHtml.includes('35.00')&&!staffPrintHtml.includes('15.00')&&!staffPrintHtml.includes('Internal cellular'));
delete globalThis.__customerLines;
console.log('Customer pricing tests passed: account total only in portal print, contract copy and generated invoice PDF; other invoices and internal detailed lines remain intact.');

const malicious=securityAgreementBranding({company_name:'<script>alert(1)</script>',company_logo_url:'javascript:alert(1)',print_accent_color:'red;}</style><script>alert(1)</script>'});
assert.ok(!malicious.header.includes('<script>'));assert.ok(!malicious.header.includes('<img'));assert.ok(malicious.css.includes('#334155'));
const other=securityAgreementHtml({...document,dealer:{company_name:'Dealer Two'}},'Accepted terms');
assert.ok(other.includes('Dealer Two'));assert.ok(!other.includes('Dealer &lt;One&gt;'));assert.ok(!other.includes('example.com'));assert.ok(!other.includes('MyJobView'));assert.ok(!other.includes('Electronic Life'));
delete globalThis.__branding;
console.log('Dealer branding tests passed: shared header, tenant identity, escaped content, safe logo/color and neutral fallback.');
