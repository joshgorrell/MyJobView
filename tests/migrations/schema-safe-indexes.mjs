import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const sql = await readFile(new URL('../../supabase/migrations/20251113201748_fix_security_part1_add_indexes.sql', import.meta.url), 'utf8');
for (const schema of ['public', 'jobs']) {
  const db = new PGlite();
  if (schema === 'jobs') await db.exec('CREATE SCHEMA jobs');
  await db.exec(`CREATE TABLE ${schema}.appointments(created_by uuid); CREATE TABLE public.leads(created_by uuid); CREATE TABLE public.customers(id uuid);`);
  await db.exec(sql);
  await db.exec(sql);
  const { rows } = await db.query("SELECT schemaname, tablename, indexname FROM pg_indexes WHERE indexname IN ('idx_appointments_created_by', 'idx_leads_created_by') ORDER BY indexname");
  assert.deepEqual(rows, [
    { schemaname: schema, tablename: 'appointments', indexname: 'idx_appointments_created_by' },
    { schemaname: 'public', tablename: 'leads', indexname: 'idx_leads_created_by' },
  ]);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_indexes WHERE indexname = 'idx_customers_stage_id'")).rows[0].count, 0);
  await db.close();
}
const db = new PGlite();
await db.exec(sql); // No optional tables or legacy schema.
await db.exec('CREATE SCHEMA jobs; CREATE TABLE jobs.appointments(created_by uuid); CREATE TABLE public.appointments(created_by uuid)');
await db.exec(sql);
assert.equal((await db.query("SELECT schemaname FROM pg_indexes WHERE indexname = 'idx_appointments_created_by'")).rows[0].schemaname, 'jobs');
await db.close();
console.log('Schema-safe index migration passed: legacy, public-only, missing targets, repeat execution, schema precedence.');
