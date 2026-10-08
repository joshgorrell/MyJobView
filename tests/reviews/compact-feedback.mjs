import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');
const run = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
for (const [file, name] of [['send-satisfaction-email','buildSatisfactionEmail'],['send-review-followup-job','buildFollowUpSatisfactionEmail']]) {
  const source = (await read(`supabase/functions/${file}/index.ts`)).replace(/^import[^;]+;\n/gm,'').split('Deno.serve')[0];
  const module = await run(source + `\nexport { ${name} };`);
  const html = module[name]({customerName:'Customer',companyName:'Electronic Life',companyEmail:'test@example.com',feedbackBaseUrl:'https://test.example',responseToken:'test-token'});
  for (const rating of ['excellent','good','okay','needs_attention']) assert.ok(html.includes(`/feedback?rating=${rating}&token=test-token`));
  if (file === 'send-satisfaction-email') {
    assert.ok(!html.includes('substantially complete') && !html.includes('Test & Tune'));
    assert.ok(html.includes('5-star Google review'));
    const projectHtml = module[name]({customerName:'Customer',companyName:'Electronic Life',companyEmail:'test@example.com',feedbackBaseUrl:'https://test.example',responseToken:'test-token',surveyType:'job_completion'});
    assert.ok(projectHtml.includes('substantially complete'));
  }
  assert.ok(html.includes('Needs<br>Attention'));
  assert.ok(html.includes('Room to improve') && html.includes('Please contact me'));
  assert.ok(!html.includes('height:130px') && !html.includes('overflow:hidden'));
}
let subdomain = 'elife', valid = true;
const scopes = [];
const db = {from(table) { const q = {select:()=>q,eq:(key,value)=>{scopes.push([table,key,value]);return q;},update:()=>q,maybeSingle:async()=>({data:table==='customer_satisfaction'?(valid?{id:'rating',organization_id:'org'}:null):table==='organizations'?{subdomain}:{company_name:'Electronic Life'}}),then:resolve=>Promise.resolve({error:null}).then(resolve)};return q;}};
globalThis.__feedbackDb=db;
const source=(await read('supabase/functions/submit-customer-feedback/index.ts')).replace(/^import[^;]+;\n/gm,'');
await run(`const createClient=()=>globalThis.__feedbackDb;const Deno={env:{get:()=>''},serve:fn=>globalThis.__feedbackHandler=fn};\n${source}`);
async function submit() {const response=await globalThis.__feedbackHandler(new Request('https://test.example',{method:'POST',body:JSON.stringify({token:'test-token',rating:'good'})}));return {status:response.status,data:await response.json()};}
assert.equal((await submit()).data.company.reviewUrl,'https://g.page/r/CZzvVUth7kuyEBM/review');
assert.ok(scopes.some(([table,key,value])=>table==='company_settings'&&key==='organization_id'&&value==='org'));
subdomain='other';assert.equal((await submit()).data.company.reviewUrl,null);
valid=false;assert.equal((await submit()).status,404);
console.log('Rating email links, unclipped layout, and tenant-scoped Google handoff passed.');
