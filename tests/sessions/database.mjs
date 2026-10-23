import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.profiles(id uuid primary key,organization_id uuid,role text not null default 'admin');
create function public.get_user_org_id() returns uuid language sql as $$ select organization_id from public.profiles where id=auth.uid() $$;
create table public.session_logout_schedule(id uuid primary key default gen_random_uuid(),enabled boolean default true,timezone text,logout_time time,last_run_at timestamptz);
create table public.user_sessions(id uuid primary key default gen_random_uuid(),user_id uuid,organization_id uuid,user_agent text,device_type text,browser_name text,browser_version text,os_name text,os_version text,device_model text,device_vendor text,session_start timestamptz not null default now(),last_activity timestamptz not null default now(),session_end timestamptz,is_active boolean default true,duration_seconds int default 0);
create table public.device_nicknames(id uuid primary key default gen_random_uuid(),device_signature text unique,device_type text,browser_name text,os_name text,nickname text,last_seen timestamptz,session_count int default 0,total_time_seconds int default 0,organization_id uuid,updated_at timestamptz default now());
create function public.generate_device_signature(text,text,text) returns text language sql as $$ select coalesce($1,'unknown')||'|'||coalesce($2,'unknown')||'|'||coalesce($3,'unknown') $$;`);
await db.exec(await readFile('supabase/migrations/20261013111232_browser_session_identity.sql','utf8'));
await db.exec(`create trigger stats after insert on public.user_sessions for each row execute function public.update_device_nickname_stats();
insert into profiles values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010'),('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000020');`);
async function user(n){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`]);}
async function start(browser){return (await db.query("select public.start_browser_session($1,'desktop','Chrome','100','Windows','10',null,null,'UA') as id",[`00000000-0000-4000-8000-${String(browser).padStart(12,'0')}`])).rows[0].id;}
await user(1);const first=await start(101);assert.equal(await start(101),first);
const second=await start(102);assert.notEqual(first,second);
await user(2);const other=await start(101);assert.notEqual(first,other);
await user(3);const otherOrg=await start(101);assert.notEqual(other,otherOrg);
assert.equal((await db.query('select count(*)::int as n from device_nicknames')).rows[0].n,4);
await user(1);
await db.query('update device_nicknames set nickname=$1 where device_signature=(select device_signature from user_sessions where id=$2)',["Josh's office computer",first]);
await db.query("update user_sessions set is_active=false,session_end=now() where id=$1",[first]);
const next=await start(101);assert.notEqual(first,next);
assert.equal((await db.query('select nickname,session_count from device_nicknames where device_signature=(select device_signature from user_sessions where id=$1)',[next])).rows[0].nickname,"Josh's office computer");
assert.equal((await db.query('select session_count from device_nicknames where device_signature=(select device_signature from user_sessions where id=$1)',[next])).rows[0].session_count,2);
await db.query("update user_sessions set last_activity=now()-interval '31 minutes' where id=$1",[next]);
assert.notEqual(await start(101),next);
await db.query("select set_config('request.jwt.claim.sub','',false)");
await assert.rejects(()=>start(101),/Authentication/);
await db.exec('set role anon'); await assert.rejects(()=>start(101),/permission denied/); await db.exec('reset role');
// A browser may close only its own session; direct table writes are blocked.
await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;');
await db.exec(await readFile('supabase/migrations/20261023124000_secure_browser_session_writes.sql', 'utf8'));
await user(1);
await db.exec('SET ROLE authenticated');
await assert.rejects(
  () => db.query('UPDATE public.user_sessions SET is_active=false WHERE id=$1', [other]),
  /permission denied/i
);
await assert.rejects(
  () => db.query('SELECT public.end_user_session($1,$2)', [
    '00000000-0000-4000-8000-000000000002', other
  ]),
  /Cannot end another user session/
);
await db.query('SELECT public.end_user_session($1,$2)', [
  '00000000-0000-4000-8000-000000000001', other
]);
assert.equal((await db.query('SELECT is_active FROM public.user_sessions WHERE id=$1', [other])).rows[0].is_active, true);
await db.query('SELECT public.end_user_session($1,$2)', [
  '00000000-0000-4000-8000-000000000001', second
]);
assert.equal((await db.query('SELECT is_active FROM public.user_sessions WHERE id=$1', [second])).rows[0].is_active, false);
await db.exec('RESET ROLE');
// IP location classification must default to Unknown and reject untrusted labels.
await db.exec(`CREATE TABLE public.ip_nicknames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  ip_address text NOT NULL
);`);
await db.exec(await readFile('supabase/migrations/20261022220000_ip_location_classification.sql', 'utf8'));
await db.query('INSERT INTO public.ip_nicknames (organization_id, ip_address) VALUES ($1,$2)', [
  '00000000-0000-4000-8000-000000000010', '203.0.113.20'
]);
assert.equal((await db.query('SELECT location_classification FROM public.ip_nicknames')).rows[0].location_classification, 'unknown');
await assert.rejects(
  () => db.query("UPDATE public.ip_nicknames SET location_classification='on_site'"),
  /ip_nicknames_location_classification_check/
);

const locationEdge = await readFile('supabase/functions/session-location/index.ts', 'utf8');
assert.match(locationEdge, /SUPABASE_SERVICE_ROLE_KEY/);
assert.ok(locationEdge.includes('supabase.auth.getUser()'));
assert.ok(locationEdge.includes(".eq('user_id', user.id)"));

console.log('Database: repeat visits deduplicate, identical computers stay separate, users and tenants stay separate, nicknames survive new sessions, expired sessions resume and anonymous calls fail');
await db.close();
