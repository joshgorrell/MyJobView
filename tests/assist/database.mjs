import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE TABLE organizations(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
 CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations,role text,is_active boolean DEFAULT true);
 INSERT INTO organizations(id) VALUES('${id(1)}'),('${id(2)}');
 INSERT INTO profiles(id,organization_id,role,is_active) VALUES
 ('${id(10)}','${id(1)}','tech',true),('${id(11)}','${id(1)}','admin',true),
 ('${id(12)}','${id(1)}','portal_user',true),('${id(13)}','${id(1)}','admin',false),
 ('${id(20)}','${id(2)}','admin',true);`);
await db.exec(await readFile('supabase/migrations/20261116153609_assist_windows_enrollment.sql','utf8'));
const as = async (n, sql) => {
 await db.exec(`RESET ROLE; SELECT set_config('test.uid','${n ? id(n) : ''}',false); SET ROLE authenticated;`);
 return db.query(sql);
};
const setup = org => `SELECT get_assist_setup('${id(org)}') AS result`;
const enable = (org,value) => `SELECT set_assist_enabled('${id(org)}',${value}) AS result`;
const download = org => `SELECT get_assist_windows_download('${id(org)}') AS result`;
assert.equal((await as(10,setup(1))).rows[0].result.windows_download_ready,false);
await assert.rejects(as(10,enable(1,true)),/Dealer administrator/);
await assert.rejects(as(20,enable(1,true)),/Active employee/);
assert.equal((await as(11,enable(1,true))).rows[0].result.enabled,true);
assert.equal((await as(10,setup(1))).rows[0].result.windows_download_ready,false,'Enabled remains pending until provisioned');
await assert.rejects(as(10,download(1)),/Enrollment unavailable/);
for (const actor of [null,12,13,20]) await assert.rejects(as(actor,setup(1)),/Active employee/);
await assert.rejects(as(10,setup(2)),/Active employee/);
await assert.rejects(as(10,'SELECT * FROM assist_private.dealer_setup'),/permission denied/);
await assert.rejects(as(11,"UPDATE assist_private.dealer_setup SET enrollment_enabled=true"),/permission denied/);
await db.exec(`RESET ROLE;
 INSERT INTO assist_private.dealer_setup(organization_id,server_origin,mesh_domain,windows_download_url,enrollment_enabled,verified_at) VALUES
 ('${id(1)}','https://assist.example.com','elife','https://assist.example.com/elife/meshagents?meshid=one&id=4',true,now()),
 ('${id(2)}','https://assist.example.com','dealer2','https://assist.example.com/dealer2/meshagents?meshid=two&id=4',true,now());`);
await as(20,enable(2,true));
assert.equal((await as(10,setup(1))).rows[0].result.windows_download_ready,true);
const issued=(await as(10,download(1))).rows[0].result;
assert.match(issued.url,/\/elife\//);
assert.match((await as(20,download(2))).rows[0].result.url,/\/dealer2\//);
await assert.rejects(as(20,download(1)),/Active employee/);
await db.exec('RESET ROLE');
assert.equal((await db.query('SELECT count(*)::int AS n FROM assist_private.enrollment_downloads')).rows[0].n,2);
await as(11,enable(1,false));
await assert.rejects(as(10,download(1)),/Enrollment unavailable/);
await as(11,enable(1,true));
await db.exec('RESET ROLE');
await db.exec(`UPDATE assist_private.dealer_setup SET enrollment_enabled=false WHERE organization_id='${id(1)}'`);
await assert.rejects(as(10,download(1)),/Enrollment unavailable/);
await db.exec(`RESET ROLE; UPDATE organizations SET is_active=false WHERE id='${id(2)}'`);
await assert.rejects(as(20,download(2)),/Active employee/);
await db.exec('RESET ROLE; SET ROLE anon');
await assert.rejects(db.query(setup(1)),/permission denied/);
await assert.rejects(db.query(download(1)),/permission denied/);
await assert.rejects(db.query(enable(1,true)),/permission denied/);
await db.exec('RESET ROLE');
await assert.rejects(db.exec(`UPDATE assist_private.dealer_setup SET mesh_domain='dealer2' WHERE organization_id='${id(1)}'`));
await assert.rejects(db.exec(`UPDATE assist_private.dealer_setup SET windows_download_url='http://evil.example/agent.exe'`));
await assert.rejects(db.exec(`UPDATE assist_private.dealer_setup SET windows_download_url='https://assist.example.com/dealer2/meshagents?meshid=wrong&id=4' WHERE organization_id='${id(1)}'`));
await assert.rejects(db.exec(`UPDATE assist_private.dealer_setup SET enrollment_enabled=true,verified_at=NULL`));
// Actor removal preserves issuance audit; organization-owned rows cascade transactionally.
await db.exec(`DELETE FROM profiles WHERE id='${id(10)}'`);
assert.equal((await db.query(`SELECT requested_by FROM assist_private.enrollment_downloads WHERE organization_id='${id(1)}'`)).rows[0].requested_by,null);
await db.exec(`BEGIN; DELETE FROM profiles WHERE organization_id='${id(1)}'; DELETE FROM organizations WHERE id='${id(1)}'; ROLLBACK;`);
assert.equal((await db.query('SELECT count(*)::int AS n FROM assist_private.dealer_setup')).rows[0].n,2);
await db.exec(`DELETE FROM profiles WHERE organization_id='${id(1)}'; DELETE FROM organizations WHERE id='${id(1)}';`);
assert.equal((await db.query('SELECT count(*)::int AS n FROM assist_private.dealer_setup')).rows[0].n,1);
assert.equal((await db.query('SELECT count(*)::int AS n FROM assist_private.enrollment_downloads')).rows[0].n,1);
await db.close();
console.log('Assist: tenant, active employee, anon, private grants, disable, validation, audit and deletion tests pass');
