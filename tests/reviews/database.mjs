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
await db.close();
console.log(
  "Lost opportunity review privacy, sharing, completion, owner notification, external proposal and tenant tests passed.",
);
