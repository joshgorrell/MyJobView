import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20261116162611_ringcentral_mailbox_mapping.sql",
    import.meta.url,
  ),
  "utf8",
);
const org = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  user = "00000000-0000-4000-8000-000000000003",
  foreign = "00000000-0000-4000-8000-000000000004",
  box = "00000000-0000-4000-8000-000000000005",
  vm = "00000000-0000-4000-8000-000000000006",
  request = "00000000-0000-4000-8000-000000000007";
async function setup() {
  const db = new PGlite();
  await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create table public.organizations(id uuid primary key);
 create table public.profiles(id uuid primary key,organization_id uuid,role text,is_active boolean,my_job_view_enabled boolean);
 create table public.contacts(id uuid primary key,organization_id uuid,phone text,mobile_phone text,business_phone text);
 create table public.ringcentral_mailboxes(id uuid primary key,organization_id uuid,enabled boolean,updated_at timestamptz);
 create table public.service_requests(id uuid primary key,organization_id uuid,created_by uuid);
 create table public.voicemail_messages(id uuid primary key,organization_id uuid,state text,department text,workflow_status text,updated_at timestamptz);
 create table public.phone_voicemail_department_access(organization_id uuid,user_id uuid,department text,primary key(organization_id,user_id,department));
 create table public.notifications(id serial primary key,organization_id uuid,user_id uuid,related_id uuid,type text);
 create table public.flow_events(id serial primary key,organization_id uuid,source_table text,source_id uuid);
 insert into organizations values('${org}'),('${other}');insert into auth.users values('${user}'),('${foreign}');
 insert into profiles values('${user}','${org}','service_manager',true,true),('${foreign}','${other}','admin',true,true);
 insert into ringcentral_mailboxes values('${box}','${org}',false,now());
 insert into voicemail_messages values('${vm}','${org}','ready','service','new',now());
 `);
  await db.exec(sql);
  return db;
}
const recipients = (id) =>
  JSON.stringify([
    { user_id: id, recipient_role: "responsible", email_enabled: true },
  ]);
const save = (db, id = user, version = 0) =>
  db.query(
    "select save_ringcentral_mailbox_mapping($1,$2,$3,true,$4,$5,120,$6::jsonb) saved",
    [org, box, version, "service", id, recipients(id)],
  );
test("mapping saves atomically, grants the department, and rejects stale edits", async () => {
  const db = await setup();
  assert.equal((await save(db)).rows[0].saved, true);
  assert.equal((await save(db)).rows[0].saved, false);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from phone_voicemail_department_access",
      )
    ).rows[0].n,
    1,
  );
  await db.close();
});
test("cross-tenant or disabled recipients cannot change a mapping", async () => {
  const db = await setup();
  await assert.rejects(save(db, foreign));
  await db.exec(
    `update profiles set my_job_view_enabled=false where id='${user}'`,
  );
  await assert.rejects(save(db));
  assert.equal(
    (await db.query("select enabled from ringcentral_mailboxes")).rows[0]
      .enabled,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from ringcentral_mailbox_recipients",
      )
    ).rows[0].n,
    0,
  );
  await db.close();
});
test("email claims are exclusive, sent receipts never retry, and stale ambiguous sends stop", async () => {
  const db = await setup();
  const claim = () =>
    db.query("select claim_phone_voicemail_email($1,$2,$3,$4) claimed", [
      org,
      vm,
      user,
      "new",
    ]);
  assert.equal((await claim()).rows[0].claimed, true);
  assert.equal((await claim()).rows[0].claimed, false);
  await db.exec("update phone_voicemail_email_deliveries set state='sent'");
  assert.equal((await claim()).rows[0].claimed, false);
  await db.exec(
    "update phone_voicemail_email_deliveries set state='failed',created_at=now()-interval '25 hours'",
  );
  assert.equal((await claim()).rows[0].claimed, false);
  assert.equal(
    (await db.query("select state from phone_voicemail_email_deliveries"))
      .rows[0].state,
    "unknown",
  );
  await db.close();
});
test("request linkage is atomic, department-authorized and prevents duplicate requests", async () => {
  const db = await setup();
  await save(db);
  await db.exec(`set test.actor='${user}'`);
  await db.exec(
    `insert into service_requests values('${request}','${org}','${user}','${vm}')`,
  );
  assert.equal(
    (await db.query("select service_request_id from voicemail_messages"))
      .rows[0].service_request_id,
    request,
  );
  await assert.rejects(
    db.exec(
      `insert into service_requests values(gen_random_uuid(),'${org}','${user}','${vm}')`,
    ),
  );
  await db.close();
});
test("cross-tenant request links roll back without modifying voicemail", async () => {
  const db = await setup();
  await db.exec(`set test.actor='${foreign}'`);
  await assert.rejects(
    db.exec(
      `insert into service_requests values('${request}','${other}','${foreign}','${vm}')`,
    ),
  );
  assert.equal(
    (await db.query("select count(*)::int n from service_requests")).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select service_request_id from voicemail_messages"))
      .rows[0].service_request_id,
    null,
  );
  await db.close();
});
test("voicemail deletion cleans owned receipts/snapshots and preserves independent request; rollback restores all", async () => {
  const db = await setup();
  await save(db);
  await db.exec(
    `set test.actor='${user}';insert into service_requests values('${request}','${org}','${user}','${vm}');insert into notifications(organization_id,user_id,related_id,type) values('${org}','${user}','${vm}','phone_voicemail'),('${other}','${foreign}','${vm}','phone_voicemail');insert into flow_events(organization_id,source_table,source_id) values('${org}','voicemail_messages','${vm}');select claim_phone_voicemail_email('${org}','${vm}','${user}','new');`,
  );
  await db.exec("begin");
  await db.exec(`delete from voicemail_messages where id='${vm}'`);
  await db.exec("rollback");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from phone_voicemail_email_deliveries",
      )
    ).rows[0].n,
    1,
  );
  await db.exec(`delete from voicemail_messages where id='${vm}'`);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from phone_voicemail_email_deliveries",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int n from notifications")).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select source_phone_voicemail_id from service_requests"))
      .rows[0].source_phone_voicemail_id,
    null,
  );
  assert.equal(
    (await db.query("select count(*)::int n from flow_events")).rows[0].n,
    0,
  );
  await db.close();
});
test("caller matching is tenant-scoped, includes mobile and refuses ambiguous matches", async () => {
  const db = await setup();
  await db.exec(
    `insert into contacts values(gen_random_uuid(),'${org}',null,'(785) 554-3764',null), (gen_random_uuid(),'${other}','7855543764',null,null);`,
  );
  assert.ok(
    (
      await db.query(
        `select match_phone_voicemail_contact('${org}','+17855543764') id`,
      )
    ).rows[0].id,
  );
  await db.exec(
    `insert into contacts values(gen_random_uuid(),'${org}','7855543764',null,null)`,
  );
  assert.equal(
    (
      await db.query(
        `select match_phone_voicemail_contact('${org}','+17855543764') id`,
      )
    ).rows[0].id,
    null,
  );
  await db.close();
});
