import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const moduleFrom=s=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
globalThis.__options=await moduleFrom(await readFile('supabase/functions/_shared/proposalCheckOptions.ts','utf8'));
globalThis.__messageAlerts=[];
const {handleProposalResponse}=await moduleFrom('const {isProposalChoice,proposalChoices}=globalThis.__options; const notifyProposalMessage=async(db,email,eventId)=>{globalThis.__messageAlerts.push(eventId)};\n'+(await readFile('supabase/functions/proposal-check-response/handler.ts','utf8')).replace(/^import[^;]+;\n/gm,''));
const sql=new PGlite();const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const base=await readFile('tests/reviews/proposal-check-history.mjs','utf8');const start=base.indexOf('await sql.exec(`CREATE ROLE');const end=base.indexOf('`);',start)+3;
await new Function('sql','id','return (async()=>{'+base.slice(start,end)+'})()')(sql,id);
await sql.exec('CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,type text,related_id uuid,title text,body text,created_at timestamptz DEFAULT now()); GRANT ALL ON notifications,profiles TO service_role;');
await sql.exec(await readFile('supabase/migrations/20261007214346_proposal_check_history.sql','utf8'));
await sql.exec(await readFile('supabase/migrations/20261008135304_proposal_check_responses.sql','utf8'));
const token=crypto.randomUUID()+crypto.randomUUID();
await sql.query("INSERT INTO proposal_check_emails(id,organization_id,sent_by,responsible_user_id,send_key,variant,recipient_name,recipient_email,sender_name,from_address,reply_to,subject,email_html,open_token,response_token,response_url,status) VALUES($1,$2,$3,$4,$5,'owner','Customer','customer@example.com','Josh','josh@example.com','josh@example.com','Proposal check','Snapshot','secret',$6,'https://elife.myjobview.com/proposal-check-response','sent')",[id(40),id(1),id(12),id(10),id(30),token]);
const db={from(table){const filters={};const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q},maybeSingle:async()=>{if(table==='company_settings')return{data:{company_name:'Electronic Life',company_email:'office@example.com'}};if(table==='organizations')return{data:{subdomain:'elife'}};assert.equal(table,'proposal_check_emails');return{data:(await sql.query('SELECT * FROM proposal_check_emails WHERE response_token=$1',[filters.response_token])).rows[0]||null}},single:()=>q.maybeSingle()};return q},rpc:async(_name,p)=>{try{return{data:(await sql.query('SELECT record_proposal_check_event($1,$2,$3,$4,$5,$6,$7) AS id',[p.p_email_id,p.p_event_key,p.p_kind,p.p_choice,p.p_step,p.p_message,p.p_automated])).rows[0].id}}catch(e){return{error:e}}}};
async function post(body){return handleProposalResponse(new Request('https://example.supabase.co/functions/v1/proposal-check-response',{method:'POST',body:JSON.stringify({token,...body})}),db)}
for(const [choice,value] of Object.entries(globalThis.__options.proposalChoices)){
 const r=await handleProposalResponse(new Request(`https://example.supabase.co/functions/v1/proposal-check-response?token=${token}&choice=${choice}`),db);assert.equal(r.status,303);assert.equal(new URL(r.headers.get('location')).searchParams.get('choice'),choice);
 const totals=(await sql.query('SELECT click_count,message_count FROM proposal_check_reporting')).rows[0];assert.equal(totals.message_count,0,'Abandoned clicks are retained without pretending a message arrived');
 assert.equal((await post({action:'interaction',choice,step:value.steps[0],event_key:crypto.randomUUID()})).status,200);
}
assert.equal((await post({action:'load'})).status,200);const branding=await(await post({action:'load'})).json();assert.equal(branding.owner_name,'Josh Gorrell');assert.equal(branding.owner_email,'josh@electroniclife.com');
assert.equal(globalThis.__messageAlerts.length,0,'Clicks and selections do not send email alerts');
const body={action:'message',choice:'needs_work',step:'Adjust the budget',message:'Please lower the equipment budget',event_key:crypto.randomUUID()};
assert.equal((await post(body)).status,200);assert.equal((await post(body)).status,200);
assert.equal(globalThis.__messageAlerts[0],globalThis.__messageAlerts[1],'Submission retries reuse the event identity for email deduplication');
assert.equal((await sql.query("SELECT count(*)::int AS n FROM proposal_check_events WHERE kind='message'")).rows[0].n,1,'Retry saves one message');
const notice=(await sql.query('SELECT *,created_at::text AS created_at FROM notifications')).rows;assert.equal(notice.length,1);assert.equal(notice[0].user_id,id(10),'Notify responsible salesperson');
const target=(await sql.query("SELECT id FROM proposal_check_events WHERE email_id=$1 AND kind='message' AND created_at=$2",[notice[0].related_id,notice[0].created_at])).rows;
assert.equal(target.length,1,'Existing notification email ID and transaction timestamp identify exactly the saved response');
assert.equal(target[0].id,globalThis.__messageAlerts[0]);
assert.equal((await sql.query('SELECT confirmed_choice FROM proposal_check_reporting')).rows[0].confirmed_choice,'needs_work');
assert.equal((await post({...body,event_key:crypto.randomUUID(),step:'Invalid option'})).status,400);
assert.equal((await post({...body,event_key:crypto.randomUUID(),message:'x'.repeat(5001)})).status,400);
assert.equal((await post({...body,token:'invalid'})).status,404);
assert.equal((await handleProposalResponse(new Request(`https://example.com?token=${token}&choice=declined`,{method:'HEAD'}),db)).status,405);
const scanner=await handleProposalResponse(new Request(`https://example.com?token=${token}&choice=love_it`,{headers:{'user-agent':'Security Scanner Bot'}}),db);assert.equal(scanner.status,303);assert.equal((await sql.query('SELECT suspected_automated FROM proposal_check_events ORDER BY created_at DESC LIMIT 1')).rows[0].suspected_automated,true);
for(const user of [10,12]){await sql.exec(`SELECT set_config('test.uid','${id(user)}',false);SET ROLE authenticated;`);assert.equal((await sql.query('SELECT id FROM proposal_check_reporting')).rows.length,1);assert.ok((await sql.query('SELECT id FROM proposal_check_events')).rows.length>0);await assert.rejects(()=>sql.query('SELECT response_token FROM proposal_check_emails'),/permission denied/);await assert.rejects(()=>sql.query("SELECT record_proposal_check_event($1,$2,'interaction','declined')",[id(40),crypto.randomUUID()]),/permission denied/);await sql.exec('RESET ROLE')}
for(const user of [11,20]){await sql.exec(`SELECT set_config('test.uid','${id(user)}',false);SET ROLE authenticated;`);assert.equal((await sql.query('SELECT id FROM proposal_check_reporting')).rows.length,0);assert.equal((await sql.query('SELECT id FROM proposal_check_events')).rows.length,0);await sql.exec('RESET ROLE')}
for(const restriction of ['module','inactive','permission']) {
 await sql.exec(`SELECT set_config('test.uid','${id(10)}',false)`);
 if(restriction==='module')await sql.exec("SELECT set_config('test.access','false',false)");
 if(restriction==='inactive')await sql.exec(`UPDATE profiles SET is_active=false WHERE id='${id(10)}'`);
 if(restriction==='permission')await sql.exec(`UPDATE profiles SET can_manage_customer_feedback=false WHERE id='${id(10)}'`);
 await sql.exec('SET ROLE authenticated');assert.equal((await sql.query('SELECT id FROM proposal_check_reporting')).rows.length,0);assert.equal((await sql.query('SELECT id FROM proposal_check_events')).rows.length,0);
 await sql.exec(`RESET ROLE; SELECT set_config('test.access','true',false); UPDATE profiles SET is_active=true,can_manage_customer_feedback=true WHERE id='${id(10)}'`);
}
await sql.exec('SET ROLE anon');await assert.rejects(()=>sql.query('SELECT * FROM proposal_check_events'),/permission denied/);await sql.exec('RESET ROLE');
// Simulate a rejected database write: no redirect and no false success.
const failedDb={...db,rpc:async()=>({error:{message:'Unavailable'}})};
assert.equal((await handleProposalResponse(new Request(`https://example.com?token=${token}&choice=love_it`),failedDb)).status,503);
await sql.query('SELECT record_proposal_check_open($1)',['secret']);const firstOpen=(await sql.query('SELECT opened_at FROM proposal_check_emails')).rows[0].opened_at;
await sql.query('SELECT record_proposal_check_open($1)',['secret']);assert.equal((await sql.query('SELECT opened_at FROM proposal_check_emails')).rows[0].opened_at.toISOString(),firstOpen.toISOString());
// Events and staff notifications commit together, so a delivery failure is retryable.
await sql.exec('ALTER TABLE notifications ADD CONSTRAINT fail_notification CHECK(false) NOT VALID');
const retryBody={...body,event_key:crypto.randomUUID()};assert.equal((await post(retryBody)).status,503);
assert.equal((await sql.query('SELECT count(*)::int AS n FROM proposal_check_events WHERE event_key=$1',[retryBody.event_key])).rows[0].n,0);
await sql.exec('ALTER TABLE notifications DROP CONSTRAINT fail_notification');assert.equal((await post(retryBody)).status,200);
// Bound valid-token traffic without dropping a successful retry.
await sql.query("INSERT INTO proposal_check_events(email_id,organization_id,event_key,kind,choice) SELECT $1,$2,gen_random_uuid(),'link_visit','considering' FROM generate_series(1,60)",[id(40),id(1)]);
assert.equal((await post({...body,event_key:crypto.randomUUID()})).status,503);assert.equal((await post(body)).status,200);
await sql.exec(`UPDATE proposal_check_emails SET response_expires_at=now()-interval '1 second'`);assert.equal((await post(body)).status,404);
await sql.close();console.log('Proposal responses: five abandoned-click paths, follow-up interactions, messages, idempotency, notifications, scanner hints, expiry, input validation, tenant/rep permissions, and private tokens passed.');

