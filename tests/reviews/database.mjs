import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE organizations(id uuid PRIMARY KEY);
 CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid);
 CREATE FUNCTION get_user_org_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT organization_id FROM profiles WHERE id=auth.uid() $$;
 CREATE FUNCTION flow_has_module_access(text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.access',true),'true')='true' $$;
 CREATE TABLE proposals(id uuid PRIMARY KEY);
 CREATE TABLE review_requests(id uuid PRIMARY KEY,organization_id uuid,review_completed boolean DEFAULT false);
 ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
 CREATE POLICY requests ON review_requests FOR ALL TO authenticated USING(organization_id=get_user_org_id()) WITH CHECK(organization_id=get_user_org_id());
 CREATE TABLE notifications(user_id uuid,organization_id uuid,type text,title text,body text,related_id uuid);
 CREATE TABLE storage.objects(bucket_id text,name text);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE POLICY broad_legacy_storage ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
 GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON review_requests TO authenticated;
 INSERT INTO organizations VALUES('${id(1)}'),('${id(2)}');
 INSERT INTO profiles VALUES('${id(10)}','${id(1)}'),('${id(11)}','${
  id(1)
}'),('${id(12)}','${id(1)}'),('${id(20)}','${id(2)}');
 INSERT INTO review_requests(id,organization_id) VALUES('${id(30)}','${id(1)}');
`);
await db.exec(
  await readFile(
    new URL(
      "../../supabase/migrations/20260930151037_lost_opportunity_reviews.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(`SET ROLE service_role;
 UPDATE review_requests SET request_type='lost_opportunity';
 INSERT INTO storage.objects VALUES('lost-review-bids','private.pdf');
 INSERT INTO lost_review_owners VALUES('${id(1)}','${id(10)}');
 INSERT INTO lost_review_details(request_id,organization_id,opportunity_name,title) VALUES('${
  id(30)
}','${id(1)}','External home theater','Why did we lose?');
 INSERT INTO lost_review_tokens(request_id,token_hash) VALUES('${
  id(30)
}','secret');
 INSERT INTO lost_review_responses(request_id,message,recoverable) VALUES('${
  id(30)
}','I wanted better follow-up','maybe');
 RESET ROLE;`);
assert.equal(
  (await db.query("SELECT * FROM notifications")).rows[0].user_id,
  id(10),
  "Only owner is notified",
);
assert.equal(
  (await db.query("SELECT review_completed FROM review_requests")).rows[0]
    .review_completed,
  true,
  "Completion is atomic",
);
assert.ok(
  (await db.query("SELECT responded_at FROM lost_review_details")).rows[0]
    .responded_at,
);
async function as(n, role = "authenticated") {
  await db.exec(`RESET ROLE; SET test.uid='${id(n)}'; SET ROLE ${role};`);
}
async function count(table) {
  return (await db.query(`SELECT * FROM ${table}`)).rows.length;
}
await as(10);
assert.equal(
  await count("storage.objects"),
  0,
  "Legacy broad storage policies cannot expose bids",
);
await assert.rejects(
  db.exec(
    "INSERT INTO storage.objects VALUES('lost-review-bids','forged.pdf')",
  ),
  "Direct uploads denied",
);
assert.equal(await count("lost_review_responses"), 1, "Owner sees response");
await assert.rejects(
  db.query("SELECT * FROM lost_review_tokens"),
  "Owner cannot retrieve tokens",
);
await as(11);
assert.equal(await count("lost_review_details"), 1, "Sender sees tracking");
assert.equal(
  await count("lost_review_responses"),
  0,
  "Salesperson cannot see private response",
);
await as(12);
assert.equal(
  await count("lost_review_responses"),
  0,
  "Other admin is not owner",
);
await assert.rejects(
  db.exec(`UPDATE lost_review_details SET shared_at=now()`),
  "Cannot self-share",
);
await assert.rejects(
  db.exec(`INSERT INTO lost_review_owners VALUES('${id(2)}','${id(12)}')`),
  "Cannot designate self as owner directly",
);
await db.exec(`DELETE FROM review_requests WHERE id='${id(30)}'`);
assert.equal(
  await count("lost_review_details"),
  1,
  "Cannot erase owner-only feedback",
);
await as(20);
assert.equal(await count("lost_review_details"), 0);
assert.equal(
  await count("lost_review_responses"),
  0,
  "Cross dealer read denied",
);
await as(99, "anon");
await assert.rejects(
  db.query("SELECT * FROM lost_review_responses"),
  "Anonymous direct reads denied",
);
await db.exec(
  `RESET ROLE; SET ROLE service_role; UPDATE lost_review_details SET reviewed_at=now(),shared_at=now(); RESET ROLE;`,
);
await as(11);
assert.equal(
  await count("lost_review_responses"),
  1,
  "Explicit sharing enables same dealer read",
);
await db.exec(`SET test.access='false'`);
assert.equal(
  await count("lost_review_responses"),
  0,
  "Revoked Reviews permission prevents shared reads",
);
await db.exec(`SET test.access='true'`);
await as(20);
assert.equal(
  await count("lost_review_responses"),
  0,
  "Sharing never crosses dealers",
);
await db.exec("RESET ROLE");
assert.equal(
  (await db.query("SELECT public FROM storage.buckets")).rows[0].public,
  false,
  "Bids remain in private storage",
);
assert.equal(
  (await db.query("SELECT proposal_id FROM lost_review_details")).rows[0]
    .proposal_id,
  null,
  "External proposals require no MJV proposal",
);
await assert.rejects(
  db.exec(
    `INSERT INTO lost_review_responses(request_id,message,recoverable) VALUES('${
      id(30)
    }','duplicate','yes')`,
  ),
  "Repeat submission cannot overwrite feedback",
);
await db.exec(
  `ALTER TABLE profiles ADD COLUMN role text DEFAULT 'sales', ADD COLUMN is_active boolean DEFAULT true, ADD COLUMN email text DEFAULT 'test@example.com', ADD COLUMN full_name text DEFAULT 'Test user', ADD COLUMN role_id uuid;
CREATE TABLE department_modules(id uuid,module_key text,is_active boolean);
CREATE TABLE user_permission_overrides(user_id uuid,module_id uuid,override_type text);
CREATE TABLE role_module_access(role_id uuid,module_id uuid,has_access boolean);
INSERT INTO department_modules VALUES('${id(99)}','reviews',true);
GRANT SELECT ON department_modules,user_permission_overrides,role_module_access TO service_role;
UPDATE profiles SET role='admin' WHERE id='${id(10)}';
UPDATE profiles SET role='manager' WHERE id='${id(12)}';
UPDATE profiles SET role='admin' WHERE id='${id(20)}';
GRANT SELECT,UPDATE ON profiles TO authenticated;`,
);
await db.exec(
  await readFile(
    new URL(
      "../../supabase/migrations/20260930155602_lost_review_user_permissions.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await as(11);
assert.equal(
  (await db.query(
    "SELECT can_send_lost_opportunity_reviews FROM profiles WHERE id=$1",
    [id(11)],
  )).rows[0].can_send_lost_opportunity_reviews,
  true,
  "Sales defaults to send",
);
assert.equal(
  await count("lost_review_responses"),
  0,
  "Old sharing does not grant viewing permission",
);
await assert.rejects(
  db.exec(
    `UPDATE profiles SET can_view_lost_opportunity_submissions=true WHERE id='${
      id(11)
    }'`,
  ),
  "Sales cannot self-grant view",
);
await as(12);
assert.equal(
  await count("lost_review_responses"),
  0,
  "Managers require explicit viewing permission",
);
await as(10);
await db.exec(
  `UPDATE profiles SET can_send_lost_opportunity_reviews=false,can_view_lost_opportunity_submissions=true WHERE id='${
    id(12)
  }'`,
);
await as(12);
assert.equal(
  await count("lost_review_responses"),
  1,
  "View-only permission works independently of send",
);
await as(10);
await db.exec(
  `UPDATE profiles SET can_view_lost_opportunity_submissions=false WHERE id='${
    id(12)
  }'`,
);
await as(12);
assert.equal(
  await count("lost_review_responses"),
  0,
  "Revocation hides previously shared responses",
);
await as(20);
assert.equal((await db.query("SELECT can_view_lost_opportunity_submissions FROM profiles WHERE id=$1",[id(20)])).rows[0].can_view_lost_opportunity_submissions,true,"Admins default to viewing permission");
assert.equal(
  await count("lost_review_responses"),
  0,
  "Permission change never crosses tenant",
);
await db.exec(`RESET ROLE; SET ROLE service_role;
UPDATE profiles SET notify_lost_opportunity_submissions=true WHERE id='${
  id(10)
}';
INSERT INTO review_requests(id,organization_id,request_type) VALUES('${
  id(31)
}','${id(1)}','lost_opportunity');
INSERT INTO lost_review_details(request_id,organization_id,opportunity_name,title) VALUES('${
  id(31)
}','${id(1)}','External quote','Tell us why');
INSERT INTO lost_review_responses(request_id,message,recoverable) VALUES('${
  id(31)
}','Thanks','no'); RESET ROLE;`);
const alerts =
  (await db.query("SELECT user_id FROM notifications WHERE related_id=$1", [
    id(31),
  ])).rows;
assert.deepEqual(
  alerts.map((v) => v.user_id),
  [id(10)],
  "Only permitted viewers receive alerts",
);
console.log(
  "Independent permissions, defaults, self-grant protection, revocation and legacy sharing tests passed.",
);
await db.exec(await readFile(new URL('../../supabase/migrations/20261001160418_lost_review_viewed_audit.sql', import.meta.url), 'utf8'));
await db.exec(`SET ROLE service_role; UPDATE lost_review_details SET reviewed_by='${id(10)}' WHERE request_id='${id(30)}'; RESET ROLE;`);
assert.equal((await db.query('SELECT reviewed_by FROM lost_review_details WHERE request_id=$1', [id(30)])).rows[0].reviewed_by, id(10), 'First reviewer can be recorded');
await as(11);
await assert.rejects(db.exec(`UPDATE lost_review_details SET reviewed_by='${id(11)}'`), 'Employees cannot forge review audit directly');
await db.exec('RESET ROLE');
await db.exec(await readFile(new URL('../../supabase/migrations/20261001162100_lost_review_office_bid_formats.sql', import.meta.url), 'utf8'));
const bucket = (await db.query("SELECT public,allowed_mime_types FROM storage.buckets WHERE id='lost-review-bids'")).rows[0];
assert.equal(bucket.public, false, 'Office bids retain private storage');
for (const type of ['application/msword','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) assert.ok(bucket.allowed_mime_types.includes(type), 'Office type accepted by bucket: ' + type);
await db.exec(await readFile(new URL('../../supabase/migrations/20261001164956_lost_job_admin_assessments.sql', import.meta.url), 'utf8'));
await db.exec(`SET ROLE service_role; INSERT INTO lost_review_assessments(request_id,organization_id,primary_reason,preventability,attention_rating,created_by,updated_by) VALUES('${id(30)}','${id(1)}','lowest_price','no',5,'${id(10)}','${id(10)}'); RESET ROLE;`);
await as(10);
assert.equal(await count('lost_review_assessments'),1,'Same-company admin sees assessment');
await assert.rejects(db.exec(`UPDATE lost_review_assessments SET attention_rating=1`),'Direct assessment writes denied');
await db.exec("SET test.access='false'");
assert.equal(await count('lost_review_assessments'),0,'Revoked Reviews module hides assessments');
await db.exec("SET test.access='true'");
await as(11);
assert.equal(await count('lost_review_assessments'),0,'Sales cannot read admin coaching');
await as(20);
assert.equal(await count('lost_review_assessments'),0,'Other-company admin cannot read coaching');
await db.exec('RESET ROLE; SET ROLE anon');
await assert.rejects(db.query('SELECT * FROM lost_review_assessments'),'Public cannot read assessments');
await db.exec('RESET ROLE');
await assert.rejects(db.exec('UPDATE lost_review_assessments SET attention_rating=6'),'Out-of-range ratings rejected');
await assert.rejects(db.exec("UPDATE lost_review_assessments SET contributing_reasons=ARRAY['invalid']"),'Invalid reasons rejected');
console.log('Admin assessment privacy, write protection, tenant boundaries and rating constraints passed.');
await db.close();
console.log(
  "Lost opportunity review privacy, sharing, completion, owner notification, external proposal and tenant tests passed.",
);

 // Isolated feedback timeline ledger regression: no live producers or email.
 const ledgerDb = new PGlite();
 await ledgerDb.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE organizations(id uuid PRIMARY KEY);
 CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid, role text);
 GRANT USAGE ON SCHEMA auth,public TO authenticated,service_role,anon;
 GRANT SELECT ON profiles TO authenticated;
 INSERT INTO organizations VALUES('${id(1)}'),('${id(2)}');
 INSERT INTO profiles VALUES('${id(10)}','${id(1)}','admin'),('${id(11)}','${id(1)}','sales'),('${id(20)}','${id(2)}','owner');
 `);
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128135000_feedback_timeline_event_foundation.sql', import.meta.url),'utf8'));
 const insertEvent = `INSERT INTO feedback_timeline_events(organization_id,timeline_key,source_id,occurrence_key,occurred_at) VALUES('${id(1)}','service_completion','${id(30)}','resolution-1',now())`;
 await ledgerDb.exec('SET ROLE service_role');
 await ledgerDb.exec(insertEvent);
 await assert.rejects(ledgerDb.exec(insertEvent), 'Duplicate occurrence rejected');
 await ledgerDb.exec(insertEvent.replace('resolution-1','resolution-2'));
 await assert.rejects(ledgerDb.exec("UPDATE feedback_timeline_events SET cancelled_at=now()"), 'Cancellation reason required');
 await ledgerDb.exec("UPDATE feedback_timeline_events SET cancelled_at=now(), cancellation_reason='reopened' WHERE occurrence_key='resolution-1'");
 for (const [user, expected] of [[10,2],[11,0],[20,0]]) {
   await ledgerDb.exec(`RESET ROLE; SET test.uid='${id(user)}'; SET ROLE authenticated;`);
   assert.equal((await ledgerDb.query('SELECT * FROM feedback_timeline_events')).rows.length, expected);
   await assert.rejects(ledgerDb.exec(insertEvent), 'Staff cannot forge events');
   await assert.rejects(ledgerDb.exec('DELETE FROM feedback_timeline_events'), 'Staff cannot erase audit history');
 }
 await ledgerDb.exec('RESET ROLE; SET ROLE anon');
 await assert.rejects(ledgerDb.query('SELECT * FROM feedback_timeline_events'));
 await ledgerDb.exec('RESET ROLE');
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128141500_feedback_service_resolution_transition.sql', import.meta.url),'utf8'));
 for (const [before, after, expected] of [
   ['in_progress','closed','record'], ['scheduled','closed','record'],
   ['closed','closed',null], ['closed','open','cancel'],
   ['closed','cancelled','cancel'], ['cancelled','closed',null],
   ['open','in_progress',null], [null,'closed',null]
 ]) {
   const result = await ledgerDb.query('SELECT public.feedback_service_resolution_transition($1,$2) AS action',[before,after]);
   assert.equal(result.rows[0].action,expected);
 }
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128142000_feedback_service_ledger_adapter.sql', import.meta.url),'utf8'));
 await ledgerDb.exec(`
 CREATE TABLE service_requests(id uuid PRIMARY KEY, organization_id uuid, status text);
 CREATE TRIGGER test_service_resolution AFTER UPDATE ON service_requests
 FOR EACH ROW EXECUTE FUNCTION public.capture_feedback_service_resolution();
 INSERT INTO service_requests VALUES('${id(40)}','${id(1)}','closed'),('${id(41)}','${id(1)}','open');
 UPDATE service_requests SET status='closed' WHERE id='${id(41)}';
 UPDATE service_requests SET status='closed' WHERE id='${id(41)}';
 UPDATE service_requests SET status='open' WHERE id='${id(41)}';
 UPDATE service_requests SET status='closed' WHERE id='${id(41)}';
 `);
 const captured = (await ledgerDb.query("SELECT source_id,cancelled_at FROM feedback_timeline_events WHERE source_id IN ($1,$2)",[id(40),id(41)])).rows;
 assert.equal(captured.length,2,'Only actual closure transitions captured');
 assert.ok(captured.every(row => row.source_id===id(41)));
 assert.equal(captured.filter(row => row.cancelled_at!==null).length,1,'Reopening cancels prior occurrence');
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128142500_feedback_project_milestone_transition.sql', import.meta.url),'utf8'));
 for (const [before,after,expected] of [
   [null,'2026-11-28','record'], [null,'2026-11-29',null],
   ['2026-11-28','2026-11-28',null], ['2026-11-28',null,'cancel'],
   ['2026-11-28','2026-11-29','cancel'], ['2026-11-27','2026-11-28','correct'],
   ['2026-11-29','2026-11-28','record'], [null,'infinity',null]
 ]) {
   const result=await ledgerDb.query("SELECT public.feedback_project_milestone_transition($1::date,$2::date,'2026-11-28'::date) AS action",[before,after]);
   assert.equal(result.rows[0].action,expected);
 }
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128143000_feedback_project_ledger_adapter.sql', import.meta.url),'utf8'));
 await ledgerDb.exec(`
 CREATE TABLE projects(id uuid PRIMARY KEY, organization_id uuid, substantial_completion_date date);
 CREATE TRIGGER test_project_completion AFTER UPDATE ON projects
 FOR EACH ROW EXECUTE FUNCTION public.capture_feedback_project_completion();
 INSERT INTO projects VALUES('${id(50)}','${id(1)}',CURRENT_DATE-10),('${id(51)}','${id(1)}',NULL);
 UPDATE projects SET substantial_completion_date=CURRENT_DATE-9 WHERE id='${id(50)}';
 UPDATE projects SET substantial_completion_date=CURRENT_DATE WHERE id='${id(51)}';
 UPDATE projects SET substantial_completion_date=CURRENT_DATE-1 WHERE id='${id(51)}';
 `);
 const projectEvents=()=>ledgerDb.query("SELECT id,source_id,occurred_at,cancelled_at FROM feedback_timeline_events WHERE timeline_key='job_completion'");
 const initial=(await projectEvents()).rows;
 assert.equal(initial.length,1,'Historical correction does not enroll');
 assert.equal(initial[0].source_id,id(51));
 assert.equal(new Date(initial[0].occurred_at).toISOString().slice(0,10),(await ledgerDb.query("SELECT (CURRENT_DATE-1)::text AS day")).rows[0].day);
 await ledgerDb.exec(`UPDATE projects SET substantial_completion_date=CURRENT_DATE+1 WHERE id='${id(51)}'`);
 assert.ok((await projectEvents()).rows[0].cancelled_at);
 await ledgerDb.exec(`UPDATE projects SET substantial_completion_date=CURRENT_DATE WHERE id='${id(51)}'`);
 assert.equal((await projectEvents()).rows.length,2);
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128144500_feedback_support_resolution_adapter.sql', import.meta.url),'utf8'));
 await ledgerDb.exec(`
 CREATE TABLE tasks(id uuid PRIMARY KEY, organization_id uuid, status text, is_support_request boolean, contact_id uuid, completed_at timestamptz);
 CREATE TRIGGER test_support_resolution AFTER UPDATE ON tasks
 FOR EACH ROW EXECUTE FUNCTION public.capture_feedback_support_resolution();
 INSERT INTO tasks VALUES('${id(70)}','${id(1)}','pending',false,'${id(80)}',NULL),
 ('${id(71)}','${id(1)}','pending',true,'${id(80)}',NULL),
 ('${id(72)}','${id(1)}','pending',true,NULL,NULL),
 ('${id(73)}','${id(1)}','completed',true,'${id(80)}',now());
 UPDATE tasks SET status='completed',completed_at=now();
 UPDATE tasks SET status='completed' WHERE id='${id(71)}';
 `);
 const supportEvents=()=>ledgerDb.query("SELECT source_id,cancelled_at FROM feedback_timeline_events WHERE timeline_key='support_completion'");
 assert.equal((await supportEvents()).rows.length,1,'Only newly resolved customer support qualifies');
 assert.equal((await supportEvents()).rows[0].source_id,id(71));
 await ledgerDb.exec(`UPDATE tasks SET status='pending',completed_at=NULL WHERE id='${id(71)}'; UPDATE tasks SET status='completed',completed_at=now() WHERE id='${id(71)}';`);
 const supportRows=(await supportEvents()).rows;
 assert.equal(supportRows.length,2);
 assert.equal(supportRows.filter(row=>row.cancelled_at!==null).length,1);
 await ledgerDb.exec(`UPDATE tasks SET contact_id='${id(81)}' WHERE id='${id(71)}'`);
 assert.ok((await supportEvents()).rows.every(row=>row.cancelled_at!==null));
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128145000_feedback_proposal_event_adapter.sql', import.meta.url),'utf8'));
 await ledgerDb.exec(`
 CREATE TABLE proposals(id uuid PRIMARY KEY, organization_id uuid, status text, sent_at timestamptz);
 CREATE TRIGGER test_proposal_transition AFTER UPDATE ON proposals
 FOR EACH ROW EXECUTE FUNCTION public.capture_feedback_proposal_transition();
 INSERT INTO proposals VALUES('${id(90)}','${id(1)}','draft',NULL),('${id(91)}','${id(1)}','sent',now());
 UPDATE proposals SET status='sent',sent_at='2026-11-28T12:00:00Z' WHERE id='${id(90)}';
 UPDATE proposals SET status='sent' WHERE id='${id(90)}';
 UPDATE proposals SET status='viewed' WHERE id='${id(90)}';
 UPDATE proposals SET status='declined' WHERE id='${id(90)}';
 `);
 const proposalEvents=()=>ledgerDb.query("SELECT timeline_key,source_id,cancelled_at FROM feedback_timeline_events WHERE timeline_key IN ('proposal_check','lost_opportunity')");
 const proposalRows=(await proposalEvents()).rows;
 assert.equal(proposalRows.length,2);
 assert.ok(proposalRows.every(row=>row.source_id===id(90)));
 assert.ok(proposalRows.find(row=>row.timeline_key==='proposal_check').cancelled_at);
 assert.equal(proposalRows.find(row=>row.timeline_key==='lost_opportunity').cancelled_at,null);
 await ledgerDb.exec(`UPDATE proposals SET status='sent',sent_at='2026-11-28T13:00:00Z' WHERE id='${id(90)}'; UPDATE proposals SET status='approved' WHERE id='${id(90)}'`);
 assert.equal((await proposalEvents()).rows.length,3);
 assert.ok((await proposalEvents()).rows.every(row=>row.cancelled_at!==null));
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128145500_feedback_future_milestone_dates.sql', import.meta.url),'utf8'));
 for (const [key,completion,end,expected] of [
 ['test_tune','2026-01-01','2026-04-05','2026-04-05'],
 ['test_tune','2026-01-01',null,null],
 ['one_year','2024-02-29','2024-06-01','2025-02-28'],
 ['one_year','2025-11-28',null,'2026-11-28'],
 ['one_year',null,'2026-11-28',null],
 ['one_year','infinity',null,null],
 ['job_completion','2026-11-28',null,null]
 ]) {
 const result=await ledgerDb.query("SELECT public.feedback_future_milestone_date($1,$2::date,$3::date)::text AS day",[key,completion,end]);
 assert.equal(result.rows[0].day,expected);
 }
 for (const [day,activation,today,window,expected] of [
 ['2026-11-28','2026-11-01','2026-11-28',7,true],
 ['2026-11-21','2026-11-01','2026-11-28',7,true],
 ['2026-11-20','2026-11-01','2026-11-28',7,false],
 ['2026-11-21','2026-11-22','2026-11-28',7,false],
 ['2026-11-29','2026-11-01','2026-11-28',7,false],
 ['2026-11-28',null,'2026-11-28',7,false],
 ['2026-11-28','2026-11-01','2026-11-28',31,false]
 ]) {
 const result=await ledgerDb.query("SELECT public.feedback_milestone_due($1::date,$2::date,$3::date,$4) AS due",[day,activation,today,window]);
 assert.equal(result.rows[0].due,expected);
 }
 await ledgerDb.exec(`
 CREATE TABLE feedback_timeline_drafts(organization_id uuid,timeline_key text,steps jsonb);
 INSERT INTO feedback_timeline_drafts VALUES ('${id(1)}','service_completion','[{"delay_days":0,"template_key":"example"},{"delay_days":2,"template_key":"example"}]'),('${id(2)}','service_completion','[{"delay_days":0,"template_key":"other"}]');
 INSERT INTO feedback_timeline_events(organization_id,timeline_key,source_id,occurrence_key,occurred_at,recorded_at)
 VALUES ('${id(1)}','service_completion','${id(95)}','preview','2026-11-27T12:00Z','2026-11-27T12:00Z'),
 ('${id(2)}','service_completion','${id(96)}','preview','2026-11-27T12:00Z','2026-11-27T12:00Z'),
 ('${id(1)}','service_completion','${id(97)}','old','2026-10-01T12:00Z','2026-11-27T12:00Z');
 `);
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128150000_feedback_dry_run_planner.sql', import.meta.url),'utf8'));
 const preview=()=>ledgerDb.query("SELECT * FROM public.preview_feedback_timeline_steps($1,'2026-11-28T12:00Z','2026-11-26T12:00Z',100)",[id(1)]);
 const previewRows=(await preview()).rows;
 assert.equal(previewRows.length,1);
 assert.equal(previewRows[0].template_key,'example');
 await ledgerDb.exec(`UPDATE feedback_timeline_events SET cancelled_at=now(),cancellation_reason='test' WHERE source_id='${id(95)}'`);
 assert.equal((await preview()).rows.length,0);
 await ledgerDb.exec(`
 ALTER TABLE proposals ADD COLUMN decline_reason text, ADD COLUMN declined_by text;
 CREATE TABLE proposal_check_emails(id uuid,organization_id uuid,proposal_id uuid,status text);
 CREATE TABLE proposal_check_events(email_id uuid,organization_id uuid,created_at timestamptz,kind text,suspected_automated boolean);
 CREATE TABLE proposal_loss_feedback(organization_id uuid,proposal_id uuid,source text);
 CREATE TABLE lost_review_details(organization_id uuid,proposal_id uuid,responded_at timestamptz);
 INSERT INTO proposals(id,organization_id,status) VALUES('${id(98)}','${id(1)}','sent');
 INSERT INTO proposal_check_emails VALUES('${id(99)}','${id(1)}','${id(98)}','sent');
 INSERT INTO proposal_check_events VALUES('${id(99)}','${id(1)}','2026-11-28T12:00Z','link_visit',false);
 `);
 await ledgerDb.exec(await readFile(new URL('../../supabase/migrations/20261128150500_feedback_proposal_response_suppression.sql', import.meta.url),'utf8'));
 const suppression=async(key,org=id(1))=>(await ledgerDb.query("SELECT public.feedback_proposal_suppression($1,$2,$3,'2026-11-27T12:00Z') AS reason",[org,id(98),key])).rows[0].reason;
 assert.equal(await suppression('proposal_check'),null);
 assert.equal(await suppression('proposal_check',id(2)),'missing_source');
 await ledgerDb.exec(`INSERT INTO proposal_check_events VALUES('${id(99)}','${id(1)}','2026-11-28T12:00Z','interaction',true)`);
 assert.equal(await suppression('proposal_check'),null);
 await ledgerDb.exec(`INSERT INTO proposal_check_events VALUES('${id(99)}','${id(1)}','2026-11-28T12:00Z','message',false)`);
 assert.equal(await suppression('proposal_check'),'customer_responded');
 await ledgerDb.exec(`UPDATE proposals SET status='declined' WHERE id='${id(98)}'; INSERT INTO proposal_loss_feedback VALUES('${id(1)}','${id(98)}','staff_assessment')`);
 assert.equal(await suppression('lost_opportunity'),null);
 await ledgerDb.exec(`INSERT INTO proposal_loss_feedback VALUES('${id(1)}','${id(98)}','phone')`);
 assert.equal(await suppression('lost_opportunity'),'customer_responded');
 await ledgerDb.close();
 console.log('Feedback event ledger isolation, duplicate and cancellation checks passed.');
