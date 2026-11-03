import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const recorded=JSON.parse(fs.readFileSync('tests/techsafe/fixtures/recorded-initial-migration.json','utf8'));
const source=fs.readFileSync('supabase/migrations/20251104191142_create_customer_pipeline.sql','utf8');
const diagnostic=fs.readFileSync('scripts/techsafe/replay-preflight.sql','utf8');
assert.equal(recorded.version,'20251104191142');
assert.equal(recorded.recordedStatement.includes('\n'),false);
assert.equal(recorded.recordedStatement.split('\\n').length-1,39);
assert.equal(source.includes('\n'),true);
assert.doesNotMatch(diagnostic.replace(/--[^\n]*/g,''),/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|CALL|DO)\b/i);
const db=new PGlite();
try{
await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
await assert.rejects(db.exec(recorded.recordedStatement),e=>e.code==='42601');
assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")).rows[0].n,0);
await db.exec(source);
assert.equal((await db.query('SELECT count(*)::int AS n FROM pipeline_stages')).rows[0].n,6);
assert.equal((await db.query('SELECT count(*)::int AS n FROM customers')).rows[0].n,0);
// All fixtures/SQL execution above are local; no Supabase project is targeted.
await db.exec('CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);');
await db.query('INSERT INTO supabase_migrations.schema_migrations VALUES($1,$2,$3)',[recorded.version,'recorded_legacy',[recorded.recordedStatement]]);
await db.query('INSERT INTO supabase_migrations.schema_migrations VALUES($1,$2,$3)',['20251104191442','normal_formatting',[source]]);
await db.query('INSERT INTO supabase_migrations.schema_migrations VALUES($1,$2,$3)',['20251104191442_legacy',null,null]);
const validLiteral="SELECT E'\\n' AS line_break;";
await db.exec(validLiteral);
await db.query('INSERT INTO supabase_migrations.schema_migrations VALUES($1,$2,$3)',['20251104191443','valid_literal_escape',[validLiteral]]);
const rows=(await db.query(diagnostic)).rows;
assert.equal(rows[0].formatting_requires_review,true);assert.equal(rows[0].actual_newlines,0);assert.equal(rows[0].literal_backslash_n,39);
assert.equal(rows[1].formatting_requires_review,false);
assert.equal(rows[2].missing_statements,true);assert.equal(rows[2].non_timestamp_version,true);
assert.equal(rows[3].literal_backslash_n,1);assert.equal(rows[3].formatting_requires_review,false,'valid string escapes must not trigger blanket decoding');
// A review flag can be a false positive: formatting alone is not a SQL parser.
const validComment='/*\\n harmless comment */ SELECT 1;';await db.exec(validComment);
await db.query('INSERT INTO supabase_migrations.schema_migrations VALUES($1,$2,$3)',['20251104191444','valid_comment_escape',[validComment]]);
assert.equal((await db.query(diagnostic)).rows.at(-1).formatting_requires_review,true);
console.log('Migration replay diagnostic passed: recorded initial statement reproduces 42601; repository migration succeeds; missing/nonstandard history is reported; valid string escapes are preserved and review flags are not repair instructions.');
}finally{await db.close();}
