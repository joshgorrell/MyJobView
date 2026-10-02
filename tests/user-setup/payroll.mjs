import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
await db.exec(`CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE organizations(id uuid PRIMARY KEY);INSERT INTO organizations VALUES('${id(1)}'),('${id(2)}');
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),role text,employment_classification text DEFAULT 'unreviewed',employment_classification_reviewed_at timestamptz,employment_classification_reviewed_by uuid);
INSERT INTO profiles(id,organization_id,role)VALUES('${id(10)}','${id(1)}','admin'),('${id(11)}','${id(1)}','tech'),('${id(12)}','${id(1)}','sales'),('${id(20)}','${id(2)}','admin');`);
const schema = await readFile(
  'supabase/migrations/20260910152451_create_pay_schedules_employees_payroll_configs.sql',
  'utf8',
);
for (const table of ['pay_schedules', 'employees', 'employee_payroll_configs']) {
  const sql = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`))?.[0];
  assert.ok(sql);
  await db.exec(sql);
}
await db.exec(
  `CREATE UNIQUE INDEX one_open_config ON employee_payroll_configs(employee_id) WHERE effective_to IS NULL;INSERT INTO pay_schedules(id,organization_id,name,frequency)VALUES('${id(30)}','${id(1)}','Weekly','weekly');`,
);
await db.exec(await readFile('supabase/migrations/20260910155820_fix_classification_rpc_time_casts.sql', 'utf8'));
const hardened = await readFile(
  'supabase/migrations/20260910155625_harden_reopen_context_and_classification_authorization.sql',
  'utf8',
);
await db.exec(hardened.match(/CREATE OR REPLACE FUNCTION public\.classify_as_non_employee[\s\S]*?\$function\$;/)[0]);
await db.exec(`SELECT set_config('test.uid','${id(10)}',false)`);
const create = `SELECT classify_as_employee(p_user_id=>'${id(11)}',p_hire_date=>'2026-01-01',p_pay_schedule_id=>'${id(30)}',p_reviewed_by=>'${id(10)}')`;
await db.query(create);
let rows = (await db.query('SELECT * FROM employee_payroll_configs')).rows;
assert.equal(rows.length, 1);
assert.equal(rows[0].standard_start_time, '08:00:00');
assert.equal(rows[0].pay_schedule_id, id(30));
await db.query(create);
assert.equal((await db.query('SELECT * FROM employees')).rows.length, 1);
assert.equal((await db.query('SELECT * FROM employee_payroll_configs')).rows.length, 1);
await db.query(`SELECT classify_as_non_employee('${id(12)}','${id(10)}')`);
assert.equal(
  (await db.query(`SELECT employment_classification FROM profiles WHERE id='${id(12)}'`)).rows[0]
    .employment_classification,
  'non_employee',
);
await assert.rejects(() => db.query(`SELECT classify_as_non_employee('${id(11)}','${id(10)}')`));
await assert.rejects(
  () =>
    db.query(
      `SELECT update_employee_and_config(p_user_id=>'${id(11)}',p_hire_date=>'2026-01-01',p_expected_weekly_hours=>35,p_pay_schedule_id=>'${id(30)}',p_effective_date=>'2026-11-01',p_reviewed_by=>'${id(10)}')`,
    ),
  (e) => e.code === '23505',
);
await db.exec(
  await readFile('supabase/migrations/20261002013350_fix_employee_config_nullable_record_checks.sql', 'utf8'),
);
await db.query(
  `SELECT update_employee_and_config(p_user_id=>'${id(11)}',p_hire_date=>'2026-01-01',p_expected_weekly_hours=>35,p_pay_schedule_id=>'${id(30)}',p_effective_date=>'2026-11-01',p_reviewed_by=>'${id(10)}')`,
);
rows = (await db.query('SELECT * FROM employee_payroll_configs ORDER BY effective_from')).rows;
assert.equal(rows.length, 2);
assert.equal(rows[0].effective_to.toISOString().slice(0, 10), '2026-10-31');
assert.equal(rows[1].effective_from.toISOString().slice(0, 10), '2026-11-01');
assert.equal(Number(rows[0].expected_weekly_hours), 40);
assert.equal(Number(rows[1].expected_weekly_hours), 35);
await db.query(
  `SELECT update_employee_and_config(p_user_id=>'${id(11)}',p_hire_date=>'2026-01-01',p_expected_weekly_hours=>35,p_pay_schedule_id=>'${id(30)}',p_reviewed_by=>'${id(10)}')`,
);
assert.equal((await db.query('SELECT * FROM employee_payroll_configs')).rows.length, 2);
await assert.rejects(() =>
  db.query(`SELECT classify_as_employee(p_user_id=>'${id(20)}',p_hire_date=>'2026-01-01',p_reviewed_by=>'${id(10)}')`),
);
await assert.rejects(() => db.query(`SELECT classify_as_non_employee('${id(12)}','${id(20)}')`));
await db.close();
console.log(
  'Existing payroll RPCs: classification, idempotence, time casts, future effective dates, historical configuration and authorization passed.',
);
