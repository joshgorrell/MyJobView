import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
// Reuse the authority fixture, then expand actual employee/config tables and attach
// read-only snapshots of existing database rules. This remains a local subset.
const base=await readFile('tests/employee-time/database.mjs','utf8');
let schema=base.match(/await db\.exec\(`([\s\S]*?)`\);/)[1].replace(/\$\{id\((\d+)\)\}/g,(_,n)=>id(Number(n)));
const payrollSchema=await readFile('supabase/migrations/20260910152451_create_pay_schedules_employees_payroll_configs.sql','utf8');
const table=name=>payrollSchema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n\\);`))[0];
schema=schema.replace(/CREATE TABLE employees\([^;]+;/,table('pay_schedules')+'\n'+table('employees'));
schema=schema.replace(/CREATE TABLE employee_payroll_configs\([^;]+;/,table('employee_payroll_configs'));
schema=schema.replace('INSERT INTO employees VALUES','INSERT INTO employees(id,organization_id,user_id,hire_date) VALUES').replace(`'${id(10)}'),('${id(21)}'`,`'${id(10)}','2020-01-01'),('${id(21)}'`).replace(`'${id(11)}');\nINSERT INTO employee_payroll_configs`, `'${id(11)}','2020-01-01');\nINSERT INTO employee_payroll_configs`);
schema=schema.replace('INSERT INTO employee_payroll_configs VALUES','INSERT INTO employee_payroll_configs(id,employee_id,organization_id,effective_from,effective_to,payroll_time_basis,pay_schedule_id,requires_daily_clock) VALUES');
schema=schema.replace(/INSERT INTO employee_payroll_configs[^;]+;/,`INSERT INTO employee_payroll_configs(id,employee_id,organization_id,effective_from,payroll_time_basis,requires_daily_clock,compensation_type,requires_time_allocation) VALUES('${id(30)}','${id(20)}','${id(1)}','2020-01-01','work_allocation',true,'hourly',true),('${id(31)}','${id(21)}','${id(1)}','2020-01-01','daily_clock',true,'hourly',false);`);
await db.exec(schema);
await db.exec(`ALTER TABLE profiles ADD employment_classification text DEFAULT 'unreviewed',ADD employment_classification_reviewed_at timestamptz,ADD employment_classification_reviewed_by uuid;
ALTER TABLE work_orders ADD project_id uuid,ADD scheduled_date date,ADD scheduled_start_time time,ADD scheduled_end_time time;
ALTER TABLE daily_clock_entries ADD clock_in timestamptz,ADD clock_out timestamptz,ADD total_hours numeric,ADD break_minutes int DEFAULT 0,ADD status text,ADD updated_at timestamptz;
CREATE UNIQUE INDEX integration_one_open_config ON employee_payroll_configs(employee_id) WHERE effective_to IS NULL;
INSERT INTO pay_schedules(id,organization_id,name,frequency) VALUES('${id(80)}','${id(1)}','Weekly','weekly');
GRANT ALL ON pay_schedules TO authenticated;`);
await db.exec(await readFile('tests/employee-time/existing-triggers.sql','utf8'));
await db.exec(await readFile('tests/employee-time/existing-setup-rpcs.sql','utf8'));
// Existing user-setup migration is also pending on production and is a dependency.
await db.exec(await readFile('supabase/migrations/20261002013350_fix_employee_config_nullable_record_checks.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261002110037_enforce_employee_time_authority.sql','utf8'));
async function as(n){await db.exec(`RESET ROLE;SELECT set_config('test.uid','${n?id(n):''}',false);SET ROLE authenticated;`);}
await as(12);
// Canonical classification still works with the new config/identity guards.
await db.query(`SELECT classify_as_employee(p_user_id=>'${id(14)}',p_hire_date=>'2026-01-01',p_requires_daily_clock=>false,p_requires_time_allocation=>true,p_payroll_time_basis=>'work_allocation',p_pay_schedule_id=>'${id(80)}',p_reviewed_by=>'${id(12)}')`);
assert.equal((await db.query(`SELECT employment_classification FROM profiles WHERE id='${id(14)}'`)).rows[0].employment_classification,'employee');
await assert.rejects(()=>db.exec(`UPDATE employee_payroll_configs SET payroll_time_basis='salary' WHERE id='${id(30)}'`),/historically significant/);
await db.query(`SELECT update_employee_and_config(p_user_id=>'${id(14)}',p_hire_date=>'2026-01-01',p_requires_daily_clock=>true,p_payroll_time_basis=>'daily_clock',p_pay_schedule_id=>'${id(80)}',p_effective_date=>'2026-09-01',p_reviewed_by=>'${id(12)}')`);
const configs=(await db.query(`SELECT c.* FROM employee_payroll_configs c JOIN employees e ON e.id=c.employee_id WHERE e.user_id='${id(14)}' ORDER BY c.effective_from`)).rows;
assert.equal(configs.length,2);assert.equal(configs[0].payroll_time_basis,'work_allocation');assert.equal(configs[0].effective_to.toISOString().slice(0,10),'2026-08-31');assert.equal(configs[1].payroll_time_basis,'daily_clock');
await assert.rejects(()=>db.exec(`UPDATE profiles SET employment_classification='non_employee' WHERE id='${id(14)}'`),/Direct change/);
await as(14);await assert.rejects(()=>db.query(`SELECT update_employee_and_config(p_user_id=>'${id(14)}',p_hire_date=>'2026-01-01',p_reviewed_by=>'${id(14)}')`),/Unauthorized/);
// The scheduling guard permits a timer's status change but still rejects reassignment.
await as(12);await db.exec(`UPDATE work_orders SET project_id='${id(40)}' WHERE id='${id(51)}'`);
await as(14);const entry=(await db.query(`SELECT start_work_order_time('${id(51)}') id`)).rows[0].id;
assert.equal((await db.query(`SELECT project_id FROM time_entries WHERE id='${entry}'`)).rows[0].project_id,id(40));
assert.equal((await db.query(`SELECT status FROM work_orders WHERE id='${id(51)}'`)).rows[0].status,'in_progress');
await assert.rejects(()=>db.exec(`UPDATE work_orders SET assigned_to='${id(10)}' WHERE id='${id(51)}'`),/only admin, manager/);
await db.exec(`UPDATE time_entries SET clock_out=clock_in+interval '1 hour',status='submitted' WHERE id='${entry}'`);
// Daily Clock's existing duration/status calculation still runs on stop.
await db.exec(`INSERT INTO daily_clock_entries(id,technician_id,entry_date,clock_in,status) VALUES('${id(85)}','${id(14)}',current_date,now(),'clocked_in');
UPDATE daily_clock_entries SET clock_out=clock_in+interval '2 hours',break_minutes=30 WHERE id='${id(85)}';`);
const daily=(await db.query(`SELECT total_hours,status FROM daily_clock_entries WHERE id='${id(85)}'`)).rows[0];assert.equal(Number(daily.total_hours),1.5);assert.equal(daily.status,'clocked_out');
// The existing payroll guard remains authoritative for period transitions.
await as(12);await db.exec(`INSERT INTO pay_periods VALUES('${id(86)}','${id(1)}','2026-09-01','2026-09-30','open','${id(80)}')`);
await assert.rejects(()=>db.exec(`UPDATE pay_periods SET status='payroll_approved' WHERE id='${id(86)}'`),/Direct status transition/);
// Existing period transition rules and the new approval lock cooperate.
await as(14);await db.exec(`INSERT INTO manual_job_time_requests(id,technician_id,project_id,entry_date,clock_in,clock_out,reason) VALUES('${id(87)}','${id(14)}','${id(40)}','2026-09-05','2026-09-05T14:00Z','2026-09-05T16:00Z','Programming after visit')`);
await db.exec(`RESET ROLE;UPDATE pay_periods SET status='payroll_approved' WHERE id='${id(86)}'`);
await as(12);await assert.rejects(()=>db.query(`SELECT review_manual_job_time_request('${id(87)}','approve')`),/Reopen the payroll/);
assert.equal((await db.query(`SELECT status FROM manual_job_time_requests WHERE id='${id(87)}'`)).rows[0].status,'pending');
await db.exec(`RESET ROLE;UPDATE pay_periods SET status='open' WHERE id='${id(86)}'`);
await as(12);await db.query(`SELECT review_manual_job_time_request('${id(87)}','approve')`);
assert.equal((await db.query(`SELECT status FROM manual_job_time_requests WHERE id='${id(87)}'`)).rows[0].status,'approved');
// SECURITY DEFINER setup RPCs must not bypass inactive-actor config authority.
await db.exec(`UPDATE profiles SET is_active=false WHERE id='${id(12)}'`);
await assert.rejects(()=>db.query(`SELECT update_employee_and_config(p_user_id=>'${id(14)}',p_hire_date=>'2026-01-01',p_expected_weekly_hours=>41,p_reviewed_by=>'${id(12)}')`),/authorized manager/);
assert.equal((await db.query(`SELECT count(*)::int n FROM employee_payroll_configs c JOIN employees e ON e.id=c.employee_id WHERE e.user_id='${id(14)}'`)).rows[0].n,2,'Rejected inactive-actor update preserves both historical configs');
await db.close();console.log('Existing trigger/RPC integration: classification, effective-dated successor config, direct-write guards, WO scheduling/project inheritance, Daily Clock calculations and payroll status locks passed.');
