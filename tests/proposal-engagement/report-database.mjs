process.on('uncaughtException',error=>{console.error(error.message,error.detail||'',error.position||'');process.exit(1)});
// Isolated PostgreSQL engine. No production credentials or customer records needed.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const org=uid(1), otherOrg=uid(2), user=uid(10), colleague=uid(11), outsider=uid(12), customer=uid(20), otherCustomer=uid(21), project=uid(30), wo=uid(40);
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,full_name text,role text,role_id uuid);
CREATE FUNCTION get_user_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$ SELECT organization_id FROM profiles WHERE id=auth.uid() $$;
CREATE TABLE department_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),module_key text,display_name text,is_active boolean DEFAULT true);
CREATE TABLE role_module_access(role_id uuid,module_id uuid,has_access boolean);
CREATE TABLE user_permission_overrides(user_id uuid,module_id uuid,override_type text);
CREATE TABLE contacts(id uuid PRIMARY KEY,organization_id uuid,full_name text,contact_name text,company_name text,assigned_to uuid,office_id uuid,phone text,updated_at timestamptz DEFAULT now());
CREATE TABLE projects(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,name text,project_number text,assigned_pm uuid,salesperson_id uuid,designer_id uuid,office_id uuid,customer_location_id uuid,status text,created_at timestamptz DEFAULT now());
CREATE TABLE work_orders(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,project_id uuid,work_order_number text,title text,assigned_to uuid,customer_sales_rep_id uuid,office_id uuid,customer_location_id uuid,status text,scheduled_date date,scheduled_start_time time,description text,updated_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE customer_locations(id uuid PRIMARY KEY,customer_contact_id uuid,name text);
CREATE TABLE service_requests(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,project_id uuid,work_order_id uuid,status text);
CREATE TABLE change_orders(id uuid PRIMARY KEY,organization_id uuid,project_id uuid,change_order_number text,status text,description text);
CREATE TABLE product_requests(id uuid PRIMARY KEY,organization_id uuid,work_order_id uuid,project_id uuid,customer_contact_id uuid,status text);
CREATE TABLE proposals(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,proposal_number text,status text);
CREATE TABLE invoices(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,project_id uuid,office_id uuid,invoice_number text,status text);
CREATE TABLE payments(id uuid PRIMARY KEY,organization_id uuid,invoice_id uuid);
CREATE TABLE project_notes(id uuid PRIMARY KEY,organization_id uuid,project_id uuid,body text,is_internal boolean);
CREATE TABLE customer_contact_log(id uuid PRIMARY KEY,organization_id uuid,work_order_id uuid,service_request_id uuid,notes text);
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO organizations VALUES ('${org}'),('${otherOrg}');
INSERT INTO profiles VALUES ('${user}','${org}','Josh','admin',null),('${colleague}','${org}','Jesse','admin',null),('${outsider}','${otherOrg}','Other dealer','admin',null);
INSERT INTO department_modules(module_key) SELECT unnest(ARRAY['contacts','projects','work_orders','service_requests','change_orders','parts_requests','proposals','invoices']);
INSERT INTO contacts(id,organization_id,full_name,assigned_to) VALUES ('${customer}','${org}','Jones Residence','${colleague}'),('${otherCustomer}','${otherOrg}','Other customer','${outsider}');
INSERT INTO projects(id,organization_id,contact_id,name,project_number,assigned_pm) VALUES ('${project}','${org}','${customer}','Jones installation','P-100','${colleague}');
`);

await db.exec(`
ALTER TABLE organizations ADD COLUMN timezone text DEFAULT 'America/Chicago';
ALTER TABLE profiles ADD COLUMN is_active boolean DEFAULT true,ADD COLUMN email text;
UPDATE profiles SET email=id::text||'@example.com';
ALTER TABLE contacts ADD COLUMN portal_user_id uuid;
UPDATE contacts SET portal_user_id='${uid(90)}' WHERE id='${customer}';
ALTER TABLE proposals ADD COLUMN created_by uuid,ADD COLUMN is_active_revision boolean DEFAULT true,ADD COLUMN is_portal_visible boolean DEFAULT true,ADD COLUMN title text,ADD COLUMN office_id uuid,ADD COLUMN sent_at timestamptz,ADD COLUMN approved_at timestamptz,ADD COLUMN declined_at timestamptz;
CREATE TABLE proposal_rooms(id uuid PRIMARY KEY,proposal_id uuid,name text);
CREATE TABLE proposal_activity(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid,activity_type text,duration_seconds integer DEFAULT 0,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),user_agent text,ip_address text);
CREATE SCHEMA private;
CREATE FUNCTION private.can_access_page(p_rep uuid,p_module text) RETURNS boolean LANGUAGE sql AS $$ SELECT p_rep::text IS DISTINCT FROM current_setting('test.denied_rep',true) $$;
CREATE FUNCTION public.user_has_module_access(p_rep uuid,p_module text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT private.can_access_page(p_rep,p_module) $$;
CREATE FUNCTION public.update_proposal_activity_duration(uuid,integer) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.test_report_now() RETURNS timestamptz LANGUAGE sql AS $$ SELECT current_setting('test.now')::timestamptz $$;
SET test.now='2026-10-12T13:00:00Z';
`);
await db.exec(await readFile(new URL('../../supabase/migrations/20260928183403_customer_job_flow.sql',import.meta.url),'utf8'));
await db.exec(`
INSERT INTO department_modules(module_key) VALUES('feed');
ALTER TABLE flow_events ADD COLUMN thread_id uuid,ADD COLUMN task_id uuid,ADD COLUMN mentioned_user_ids uuid[] DEFAULT '{}';
CREATE TABLE messages(id uuid,body text);
CREATE TABLE discussion_posts(id uuid,content text,user_id uuid,assigned_to uuid,audience_user_ids uuid[],audience_type text,audience_department_id uuid,is_private boolean);
CREATE TABLE task_comments(id uuid,content text);
CREATE TABLE message_threads(id uuid,organization_id uuid,context_type text,context_id uuid,contact_id uuid,created_by uuid,assigned_sales_rep_id uuid);
GRANT SELECT ON messages,discussion_posts,task_comments,message_threads TO authenticated;
`);
await db.exec(await readFile(new URL('../../supabase/migrations/20260216193744_enhance_proposal_activity_tracking_with_device_info.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/20261012130517_proposal_engagement_sessions.sql',import.meta.url),'utf8'));
// Inject the clock only; execute the actual migration and worker SQL unchanged otherwise.
await db.exec((await readFile(new URL('../../supabase/migrations/20261012132908_proposal_activity_flow_and_weekly.sql',import.meta.url),'utf8')).replaceAll('clock_timestamp()','public.test_report_now()').replaceAll('DEFAULT now()','DEFAULT public.test_report_now()'));
await db.exec(`GRANT USAGE ON SCHEMA public,auth,private TO service_role;
INSERT INTO proposals(id,organization_id,contact_id,proposal_number,status,created_by,title,sent_at) VALUES
('${uid(50)}','${org}','${customer}','PRO-100','sent','${user}','Home Theater','2026-10-06T15:00:00Z'),
('${uid(51)}','${org}','${customer}','PRO-101','sent','${user}','Unopened','2026-10-07T15:00:00Z'),
('${uid(52)}','${org}','${customer}','PRO-102','sent','${colleague}','Other rep proposal','2026-10-07T15:00:00Z'),
('${uid(53)}','${otherOrg}','${otherCustomer}','PRO-103','sent','${outsider}','Other dealer','2026-10-07T15:00:00Z');
INSERT INTO proposal_rooms VALUES('${uid(60)}','${uid(50)}','Home Theater');
`);
async function as(id,role='authenticated'){await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${id||''}';SET ROLE ${role}`);}
async function worker(action,id=null,lease=null,payload={}){return (await db.query('SELECT proposal_activity_weekly_worker($1,$2,$3,$4) result',[action,id,lease,JSON.stringify(payload)])).rows[0].result;}
async function events(filters={}){return (await db.query('SELECT * FROM get_flow_events($1,NULL,50)',[JSON.stringify(filters)])).rows.map(r=>r.get_flow_events);}
await as(uid(90));
const activity=(await db.query('SELECT start_proposal_engagement($1,$2) id',[uid(50),uid(70)])).rows[0].id;
assert.ok(activity);
await db.query('SELECT start_proposal_engagement($1,$2)',[uid(50),uid(71)]);
await as(user);
assert.equal((await events({my_work:true})).filter(e=>e.event_type==='proposal_first_opened').length,1,'First open visible in rep My Work even when contact is assigned elsewhere');
assert.equal((await events()).filter(e=>e.source_id===uid(50)&&e.summary.includes('portal')).length,0,'No second generic viewed-status Flow event');
await as(colleague);assert.equal((await events()).filter(e=>e.event_type==='proposal_first_opened').length,0,'Other sales reps do not see targeted open');
await as(outsider);assert.equal((await events()).filter(e=>e.event_type==='proposal_first_opened').length,0,'Other dealer excluded');
await db.exec('RESET ROLE');
await db.query(`UPDATE proposal_activity SET created_at='2026-10-09T15:00:00Z',duration_seconds=125,metadata=$1 WHERE id=$2`,[JSON.stringify({engagement:{trackingVersion:1,sections:{['room:'+uid(60)]:100,pricing:25},clicks:{approval_clicked:1}}}),activity]);
await db.query(`UPDATE proposal_activity SET created_at='2026-10-10T15:00:00Z' WHERE proposal_id=$1 AND id<>$2`,[uid(50),activity]);
const window=async(tz,now)=>(await db.query('SELECT private.proposal_activity_report_window($1,$2) value',[tz,now])).rows[0].value;
assert.equal((await window('America/Chicago','2026-10-12T12:59:59Z')).due,false);
assert.equal((await window('America/Chicago','2026-10-12T13:00:00Z')).due,true);
assert.equal((await window('America/Los_Angeles','2026-10-12T13:00:00Z')).due,false);
const fall=await window('America/Chicago','2026-11-02T14:00:00Z');assert.equal((Date.parse(fall.period_end)-Date.parse(fall.period_start))/3600000,169,'Fall DST week');
const spring=await window('America/Chicago','2026-03-09T13:00:00Z');assert.equal((Date.parse(spring.period_end)-Date.parse(spring.period_start))/3600000,167,'Spring DST week');
assert.equal((await window('Invalid/Zone','2026-10-12T13:00:00Z')).timezone,'America/Chicago');
await as(user);await assert.rejects(worker('generate'),'Browser cannot run worker');await assert.rejects(db.query('SELECT report_data,email_payload FROM proposal_activity_weekly_reports'),'Private payloads not exposed');
await as(null,'service_role');assert.equal(await worker('generate'),3,'One report per owner/dealer');assert.equal(await worker('generate'),0,'Weekly generation idempotent');
let report=await worker('claim');assert.ok(report);
if(report.recipient_user_id!==user){await worker('sent',report.id,report.lease_token);report=await worker('claim');}
if(report.recipient_user_id!==user){await worker('sent',report.id,report.lease_token);report=await worker('claim');}
assert.equal(report.recipient_user_id,user);
let other;while((other=await worker('claim'))){await worker('sent',other.id,other.lease_token);}assert.equal(report.report_data.length,2,'Only own proposals');
const row=report.report_data.find(r=>r.bucket==='engaged');assert.equal(row.visits,2);assert.equal(row.active_seconds,125);assert.equal(row.sections[0].label,'Home Theater');assert.equal(row.clicks.approval_clicked,1);
assert.equal(report.report_data[1].bucket,'unopened');
await assert.rejects(worker('sent',report.id,uid(99)),'Stale lease cannot acknowledge');
await assert.rejects(worker('store_payload',report.id,report.lease_token,{to:['wrong@example.com']}),'Wrong recipient rejected');
const cached=await worker('store_payload',report.id,report.lease_token,{to:[report.recipient_email],subject:'Weekly Activity'});
assert.deepEqual(await worker('store_payload',report.id,report.lease_token,{to:[report.recipient_email],subject:'Changed'}),cached,'Frozen retry payload');
await worker('failed',report.id,report.lease_token,{error:'Temporary error'});
await db.exec("RESET ROLE; SET test.now='2026-10-12T14:00:00Z'");
await as(null,'service_role');const retried=await worker('claim');assert.equal(retried.id,report.id);assert.notEqual(retried.lease_token,report.lease_token);assert.deepEqual(retried.email_payload,cached);
await worker('sent',retried.id,retried.lease_token);
await as(user);assert.equal((await db.query('SELECT id,status FROM proposal_activity_weekly_reports')).rows.length,1,'Rep reads only own send status');
await as(colleague);assert.equal((await db.query('SELECT recipient_user_id FROM proposal_activity_weekly_reports')).rows.every(r=>r.recipient_user_id===colleague),true);
await db.exec(`RESET ROLE; UPDATE profiles SET is_active=false WHERE id='${user}'; SET test.now='2026-10-19T13:00:00Z'`);
await as(null,'service_role');assert.equal(await worker('generate'),2,'Deactivated recipient excluded');
await db.exec(`RESET ROLE; UPDATE profiles SET is_active=true WHERE id='${user}'; SET test.now='2026-10-26T13:00:00Z'; SET test.denied_rep='${colleague}'`);
await as(null,'service_role');assert.equal(await worker('generate'),2,'Revoked proposal permission excluded');
// Reassignment between preparing and retrying must cancel the old recipient's report.
let assigned=await worker('claim');while(assigned&&assigned.recipient_user_id!==user){await worker('sent',assigned.id,assigned.lease_token);assigned=await worker('claim');}
assert.ok(assigned);await worker('failed',assigned.id,assigned.lease_token,{error:'Retry test'});
await db.exec(`RESET ROLE;UPDATE proposals SET created_by='${colleague}' WHERE id='${uid(51)}';SET test.now='2026-10-26T14:00:00Z'`);
await as(null,'service_role');let remaining;while((remaining=await worker('claim')))await worker('sent',remaining.id,remaining.lease_token);
assert.equal((await db.query('SELECT status FROM proposal_activity_weekly_reports WHERE id=$1',[assigned.id])).rows[0].status,'skipped','Changed assignments are not emailed to old owner');
await as(null,'anon');await assert.rejects(worker('claim'));await assert.rejects(db.query('SELECT * FROM proposal_activity_weekly_reports'));
await db.exec(`RESET ROLE;CREATE SCHEMA vault;CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);CREATE SCHEMA net;CREATE SCHEMA cron;
CREATE TABLE net.requests(url text,headers jsonb,body jsonb);CREATE TABLE cron.jobs(name text,schedule text,command text);
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO net.requests VALUES(url,headers,body);RETURN 1;END $$;
CREATE FUNCTION cron.schedule(name text,schedule text,command text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cron.jobs VALUES(name,schedule,command);RETURN 1;END $$;
INSERT INTO vault.decrypted_secrets VALUES('security_billing_project_url','https://exampleproject.supabase.co'),('security_billing_worker_secret','${'x'.repeat(40)}');`);
await db.exec(await readFile(new URL('../../supabase/migrations/20261012132915_proposal_activity_weekly_schedule.sql',import.meta.url),'utf8'));
const job=(await db.query('SELECT * FROM cron.jobs')).rows[0];assert.equal(job.schedule,'*/15 * * * *');assert.ok(!job.command.includes('Bearer'));assert.equal(await db.query('SELECT private.invoke_proposal_activity_weekly()').then(r=>r.rows[0].invoke_proposal_activity_weekly),1);
const request=(await db.query('SELECT * FROM net.requests')).rows[0];assert.ok(request.url.endsWith('/functions/v1/proposal-activity-weekly'));assert.equal(request.headers.Authorization,'Bearer '+'x'.repeat(40));
await as(user);await assert.rejects(db.query('SELECT private.invoke_proposal_activity_weekly()'),'Browser cannot dispatch scheduler');await as(null,'service_role');await assert.rejects(db.query('SELECT private.invoke_proposal_activity_weekly()'),'Only DB scheduler can dispatch');
await db.exec("RESET ROLE;DELETE FROM vault.decrypted_secrets WHERE name='security_billing_project_url'");assert.equal((await db.query('SELECT private.invoke_proposal_activity_weekly() result')).rows[0].result,null,'Missing endpoint does not dispatch');
await db.close();console.log('Weekly database: targeted Flow, My Work, dealer/owner privacy, DST/due windows, aggregation, generation, leases, frozen retries, and inactive/permission exclusion pass');
