import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const tables=['contacts','projects','work_orders','service_requests','change_orders','product_requests','proposals','invoices','payments','project_notes','customer_contact_log','flow_updates','leads','tasks','project_tasks','message_threads','messages','discussion_posts','task_comments','project_task_activity'];
await db.exec(`create schema private; create role anon; create role authenticated; create table profiles(id uuid,organization_id uuid); create table notifications(id int,related_id uuid,type text,organization_id uuid,user_id uuid); create table flow_events(id int primary key,source_table text,source_id uuid,organization_id uuid,contact_id uuid,project_id uuid,work_order_id uuid); create table flow_event_views(event_id int references flow_events on delete cascade);`);
for(const table of tables) await db.exec(`create table ${table}(id uuid primary key, organization_id uuid, contact_id uuid, project_id uuid,work_order_id uuid)`);
await db.exec(readFileSync(new URL('../../supabase/migrations/20261111122808_record_deletion_activity_cleanup.sql',import.meta.url),'utf8'));
const id='00000000-0000-0000-0000-000000000001', org='00000000-0000-0000-0000-000000000010', other='00000000-0000-0000-0000-000000000020';
for(const [i,table] of tables.entries()) {
 await db.exec(`insert into ${table}(id,organization_id) values ('${id}','${org}'); insert into flow_events(id,source_table,source_id,organization_id) values (1,'${table}','${id}','${org}'),(2,'${table}','${id}','${other}'),(3,'independent','${id}','${org}'); insert into flow_event_views values(1);`);
 await db.exec(`begin; delete from ${table}; rollback;`);
 assert.equal((await db.query('select * from flow_events')).rows.length,3,`${table} rollback`);
 await db.exec(`delete from ${table}`);
 assert.deepEqual((await db.query('select id from flow_events order by id')).rows,[{id:2},{id:3}],`${table} source cleanup and isolation`);
 assert.equal((await db.query('select * from flow_event_views')).rows.length,0);
 await db.exec('delete from flow_events');
}
await db.exec(`insert into contacts(id,organization_id) values('${id}','${org}'); insert into flow_updates(id,organization_id,contact_id) values('${other}','${org}','${id}'); insert into flow_events(id,source_table,source_id,organization_id) values(1,'flow_updates','${other}','${org}'); insert into notifications values(1,'${other}','flow_update_mention','${org}',null),(2,'${other}','system','${org}',null),(3,'${other}','flow_update_mention','${other}',null); delete from contacts;`);
assert.equal((await db.query('select * from flow_updates')).rows.length,0);
assert.equal((await db.query('select * from flow_events')).rows.length,0);
assert.deepEqual((await db.query('select id from notifications order by id')).rows,[{id:2},{id:3}]);
console.log('PASS: 20 source tables; rollback, tenant isolation, independent activity, read-state cascade, dependent notes and typed notifications');
await db.close();
