import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const load=s=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const {authorizeSecurityWorker}=await load(await readFile(new URL('../../supabase/functions/_shared/security-worker-auth.ts',import.meta.url),'utf8'));
let queue=[],calls=[],reads=[],configured=true,outcome='declined';
const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='security_billing_worker_authorized')return {data:args.p_secret==='x'.repeat(40)};if(args.p_action==='settlement_lease')return {data:queue.shift()||null};return {data:{success:true}};}};
globalThis.__watch={getSupabaseAdmin:()=>admin,getConnection:async()=>configured?{environment:'sandbox'}:null,getValidAccessToken:async()=>'token',authorizeSecurityWorker,securityCharge:async(...args)=>{reads.push(args);assert.equal(args[2],'ach');assert.equal(args[8],'settled-ach','Must supply existing transaction ID so the shared helper issues GET, never POST');return {state:outcome};}};
const source=(await readFile(new URL('../../supabase/functions/security-payment-settlement-watch/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
await load(`const {getSupabaseAdmin,getConnection,getValidAccessToken,authorizeSecurityWorker,securityCharge}=globalThis.__watch;const Deno={env:{get:key=>key==='SECURITY_ACH_SETTLED_STATUS'?'SETTLED':undefined},serve:h=>{globalThis.__watchHandler=h;}};\n`+source);
const req=token=>new Request('https://test/watch',{method:'POST',headers:{Authorization:'Bearer '+token}});
const observation={id:'cycle',organization_id:'org',processor_id:'settled-ach',amount:35,lease_token:'lease'};
try {
 assert.equal((await globalThis.__watchHandler(req('bad'))).status,401);assert.ok(!calls.some(c=>c.args.p_action==='settlement_lease'));
 queue=[observation];calls=[];assert.equal((await globalThis.__watchHandler(req('x'.repeat(40)))).status,200);assert.equal(reads.length,1);assert.equal(calls.find(c=>c.args.p_action==='settlement_result').args.p_payload.state,'declined');
 queue=[observation];calls=[];reads=[];configured=false;await globalThis.__watchHandler(req('x'.repeat(40)));assert.equal(reads.length,0);assert.equal(calls.find(c=>c.args.p_action==='settlement_result').args.p_payload.state,'unknown');
 queue=[observation];calls=[];configured=true;outcome='paid';await globalThis.__watchHandler(req('x'.repeat(40)));assert.equal(calls.find(c=>c.args.p_action==='settlement_result').args.p_payload.state,'paid');
 assert.ok(calls.some(c=>c.args.p_action==='scan'),'Observations enter the same durable alert workflow');
}finally{delete globalThis.__watch;delete globalThis.__watchHandler;}
console.log('Settlement watch passed: dedicated auth, existing-transaction GETs, late return observations, uncertain provider configuration, successful checks and no repeat charge.');
