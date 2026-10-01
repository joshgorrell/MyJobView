import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,role text,is_active boolean DEFAULT true);
 CREATE FUNCTION flow_has_module_access(text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.module',true),'true')='true' $$;
 CREATE TABLE contacts(id uuid PRIMARY KEY,organization_id uuid,full_name text,company_name text,phone text,email text,street_address text,city text,state text,zip_code text);
 CREATE TABLE service_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,contact_id uuid,customer_name text,customer_phone text,customer_email text,job_location_address text,job_location_city text,job_location_state text,job_location_zip text,job_description text,billable_type text,billable_by text,priority text,notes text,status text,source_type text,created_by uuid,work_order_id uuid);
 CREATE TABLE punchlist_tasks(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,title text,details text,status text DEFAULT 'draft',service_request_id uuid REFERENCES service_requests(id),work_order_id uuid,requested_at timestamptz,updated_at timestamptz,created_at timestamptz DEFAULT now(),completed_at timestamptz,completed_by uuid,completed_by_customer boolean DEFAULT false,priority_order int DEFAULT 1);
 CREATE TABLE notifications(user_id uuid,organization_id uuid,title text,body text,type text,related_id uuid,is_read boolean,created_at timestamptz);
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
 INSERT INTO profiles(id,organization_id,role) VALUES('${id(10)}','${id(1)}','admin'),('${id(11)}','${id(1)}','service_manager'),('${id(20)}','${id(2)}','admin'),('${id(21)}','${id(2)}','service_manager');
 INSERT INTO contacts(id,organization_id,full_name) VALUES('${id(30)}','${id(1)}','Customer A'),('${id(31)}','${id(1)}','Customer B'),('${id(40)}','${id(2)}','Other Dealer');
