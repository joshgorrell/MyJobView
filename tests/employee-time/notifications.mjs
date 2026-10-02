import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let transportStatus=200;let handler,user={id:'tech'},caller={id:'tech',organization_id:'org',role:'tech',is_active:true},emails=[],queries=[];
let session={id:'session',organization_id:'org',assigned_to:'tech',status:'pending_approval',session_type:'training',predetermined_hours:2,session_date:'2026-09-07',tech:{full_name:'Technician',email:'tech@example.test'}};
const query=(table,privileged)=>{const filters=[];const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>{queries.push({table,privileged,filters});resolve({error:null,data:table==='internal_time_sessions'?session:table==='company_settings'?{time_request_approver_ids:['manager'],from_email:'sender@example.test',app_url:'https://example.test'}:privileged?[{id:'manager',email:'manager@example.test'}]:caller});};return(...args)=>{if(['eq','in','or'].includes(key))filters.push([key,...args]);return q;};}});return q;};
let clientCount=0;const createClient=()=>{const privileged=clientCount++%2===1;return {auth:{getUser:async()=>({data:{user},error:null})},from:table=>query(table,privileged)};};
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('supabase/functions/send-time-request-notification/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,Request,Response,console:{error(){}},Deno:{env:{get:()=>''},serve:fn=>{handler=fn;}},require:()=>({createClient}),fetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');emails.push(JSON.parse(options.body));return new Response('{}',{status:transportStatus});}});
async function request(direction){clientCount=0;queries=[];return handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({sessionId:'session',direction})}));}
user=null;assert.equal((await request('to_approvers')).status,401);user={id:'tech'};
caller.is_active=false;assert.equal((await request('to_approvers')).status,403);caller.is_active=true;
session.organization_id='other';assert.equal((await request('to_approvers')).status,403);session.organization_id='org';
assert.equal((await request('to_tech')).status,403);assert.equal((await request('anything')).status,403);assert.equal(emails.length,0,'Unauthorized requests never reach the email transport');
assert.equal((await request('to_approvers')).status,200);assert.equal(emails.length,1);
assert.ok(queries.find(q=>q.table==='company_settings').filters.some(f=>f[0]==='eq'&&f[1]==='organization_id'&&f[2]==='org'));
const recipients=queries.find(q=>q.table==='profiles'&&q.privileged);assert.ok(recipients.filters.some(f=>f[1]==='organization_id'&&f[2]==='org'));assert.ok(recipients.filters.some(f=>f[1]==='role'));assert.ok(recipients.filters.some(f=>f[0]==='or'&&f[1].includes('is_active')));
caller={id:'manager',organization_id:'org',role:'manager',is_active:true};user={id:'manager'};session.status='pending_approval';assert.equal((await request('to_tech')).status,403);session.status='scheduled';assert.equal((await request('to_tech')).status,200);assert.match(emails.at(-1).html,/scheduled/);assert.equal(emails.at(-1).html.includes('added to your payroll'),false);
console.log('Notification email auth, active actor, tenant, recipient filtering and scheduled-work wording pass with a mocked transport; no emails were sent.');

session.denial_reason='<img src=x onerror=alert(1)>';session.status='denied';assert.equal((await request('to_tech')).status,200);assert.ok(emails.at(-1).html.includes('&lt;img'));assert.equal(emails.at(-1).html.includes('<img'),false);
transportStatus=502;assert.equal((await request('to_tech')).status,500,'Failed email delivery cannot report success');