const outgoing=[];let providerOk=true;let subdomain='elife';
globalThis.__notificationTransport=async request=>{outgoing.push({payload:JSON.parse(request.body),headers:request.headers});return {ok:providerOk}};
const notifySource=(await readFile('supabase/functions/proposal-check-response/notify.ts','utf8')).replace(/^import[^;]+;\n/gm,'');
const {notifyProposalMessage}=await moduleFrom('const sendSystemEmail=globalThis.__notificationTransport;const {proposalChoices,isProposalChoice}=globalThis.__options;\n'+notifySource);
const feedbackDb={from(table){const filters={};const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q},single:async()=>{
 if(table==='organizations'){assert.equal(filters.id,'org');return{data:{subdomain}}}
 if(table==='company_settings'){assert.equal(filters.organization_id,'org');return{data:{company_name:'Electronic Life',company_email:'office@example.com',from_email:'sender@example.com',app_url:'https://elife.myjobview.com'}}}
 assert.equal(table,'proposal_check_events');assert.deepEqual(filters,{id:'event',email_id:'email',organization_id:'org',kind:'message'});return{data:{choice:'considering',step:'Need more information',message:'More details <please>'}};
 }};q.maybeSingle=q.single;return q}};
for(const variant of ['owner','sales']) {
 await notifyProposalMessage(feedbackDb,{id:'email',organization_id:'org',recipient_name:'Volland Foundation',recipient_email:'customer@example.com',variant},'event');
 assert.deepEqual(outgoing.at(-1).payload.to,['josh@electroniclife.com']);
 assert.equal(outgoing.at(-1).payload.reply_to,'customer@example.com');
 assert.ok(outgoing.at(-1).payload.html.includes('More details &lt;please&gt;'));
 assert.ok(outgoing.at(-1).payload.text.includes('Volland Foundation'));
 assert.equal(outgoing.at(-1).headers['Idempotency-Key'],'proposal-check-message-event');
 const link=new URL(outgoing.at(-1).payload.text.match(/https:\/\/[^\s]+/)[0]);
 assert.equal(link.searchParams.get('tab'),'reviews');assert.equal(link.searchParams.get('reviewType'),'proposal');
 assert.equal(link.searchParams.get('proposalCheckEmailId'),'email');assert.equal(link.searchParams.get('proposalCheckEventId'),'event');
}
providerOk=false;await assert.rejects(()=>notifyProposalMessage(feedbackDb,{id:'email',organization_id:'org',recipient_name:'Customer',recipient_email:'customer@example.com'},'event'),/notification failed/);
providerOk=true;subdomain='another-dealer';await notifyProposalMessage(feedbackDb,{id:'email',organization_id:'org',recipient_name:'Customer',recipient_email:'customer@example.com'},'event');assert.deepEqual(outgoing.at(-1).payload.to,['office@example.com'],'Other dealers never send private feedback to Electronic Life');
console.log('Owner email routing, both variants, saved feedback, reply address, escaping, tenant boundaries and retry idempotency passed.');
