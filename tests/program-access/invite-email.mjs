import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
let handler;
const sent=[];
const client={from(table){const q={select:()=>q,eq:()=>q,is:()=>q,update:()=>q,insert:()=>q,maybeSingle:async()=>({data:{id:'contact',portal_user_id:'portal-user'}}),then:resolve=>Promise.resolve({error:null}).then(resolve)};return q;}};
const settings={company_name:'Electronic Life',company_email:'office@example.com',company_logo_url:'',portal_url:'https://dealer.example/portal',offices:[],from_address:'office@example.com'};
const source=fs.readFileSync('supabase/functions/send-punchlist-invite/index.ts','utf8').replace(/^import .*;\n/gm,'');
const context={Request,Response,crypto:webcrypto,console:{log(){},warn(){},error(){}},Uint8Array,
 createClient:()=>client,getCompanySettings:async()=>settings,getEmailTemplate:async()=>null,
 wrapInEmailLayout:html=>html,replacePlaceholders:()=>{throw Error('Unexpected template');},convertTextToHtml:html=>html,
 sendSystemEmail:async params=>{sent.push(JSON.parse(params.body));return new Response('{}');},
 Deno:{env:{get:()=> 'configured'},serve:fn=>{handler=fn;}}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
const call=body=>handler(new Request('https://edge.example',{method:'POST',headers:{Authorization:'Bearer staff'},body:JSON.stringify({contact_name:'Josh',contact_email:'customer@example.com',...body})}));
assert.equal((await (await call({access_type:'vip_signup',plan_id:'gold'})).json()).success,true);
assert.match(sent.at(-1).html,/\/portal\/signup\?plan=gold&amp;|\/portal\/signup\?plan=gold&/);
assert.equal((await (await call({access_type:'vip_comped',expiration_date:'2027-10-05',plan_id:'gold'})).json()).success,true);
assert.match(sent.at(-1).subject,/Complimentary VIP Membership/);
assert.match(sent.at(-1).html,/no charge/);
assert.match(sent.at(-1).html,/will not automatically bill or renew/);
assert.ok(!sent.at(-1).html.includes('/signup?'));
const result=await (await call({access_type:'test_and_tune',project_name:'Home Theater',expiration_date:'2026-11-05',preview:true})).json();
assert.match(result.subject,/Test & Tune/);
assert.match(result.html,/Home Theater/);
console.log('Selected-plan paid link, comped VIP welcome, and Test & Tune email checks passed.');
