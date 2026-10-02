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
await db.exec(`ALTER TABLE profiles ADD full_name text,ADD email text,ADD home_latitude numeric,ADD home_longitude numeric,ADD home_address text;
ALTER TABLE daily_clock_entries ADD clock_in_latitude numeric,ADD clock_in_longitude numeric,ADD clock_out_latitude numeric,ADD clock_out_longitude numeric,ADD clocked_in_from_home boolean DEFAULT false,ADD clocked_out_from_home boolean DEFAULT false;
CREATE TABLE company_settings(organization_id uuid,time_request_approver_ids uuid[],home_clock_notification_enabled boolean,home_location_radius_meters int,home_clock_notification_roles text[]);
CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid NOT NULL DEFAULT get_user_org_id(),type text,title text,body text,related_id uuid,is_read boolean);
CREATE FUNCTION calculate_distance_meters(numeric,numeric,numeric,numeric) RETURNS int LANGUAGE sql AS $$SELECT CASE WHEN $1=$3 AND $2=$4 THEN 0 ELSE 10000 END$$;
INSERT INTO company_settings VALUES('${id(2)}',ARRAY['${id(13)}']::uuid[],true,150,ARRAY['admin']),('${id(1)}',ARRAY['${id(12)}','${id(13)}']::uuid[],true,150,ARRAY['admin']);
UPDATE profiles SET full_name='Technician',home_latitude=39,home_longitude=-95 WHERE id='${id(14)}';
GRANT SELECT ON notifications TO authenticated;`);
// Existing travel requests use office/Work Order coordinates, independent of watches.
const travelSchema=await readFile('supabase/migrations/20251117163803_create_gps_breadcrumbs_and_travel_bonus.sql','utf8');
await db.exec(`ALTER TABLE profiles ADD travel_bonus_enabled boolean DEFAULT false,ADD travel_bonus_rate numeric,ADD travel_bonus_method text,ADD primary_office_id uuid;
ALTER TABLE work_orders ADD latitude numeric,ADD longitude numeric,ADD address text,ADD office_id uuid;
CREATE TABLE company_offices(id uuid PRIMARY KEY,latitude numeric,longitude numeric,office_name text,city text,state text);`);
for(const name of ['office_travel_settings','travel_bonus_requests']) {
  await db.exec(travelSchema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n\\);`))[0]);
}
await db.exec(`ALTER TABLE office_travel_settings ADD same_day_job_window_hours numeric DEFAULT 4;
ALTER TABLE travel_bonus_requests ADD from_type text,ADD from_address text,ADD from_latitude numeric,ADD from_longitude numeric;
CREATE UNIQUE INDEX integration_one_travel_request ON travel_bonus_requests(technician_id,work_order_id);
INSERT INTO company_offices VALUES('${id(110)}',39,-95,'Main Office','Topeka','KS');
INSERT INTO office_travel_settings(office_id,radius_miles,calculation_method) VALUES('${id(110)}',15,'round_trip');
UPDATE profiles SET primary_office_id='${id(110)}',travel_bonus_enabled=true WHERE id='${id(10)}';
UPDATE work_orders SET office_id='${id(110)}',latitude=40,longitude=-95,address='Job Site' WHERE id='${id(50)}';
GRANT SELECT ON travel_bonus_requests TO authenticated;`);
await db.exec(await readFile('tests/employee-time/existing-travel.sql','utf8'));
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
// Delayed GPS triggers home-clock evidence once, without modifying clock timestamps.
await as(14);await db.exec(`UPDATE daily_clock_entries SET clock_in_latitude=39,clock_in_longitude=-95 WHERE id='${id(85)}';UPDATE daily_clock_entries SET clock_out_latitude=39,clock_out_longitude=-95 WHERE id='${id(85)}';UPDATE daily_clock_entries SET clock_out_latitude=39,clock_out_longitude=-95 WHERE id='${id(85)}';`);
assert.equal((await db.query(`SELECT count(*)::int n FROM notifications WHERE related_id='${id(85)}' AND type='home_clock'`)).rows[0].n,2,'Exactly one home alert per clock action');
await db.exec(`INSERT INTO internal_time_sessions(id,assigned_to,requested_by,created_by,session_type,title,session_date,predetermined_hours,status) VALUES('${id(88)}','${id(14)}','${id(14)}','${id(14)}','training','Training','2026-09-07',2,'pending_approval')`);
const submitted=(await db.query(`SELECT user_id,organization_id FROM notifications WHERE related_id='${id(88)}'`)).rows;assert.equal(submitted.length,1);assert.equal(submitted[0].user_id,id(12));assert.equal(submitted[0].organization_id,id(1));
await as(12);await db.exec(`SELECT review_internal_time('${id(88)}','approve');SELECT review_internal_time('${id(88)}','approve')`);
const approval=(await db.query(`SELECT body FROM notifications WHERE related_id='${id(88)}' AND type='internal_time_request_approved'`)).rows;assert.equal(approval.length,1);assert.match(approval[0].body,/scheduled/);assert.equal(approval[0].body.includes('added to your payroll'),false);
await db.exec(`SELECT review_internal_time('${id(88)}','complete');SELECT review_internal_time('${id(88)}','approve_time');`);
assert.equal((await db.query(`SELECT count(*)::int n FROM notifications WHERE related_id='${id(88)}' AND type='internal_time_request_approved'`)).rows[0].n,1,'Completion and payroll review do not duplicate request approval alerts');
await as(14);await db.exec(`INSERT INTO internal_time_sessions(id,assigned_to,requested_by,created_by,session_type,title,session_date,predetermined_hours,status) VALUES('${id(89)}','${id(14)}','${id(14)}','${id(14)}','training','Training','2026-09-08',2,'pending_approval')`);
await as(12);await db.exec(`SELECT review_internal_time('${id(89)}','deny','Schedule conflict');SELECT review_internal_time('${id(89)}','deny','Schedule conflict');`);
const denial=(await db.query(`SELECT body FROM notifications WHERE related_id='${id(89)}' AND type='internal_time_request_denied'`)).rows;assert.equal(denial.length,1);assert.match(denial[0].body,/Schedule conflict/);
await as(10);const travelEntry=(await db.query(`SELECT start_work_order_time('${id(50)}') id`)).rows[0].id;
assert.equal((await db.query(`SELECT start_work_order_time('${id(50)}') id`)).rows[0].id,travelEntry);
const bonuses=(await db.query(`SELECT * FROM travel_bonus_requests WHERE technician_id='${id(10)}' AND work_order_id='${id(50)}'`)).rows;
assert.equal(bonuses.length,1);assert.equal(bonuses[0].status,'pending');assert.equal(bonuses[0].daily_clock_entry_id,null,'Job Time travel does not require a Daily Clock');assert.equal(bonuses[0].from_type,'office');assert.ok(Number(bonuses[0].eligible_miles)>0);
await db.exec(`UPDATE time_entries SET clock_out=clock_in+interval '30 minutes',status='submitted' WHERE id='${travelEntry}'`);
assert.equal((await db.query(`SELECT count(*)::int n FROM travel_bonus_requests WHERE work_order_id='${id(50)}'`)).rows[0].n,1,'Stopping time does not duplicate its travel request');
await as(12);
// SECURITY DEFINER setup RPCs must not bypass inactive-actor config authority.
await db.exec(`UPDATE profiles SET is_active=false WHERE id='${id(12)}'`);
await assert.rejects(()=>db.query(`SELECT update_employee_and_config(p_user_id=>'${id(14)}',p_hire_date=>'2026-01-01',p_expected_weekly_hours=>41,p_reviewed_by=>'${id(12)}')`),/authorized manager/);
assert.equal((await db.query(`SELECT count(*)::int n FROM employee_payroll_configs c JOIN employees e ON e.id=c.employee_id WHERE e.user_id='${id(14)}'`)).rows[0].n,2,'Rejected inactive-actor update preserves both historical configs');
await db.close();console.log('Existing trigger/RPC integration: classification, effective-dated successor config, direct-write guards, WO scheduling/project inheritance, Daily Clock calculations, payroll status locks, tenant-scoped request outcomes, delayed GPS home alerts, and idempotent travel requests without Daily Clock passed.');
