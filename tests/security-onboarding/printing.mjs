import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
let authorized = true;
const calls = [];
const document = {term_months:24,renewal_term_months:1,cancellation_notice_days:30,monthly_price:35,
  template:{name:'Monitoring <template>',contract_terms:'Initial [term]\nFINAL CLAUSE INCLUDED'},
  services:[{name:'Monitoring'}],dealer:{annual_billing_enabled:true,annual_discount_type:'percentage',annual_discount_percentage:10},
  autopay_authorization:'Recurring mandate <text>'};
globalThis.__print = {createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'staff'}}})},
  rpc:async(name,args)=>{calls.push({name,...args});return authorized ? {data:args.p_action==='get'?{document}:document} : {error:{message:'Denied'}};},
  from:()=>{throw new Error('Printing must not perform table writes or unrestricted reads');}})};
const source=(await readFile(new URL('../../supabase/functions/generate-blank-contract-form/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const compiled=ts.transpileModule(`const {createClient}=globalThis.__print; const Deno={env:{get:()=>''},serve:h=>globalThis.__printHandler=h};\n${source}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const call=(id='',auth=true)=>globalThis.__printHandler(new Request(`https://test.example${id?'?contractId='+id:''}`,{method:id?'GET':'POST',headers:auth?{Authorization:'Bearer synthetic','Content-Type':'application/json'}:{},...(!id?{body:JSON.stringify({template_id:'template',service_ids:['service'],term_months:24})}:{})}));
assert.equal((await call('',false)).status,401);assert.equal(calls.length,0);
authorized=false;assert.equal((await call()).status,403);
authorized=true;const result=await call();assert.equal(result.status,200);const html=await result.text();
assert.equal(calls.at(-1).p_action,'print_form');assert.equal(calls.at(-1).p_id,null);
for(const text of ['Initial 24 months','FINAL CLAUSE INCLUDED','Billing Frequency','Annual','Recurring Payment Authorization','Service Account Numbers','Installation Date','Customer Signature','Assigned when entered online','Printing this form does not create']) assert.ok(html.includes(text),text);
assert.ok(html.includes('Monitoring &lt;template&gt;'));assert.ok(html.includes('Recurring mandate &lt;text&gt;'));
await writeFile('/tmp/mjv-security-blank-form.html',html);
assert.equal((await call('existing')).status,200);assert.equal(calls.at(-1).p_action,'get');
delete globalThis.__print;delete globalThis.__printHandler;
console.log('Print tests passed: authenticated read-only blank/existing forms, no creation, web fields, billing choice, mandate, selected term and escaped content.');
