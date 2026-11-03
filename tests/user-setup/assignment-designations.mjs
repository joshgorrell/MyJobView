import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid, role text, is_active boolean, full_name text, is_sales_rep boolean NOT NULL DEFAULT false);
INSERT INTO profiles VALUES
('${id(1)}','${id(10)}','admin',true,'Josh',false),
('${id(2)}','${id(10)}','service_manager',true,'Bobbi',true),
('${id(3)}','${id(10)}','tech',true,'Tech',false),
('${id(4)}','${id(10)}','tech',false,'Inactive tech',false),
('${id(5)}','${id(20)}','admin',true,'Other company admin',false),
('${id(6)}','${id(10)}','admin',false,'Inactive admin',false);
GRANT SELECT, UPDATE, INSERT ON profiles TO authenticated;`);
await db.exec(await readFile('supabase/migrations/20261008180644_staff_assignment_designations.sql','utf8'));
assert.deepEqual((await db.query(`SELECT full_name FROM profiles WHERE is_technician AND is_active ORDER BY full_name`)).rows.map(r=>r.full_name),['Tech']);
assert.deepEqual((await db.query(`SELECT full_name FROM profiles WHERE is_sales_rep AND is_active ORDER BY full_name`)).rows.map(r=>r.full_name),['Bobbi']);
async function as(n,sql){await db.exec(`RESET ROLE;SELECT set_config('test.uid','${id(n)}',false);SET ROLE authenticated`);return db.query(sql)}
await as(1,`UPDATE profiles SET is_technician=true WHERE id='${id(2)}'`);
await as(1,`UPDATE profiles SET is_sales_rep=true WHERE id='${id(3)}'`);
assert.equal((await as(1,`SELECT role FROM profiles WHERE id='${id(2)}'`)).rows[0].role,'service_manager');
for(const n of [2,3,5,6]) await assert.rejects(()=>as(n,`UPDATE profiles SET is_technician=false WHERE id='${id(3)}'`));
await assert.rejects(()=>as(1,`UPDATE profiles SET is_sales_rep=true WHERE id='${id(5)}'`));
await as(3,`UPDATE profiles SET full_name='Changed name' WHERE id='${id(3)}'`);
await as(1,`UPDATE profiles SET is_technician=false WHERE id='${id(2)}'`);
assert.deepEqual((await as(1,`SELECT full_name FROM profiles WHERE is_technician AND is_active`)).rows.map(r=>r.full_name),['Changed name']);
await db.close();console.log('Assignment designation backfill, independent flags, inactive filtering and admin/tenant controls passed.');
