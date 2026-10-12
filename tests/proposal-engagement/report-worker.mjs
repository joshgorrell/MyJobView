import { build } from 'esbuild';
import assert from 'node:assert/strict';
const load=async(path)=>{const r=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);};
const {prepareReportEmail,activityLink}=await load('supabase/functions/proposal-activity-weekly/reportEmail.ts');
const {handleWeeklyActivity}=await load('supabase/functions/proposal-activity-weekly/worker.ts');
const report={id:'report1',organization_id:'org',recipient_user_id:'rep',recipient_email:'rep@example.com',recipient_name:'Josh',week_start:'2026-10-05',timezone:'America/Chicago',period_start:'2026-10-05T05:00:00Z',period_end:'2026-10-12T05:00:00Z',lease_token:'lease',email_payload:null,report_data:[
 {proposal_id:'00000000-0000-0000-0000-000000000040',proposal_number:'PRO-100',customer:'A & B <script>',title:'Home theater',bucket:'engaged',visits:3,active_seconds:125,last_viewed_at:'2026-10-09T15:00:00Z',sections:[{key:'room:room',label:'Home Theater',seconds:100}],clicks:{approval_clicked:1,payment_clicked:2}},
 {proposal_id:'00000000-0000-0000-0000-000000000041',proposal_number:'PRO-101',customer:'Not opened',title:'Security',bucket:'unopened',visits:0,active_seconds:0,last_viewed_at:null,sections:[],clicks:{}}
]};
const settings={from_email:'sales@example.com',company_email:'office@example.com',company_name:'Electronic Life',app_url:'https://dealer.myjobview.com'};
const payload=prepareReportEmail(report,settings,null);
assert.deepEqual(payload.to,['rep@example.com']);assert.ok(payload.html.includes('A &amp; B &lt;script&gt;'));assert.ok(!payload.html.includes('<script>'));
assert.ok(payload.html.indexOf('Engaged proposals')<payload.html.indexOf('Sent but not opened'));
assert.ok(payload.text.includes('3 visits'));assert.ok(payload.text.includes('2m 5s'));assert.ok(payload.text.includes('Home Theater'));assert.ok(payload.subject.includes('Oct 5–Oct 11'));
const links=[...payload.text.matchAll(/View Activity: (.+)/g)].map(m=>new URL(m[1]));assert.equal(links.length,2);assert.ok(links.every(url=>url.searchParams.get('proposalActivity')==='true'&&url.searchParams.get('tab')==='proposals'));
assert.throws(()=>activityLink('javascript:alert(1)','p'));assert.throws(()=>activityLink('https://user:pass@example.com','p'));assert.throws(()=>prepareReportEmail(report,{...settings,from_email:'sender@resend.dev'},null));
let allowed=true;let claimed=false;let stored=null;let failSend=false;let failAck=false;const calls=[];const sent=[];
const db={rpc:async(name,args)=>{calls.push([name,args]);if(name==='security_billing_worker_authorized')return {data:allowed,error:null};
 switch(args.p_action){case 'generate':return {data:1,error:null};case 'claim':if(claimed)return {data:null,error:null};claimed=true;return {data:{...report,email_payload:stored},error:null};case 'store_payload':stored ||= args.p_payload;return {data:stored,error:null};case 'sent':return failAck?{data:null,error:{message:'Ack unavailable'}}:{data:true,error:null};case 'failed':return {data:true,error:null};default:throw new Error('Unexpected action');}},
 from(table){const q={select:()=>q,eq:()=>q,single:async()=>({data:table==='company_settings'?settings:{subdomain:null},error:null})};return q;}};
const send=async init=>{sent.push(init);return new Response('',{status:failSend?503:200});};
const request=()=>new Request('https://worker.example',{method:'POST',headers:{Authorization:'Bearer '+'x'.repeat(40)}});
assert.equal((await handleWeeklyActivity(new Request('https://worker.example'),db,send)).status,405);
assert.equal((await handleWeeklyActivity(new Request('https://worker.example',{method:'POST'}),db,send)).status,401);
allowed=false;assert.equal((await handleWeeklyActivity(request(),db,send)).status,401);assert.equal(sent.length,0);
allowed=true;failSend=true;let response=await handleWeeklyActivity(request(),db,send);assert.equal((await response.json()).failed,1);assert.ok(calls.some(([,a])=>a.p_action==='failed'));assert.ok(!calls.some(([,a])=>a.p_action==='sent'));
const originalBody=sent[0].body;const originalKey=sent[0].headers['Idempotency-Key'];claimed=false;failSend=false;calls.length=0;
response=await handleWeeklyActivity(request(),db,send);assert.equal((await response.json()).sent,1);assert.equal(sent[1].body,originalBody);assert.equal(sent[1].headers['Idempotency-Key'],originalKey);assert.ok(!calls.some(([,a])=>a.p_action==='store_payload'),'Retry uses frozen payload');
claimed=false;failAck=true;calls.length=0;response=await handleWeeklyActivity(request(),db,send);assert.equal((await response.json()).failed,1);assert.equal(sent[2].body,originalBody);assert.ok(calls.some(([,a])=>a.p_action==='failed'));
console.log('Weekly email: owner-only recipient, grouping, dates, safe links/content, worker authentication, failures, and idempotent retries pass');
