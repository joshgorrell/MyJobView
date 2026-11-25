import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const db=new PGlite();
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003';
try{
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table organizations(id uuid primary key);
create table profiles(id uuid primary key,organization_id uuid,role text,is_active boolean,contact_id uuid);
create function get_user_org_id() returns uuid language sql stable as $$select organization_id from profiles where id=auth.uid()$$;
grant usage on schema auth to authenticated;grant select on profiles to authenticated;
insert into organizations values ('${a}'),('${b}');insert into profiles values ('${u}','${a}','admin',true,null);`);
for(const name of ['20261125153000_website_widget_settings.sql','20261125160000_website_widget_rate_limit.sql','20261125173000_website_analytics.sql','20261125192000_website_widget_admin_hardening.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
await db.exec(`insert into website_widget_settings(organization_id,kind,public_id,enabled,allowed_origins) values ('${a}','analytics','${a}',true,array['https://a.example']),('${b}','analytics','${b}',true,array['https://b.example']);set test.uid='${u}';set role authenticated;`);
assert.equal((await db.query('select * from website_widget_settings')).rows.length,1);
assert.equal((await db.query("update website_widget_settings set enabled=false where organization_id=$1 returning id",[b])).rows.length,0);
await assert.rejects(db.query('select consume_website_widget_limit($1)',[a]));
await db.exec('reset role;update profiles set is_active=false;set role authenticated;');
assert.equal((await db.query('select * from website_widget_settings')).rows.length,0);
await db.exec('reset role;set role anon;');
await assert.rejects(db.query('select * from website_widget_settings'));
await db.exec('reset role;set role service_role;');
for(let i=0;i<21;i++)assert.equal((await db.query('select consume_website_widget_limit($1) as ok',[a])).rows[0].ok,i<20);
assert.equal((await db.query("select record_website_view($1,'https://b.example','/') as ok",[a])).rows[0].ok,false);
assert.equal((await db.query("select record_website_view($1,'https://a.example','/') as ok",[a])).rows[0].ok,true);
}finally{await db.close();}
console.log('Widget database isolation and rate-limit checks passed');
