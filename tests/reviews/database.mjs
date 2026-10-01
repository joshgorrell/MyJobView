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
await db.close();
console.log(
  "Lost opportunity review privacy, sharing, completion, owner notification, external proposal and tenant tests passed.",
);
