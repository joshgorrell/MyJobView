import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const source=await readFile('supabase/migrations/20260729133501_20260729130000_create_sales_dashboard_rpcs.sql','utf8');
const definition=name=>source.match(new RegExp('CREATE OR REPLACE FUNCTION '+name+'\\([\\s\\S]*?\\$\\$;'))[0];
try {
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULLIF(current_setting('test.uid',true),'')::uuid$$;CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,role text);`);
 for(const [n,role,org] of [[10,'admin',1],[11,'manager',1],[12,'sales_manager',1],[13,'sales_rep',1],[14,'technician',1],[20,'sales_rep',2]])await db.query('INSERT INTO profiles VALUES($1,$2,$3)',[id(n),id(org),role]);
 await db.exec(definition('is_manager_or_admin'));await db.exec(definition('get_caller_org_id'));
 // Financial payload is a fixture: this suite checks the real team RPC authorization,
 // not the underlying sales-accounting calculation.
 await db.exec(`CREATE FUNCTION get_sales_rep_dashboard(uuid,date) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('repId',$1)$$;`);
 await db.exec(definition('get_sales_team_dashboard'));
 await db.exec('REVOKE EXECUTE ON FUNCTION get_sales_team_dashboard(uuid[],date) FROM PUBLIC;GRANT EXECUTE ON FUNCTION get_sales_team_dashboard(uuid[],date) TO authenticated;');
 const run=async()=> (await db.query('SELECT get_sales_team_dashboard($1::uuid[]) result',[[id(13),id(20)]])).rows[0].result;
 await db.exec('SET ROLE authenticated');assert.equal((await run()).error,'not_authenticated');
 for(const n of [13,14]){await db.query("SELECT set_config('test.uid',$1,false)",[id(n)]);assert.equal((await run()).error,'unauthorized');}
 for(const n of [10,11,12]){await db.query("SELECT set_config('test.uid',$1,false)",[id(n)]);const result=await run();assert.deepEqual(result.reps,[{repId:id(13)}]);}
 await db.exec('RESET ROLE;SET ROLE anon');await assert.rejects(run,/permission denied/);
 console.log('PASS: actual team RPC denies unauthenticated, ordinary reps, unrelated roles and anonymous execution; management roles receive only same-organization reps');
} finally {await db.close();}
