import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {compileLocalAuthInterface} from '../../scripts/techsafe/local-auth-interface.mjs';
const record=JSON.parse(fs.readFileSync('tests/techsafe/fixtures/auth-interface-catalog.json','utf8'));
const plan=compileLocalAuthInterface(record),db=new PGlite();
try{
await db.exec('BEGIN;');for(const sql of plan.statements)await db.exec(sql);await db.exec('COMMIT;');
const native=await db.query(fs.readFileSync('scripts/techsafe/capture-auth-interface.sql','utf8'));
const installed=JSON.parse(native.rows[0].payload_text),original=JSON.parse(record.payload_text);
assert.deepEqual(installed.users,original.users);
assert.deepEqual(installed.routines.map(r=>({identity:r.identity,definition:r.definition})),original.routines.map(r=>({identity:r.identity,definition:r.definition})));
const read=async()=>(await db.query('SELECT auth.uid()::text AS uid,auth.email() AS email,auth.role() AS role,auth.jwt() AS jwt')).rows[0];
assert.deepEqual(await read(),{uid:null,email:null,role:null,jwt:null});
const claims={sub:'10000000-0000-0000-0000-000000000001',email:'synthetic@example.invalid',role:'authenticated',app_metadata:{test:true}};
await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);
assert.deepEqual(await read(),{uid:claims.sub,email:claims.email,role:claims.role,jwt:claims});
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",['10000000-0000-0000-0000-000000000002']);
assert.equal((await read()).uid,'10000000-0000-0000-0000-000000000002');
await db.query("SELECT set_config('request.jwt.claim.sub','',false)");assert.equal((await read()).uid,claims.sub);
await db.query("SELECT set_config('request.jwt.claim.sub','invalid-uuid',false)");
await assert.rejects(db.query('SELECT auth.uid()'),e=>e.code==='22P02');
await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
await db.exec("INSERT INTO auth.users(id,email,email_confirmed_at,phone_confirmed_at) VALUES('10000000-0000-0000-0000-000000000001','synthetic@example.invalid','2026-01-02','2026-01-01')");
assert.deepEqual((await db.query('SELECT confirmed_at::date::text AS confirmed,is_sso_user,is_anonymous FROM auth.users')).rows,[{confirmed:'2026-01-01',is_sso_user:false,is_anonymous:false}]);
assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='auth.users'::regclass")).rows[0].relrowsecurity,true);
assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
 LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='auth' AND a.grantee=0`)).rows[0].n,0);
// Existing Auth must fail before any routine or table can be replaced.
await db.exec('BEGIN;');await assert.rejects(db.exec(plan.statements[0]),e=>e.code==='42P06');await db.exec('ROLLBACK;');
assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.users')).rows[0].n,1);
assert.throws(()=>compileLocalAuthInterface({...record,payload_text:record.payload_text+' '}),/Unreviewed or damaged/);
assert.equal(plan.nativeAuthService,false);assert.equal(plan.runtimeTestsAllowed,false);assert.equal(plan.quoteReady,false);
console.log('Local Auth interface passed: captured native routine/table definitions, claim fallback/invalid UUID behavior, generated/default columns, RLS/privilege quarantine, existing-Auth refusal and integrity pin. No JWT verification, login/session or native Auth service is claimed.');
}finally{await db.close();}