`);
await db.exec(await readFile(new URL('../../supabase/migrations/20251215182036_add_service_request_cancellation_revert_trigger.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/20261001001456_compact_punchlist_and_safe_service_requests.sql',import.meta.url),'utf8'));
await db.exec(`CREATE TRIGGER notify_request AFTER INSERT ON service_requests FOR EACH ROW EXECUTE FUNCTION notify_service_managers_new_request();`);
async function as(n,claims={},role='authenticated') {
 await db.exec(`RESET ROLE; SET test.uid='${n ? id(n) : ''}'; SET test.jwt='${JSON.stringify(claims)}'; SET ROLE ${role};`);
}
async function query(sql) { return (await db.query(sql)).rows; }
async function adminQuery(sql) { await db.exec('RESET ROLE'); return query(sql); }
async function task(n,contact=30) {
 await db.exec('RESET ROLE');
 await db.exec(`INSERT INTO punchlist_tasks(id,organization_id,contact_id,title,details) VALUES('${id(n)}','${id(contact===40?2:1)}','${id(contact)}','Old subject','Issue ${n}')`);
}
const request = nums => query(`SELECT request_punchlist_service(ARRAY[${nums.map(n=>`'${id(n)}'::uuid`).join(',')}],'${id(30)}','Keep these notes') AS id`);
for (const n of [100,101,102,103,104,105,106,107,108,109]) await task(n);
await task(200,40); await task(201,31);
assert.equal((await query('SELECT count(*)::int AS n FROM service_requests'))[0].n,0,'Saving items does not request service');
await as(10);
await assert.rejects(request([]));
await assert.rejects(request([100,200]),/Invalid punchlist selection/);
await assert.rejects(request([100,201]),/Invalid punchlist selection/);
const sr=(await request([100,101]))[0].id;
assert.equal((await request([100,101]))[0].id,sr,'Retry returns same request');
const srs=await adminQuery('SELECT * FROM service_requests');
assert.equal(srs.length,1);
assert.match(srs[0].job_description,/Issue 100/); assert.match(srs[0].job_description,/Issue 101/);
assert.equal(srs[0].source_type,'punchlist'); assert.equal(srs[0].organization_id,id(1));
const ns=await query('SELECT * FROM notifications');
assert.equal(ns.length,1); assert.equal(ns[0].user_id,id(11)); assert.equal(ns[0].related_id,sr);
assert.equal((await query(`SELECT status FROM punchlist_tasks WHERE id='${id(102)}'`))[0].status,'draft');
await as(10); await assert.rejects(request([101,102]),/already been requested/);
await query(`SELECT update_punchlist_item('${id(100)}','cancel')`);
let rows=await adminQuery(`SELECT id,status,service_request_id,requested_at FROM punchlist_tasks WHERE id IN ('${id(100)}','${id(101)}') ORDER BY id`);
assert.equal(rows[0].status,'draft'); assert.equal(rows[0].requested_at,null);
assert.equal(rows[1].status,'requested'); assert.equal(rows[1].service_request_id,sr);
assert.equal((await query(`SELECT status FROM service_requests WHERE id='${sr}'`))[0].status,'open');
assert.doesNotMatch((await query(`SELECT job_description FROM service_requests WHERE id='${sr}'`))[0].job_description,/Issue 100/);
await as(10); await query(`SELECT mark_punchlist_task_completed('${id(101)}',NULL,false)`);
assert.equal((await adminQuery(`SELECT status FROM service_requests WHERE id='${sr}'`))[0].status,'cancelled','Final pending item completes request');
await as(10); const sr2=(await request([102,103,104]))[0].id;
await query(`SELECT update_punchlist_item('${id(102)}','delete')`);
assert.equal((await adminQuery(`SELECT count(*)::int AS n FROM punchlist_tasks WHERE id='${id(102)}'`))[0].n,0);
assert.equal((await query(`SELECT status FROM service_requests WHERE id='${sr2}'`))[0].status,'open');
const portal={app_metadata:{is_portal_user:true,contact_id:id(30),organization_id:id(1)}};
await as(50,portal);
await query(`SELECT mark_punchlist_task_completed('${id(103)}',NULL,true)`);
assert.equal((await adminQuery(`SELECT completed_by_customer FROM punchlist_tasks WHERE id='${id(103)}'`))[0].completed_by_customer,true,'Portal without profile can complete own item');
assert.equal((await query(`SELECT status FROM punchlist_tasks WHERE id='${id(104)}'`))[0].status,'requested','Sibling remains requested');
await as(50,portal); await query(`SELECT update_punchlist_item('${id(103)}','reopen')`);
rows=await adminQuery(`SELECT * FROM punchlist_tasks WHERE id='${id(103)}'`);
assert.equal(rows[0].status,'draft'); assert.equal(rows[0].completed_by_customer,false); assert.equal(rows[0].service_request_id,null);
// Work orders survive an individual completion, and cannot be silently cancelled/deleted.
await as(10);const sr3=(await request([105,106]))[0].id;
await db.exec(`RESET ROLE;UPDATE service_requests SET work_order_id='${id(500)}',status='converted_to_work_order' WHERE id='${sr3}';UPDATE punchlist_tasks SET status='scheduled' WHERE service_request_id='${sr3}';`);
await as(50,portal);await assert.rejects(query(`SELECT update_punchlist_item('${id(105)}','cancel')`),/work order exists/);
await assert.rejects(query(`SELECT update_punchlist_item('${id(105)}','delete')`),/work order exists/);
await query(`SELECT mark_punchlist_task_completed('${id(105)}',NULL,true)`);
assert.equal((await adminQuery(`SELECT status FROM service_requests WHERE id='${sr3}'`))[0].status,'converted_to_work_order');
assert.equal((await query(`SELECT status FROM punchlist_tasks WHERE id='${id(106)}'`))[0].status,'scheduled');
// Authenticated cross-dealer/cross-customer calls and forged editable metadata fail.
await as(20); await assert.rejects(request([107]),/access denied/);
await assert.rejects(query(`SELECT mark_punchlist_task_completed('${id(107)}',NULL,false)`),/access denied/);
await as(51,{app_metadata:{is_portal_user:true,contact_id:id(31),organization_id:id(1)}});
await assert.rejects(request([107]),/access denied/);
await as(52,{user_metadata:{is_portal_user:true,contact_id:id(30),organization_id:id(1)}});
await assert.rejects(request([107]),/access denied/);
await as(10); await db.exec("SET test.module='false'"); await assert.rejects(request([107]),/access denied/); await db.exec("SET test.module='true'");
await assert.rejects(query(`SELECT mark_punchlist_task_completed('${id(107)}','${id(20)}',false)`),/identity cannot/);
await as(null,{},'anon'); await assert.rejects(request([107]),/permission denied/);
await as(50,portal); const sr4=(await request([107,108,108]))[0].id;
await query(`SELECT update_punchlist_item('${id(107)}','cancel')`);
await query(`SELECT update_punchlist_item('${id(108)}','cancel')`);
assert.equal((await adminQuery(`SELECT status FROM service_requests WHERE id='${sr4}'`))[0].status,'cancelled');
await as(10); const sr5=(await request([109]))[0].id;
await db.exec(`RESET ROLE; UPDATE service_requests SET status='cancelled' WHERE id='${sr5}'`);
rows=await query(`SELECT status,requested_at FROM punchlist_tasks WHERE id='${id(109)}'`);
assert.equal(rows[0].status,'draft'); assert.equal(rows[0].requested_at,null,'Whole-request cancellation clears timestamp');
console.log('Punchlist: selection, retry, ownership, grouped cancellation/deletion/completion, reopen, notifications and work-order preservation passed.');
await db.close();
