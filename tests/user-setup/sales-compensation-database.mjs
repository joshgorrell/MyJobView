import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
await db.exec(`
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid, role text);
CREATE TABLE employees(id uuid PRIMARY KEY, organization_id uuid NOT NULL, user_id uuid);
CREATE FUNCTION get_user_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;
INSERT INTO organizations VALUES ('${id(1)}'), ('${id(2)}');
INSERT INTO profiles VALUES ('${id(10)}','${id(1)}','admin'), ('${id(11)}','${id(1)}','tech'), ('${id(20)}','${id(2)}','admin');
INSERT INTO employees VALUES ('${id(100)}','${id(1)}','${id(11)}'), ('${id(200)}','${id(2)}',NULL);
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT ON profiles, employees TO authenticated;
GRANT UPDATE ON employees TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_org_id() TO authenticated;
`);
await db.exec(await readFile('supabase/migrations/20261016120000_sales_compensation_arrangements.sql', 'utf8'));
await db.exec(await readFile('supabase/migrations/20261016121000_save_sales_compensation_atomic.sql', 'utf8'));
await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON sales_compensation_arrangements TO authenticated');
async function as(actor, sql) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid','${actor}',false); SET ROLE authenticated;`);
  return db.query(sql);
}
const save = (type, amount, freq) =>
  `SELECT save_sales_compensation_arrangement('${id(100)}','${type}',${amount},${freq === null ? 'NULL' : `'${freq}'`})`;
await as(id(10), save('base_plus_commission',50000,'weekly'));
let rows = (await as(id(10), 'SELECT * FROM sales_compensation_arrangements')).rows;
assert.equal(rows.length,1);
assert.equal(Number(rows[0].base_amount_cents),50000);
assert.equal(rows[0].base_frequency,'weekly');
await assert.rejects(() => as(id(10), save('base_plus_commission',50000,null)));
await assert.rejects(() => as(id(11), save('commission_only',0,null)));
await assert.rejects(() => as(id(20), save('commission_only',0,null)));
await as(id(10), save('commission_only',0,null));
rows = (await as(id(10), 'SELECT * FROM sales_compensation_arrangements')).rows;
assert.equal(rows.length,1);
assert.equal(rows[0].arrangement_type,'commission_only');
await as(id(10), save('none',0,null));
assert.equal((await as(id(10),'SELECT * FROM sales_compensation_arrangements')).rows.length,0);
await db.close();
console.log('Sales compensation migrations execute and atomic updates, validation and RLS checks pass.');
