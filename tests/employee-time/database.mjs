import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`
CREATE ROLE authenticated;CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE organizations(id uuid PRIMARY KEY,timezone text);
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,role text,employment_type text,requires_daily_clock boolean DEFAULT false,is_active boolean DEFAULT true);
CREATE FUNCTION get_user_org_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT organization_id FROM profiles WHERE id=auth.uid() $$;
CREATE TABLE employees(id uuid PRIMARY KEY,organization_id uuid,user_id uuid);
CREATE TABLE employee_payroll_configs(id uuid PRIMARY KEY,employee_id uuid,organization_id uuid,effective_from date,effective_to date,payroll_time_basis text,pay_schedule_id uuid,requires_daily_clock boolean);
CREATE TABLE daily_clock_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),technician_id uuid,entry_date date);
CREATE TABLE pay_periods(id uuid PRIMARY KEY,organization_id uuid,period_start_date date,period_end_date date,status text,pay_schedule_id uuid);
CREATE TABLE projects(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE labor_phases(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE work_orders(id uuid PRIMARY KEY,organization_id uuid,assigned_to uuid,status text,labor_phase_id uuid);
CREATE TABLE internal_time_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL DEFAULT get_user_org_id(),session_type text,title text,description text,request_reason text,denial_reason text,start_time time,session_date date,assigned_to uuid,created_by uuid,requested_by uuid,status text DEFAULT 'scheduled',predetermined_hours numeric,approved_by uuid,approved_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE appointments(id uuid PRIMARY KEY,company_id uuid,organization_id uuid,project_id uuid,contact_id uuid,title text,description text,appointment_date date,start_time time,end_time time,status text,assigned_technician uuid,location text,notes text,created_by uuid,created_at timestamptz,updated_at timestamptz,appointment_type text,is_private boolean,all_day boolean,is_blocked boolean);
CREATE TABLE time_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL DEFAULT get_user_org_id(),organization_id uuid NOT NULL DEFAULT get_user_org_id(),technician_id uuid,work_order_id uuid,project_id uuid,internal_session_id uuid,entry_type text DEFAULT 'work_order',entry_date date,clock_in timestamptz,clock_out timestamptz,total_hours numeric DEFAULT 0,break_minutes int DEFAULT 0,labor_phase_id uuid,notes text,status text DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),approved_by uuid,approved_at timestamptz);
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY time_entries_insert_same_org ON time_entries FOR INSERT TO authenticated WITH CHECK(organization_id=get_user_org_id());
CREATE POLICY time_entries_select_same_org ON time_entries FOR SELECT TO authenticated USING(organization_id=get_user_org_id());
CREATE POLICY time_entries_update_same_org ON time_entries FOR UPDATE TO authenticated USING(organization_id=get_user_org_id()) WITH CHECK(organization_id=get_user_org_id());
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_employees ON employees FOR SELECT TO authenticated USING(organization_id=get_user_org_id());
CREATE POLICY update_employees ON employees FOR UPDATE TO authenticated USING(organization_id=get_user_org_id()) WITH CHECK(organization_id=get_user_org_id());
ALTER TABLE employee_payroll_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_employee_payroll_configs ON employee_payroll_configs FOR SELECT TO authenticated USING(organization_id=get_user_org_id());
CREATE POLICY update_employee_payroll_configs ON employee_payroll_configs FOR UPDATE TO authenticated USING(organization_id=get_user_org_id()) WITH CHECK(organization_id=get_user_org_id());
INSERT INTO organizations VALUES('${id(1)}','America/Chicago'),('${id(2)}','America/Los_Angeles');
INSERT INTO profiles(id,organization_id,role,employment_type) VALUES('${id(10)}','${id(1)}','tech','hourly'),('${id(11)}','${id(1)}','tech','job_time'),('${id(12)}','${id(1)}','admin','hourly'),('${id(13)}','${id(2)}','admin','hourly'),('${id(14)}','${id(1)}','tech','hourly');
INSERT INTO employees VALUES('${id(20)}','${id(1)}','${id(10)}'),('${id(21)}','${id(1)}','${id(11)}');
INSERT INTO employee_payroll_configs VALUES('${id(30)}','${id(20)}','${id(1)}','2020-01-01',null,'work_allocation',null,true),('${id(31)}','${id(21)}','${id(1)}','2020-01-01',null,'daily_clock',null,true);
INSERT INTO projects VALUES('${id(40)}','${id(1)}'),('${id(41)}','${id(2)}');
INSERT INTO labor_phases VALUES('${id(45)}','${id(1)}');
INSERT INTO work_orders VALUES('${id(50)}','${id(1)}','${id(10)}','assigned','${id(45)}'),('${id(51)}','${id(1)}','${id(14)}','assigned','${id(45)}'),('${id(52)}','${id(1)}',null,'assigned','${id(45)}');
`);
await db.exec(await readFile('supabase/migrations/20261002110037_enforce_employee_time_authority.sql','utf8'));
async function as(n){await db.exec(`RESET ROLE;SELECT set_config('test.uid','${n?id(n):''}',false);SET ROLE authenticated;`);}
const entry=(extra='')=>`INSERT INTO time_entries(technician_id,entry_type,project_id,entry_date,clock_in${extra?','+extra.split('=')[0]:''}) VALUES('${id(10)}','project','${id(40)}','2026-09-01','2026-09-01T13:00Z'${extra?','+extra.split('=')[1]:''})`;
await as(10);
await assert.rejects(()=>db.exec(`UPDATE profiles SET role='admin' WHERE id='${id(10)}'`),/authorized manager/);
await assert.rejects(()=>db.exec(`UPDATE profiles SET employment_type='hourly' WHERE id='${id(11)}'`),/authorized manager/);
await assert.rejects(()=>db.exec(`INSERT INTO daily_clock_entries(technician_id,entry_date) VALUES('${id(10)}','2026-09-01')`),/do not use/);
await as(14);await assert.rejects(()=>db.exec(`INSERT INTO daily_clock_entries(technician_id,entry_date) VALUES('${id(14)}','2026-09-01')`),/not enabled/);
await as(11);await db.exec(`INSERT INTO daily_clock_entries(technician_id,entry_date) VALUES('${id(11)}','2026-09-01')`);
await as(10);
// Effective configuration wins over conflicting legacy profile employment_type.
await assert.rejects(()=>db.exec(entry()),/Request manual/);
await assert.rejects(()=>db.exec(entry("status='approved'")),/Manager approval/);
await assert.rejects(()=>db.exec(`INSERT INTO time_entries(technician_id,work_order_id,entry_type,entry_date,clock_in) VALUES('${id(10)}','${id(51)}','work_order','2026-09-01',now())`),/assigned Work Order/);
await assert.rejects(()=>db.exec(`INSERT INTO time_entries(technician_id,entry_type,project_id,entry_date,clock_in) VALUES('${id(14)}','project','${id(40)}','2026-09-01',now())`),/own time/);
assert.equal((await db.query(`UPDATE employee_payroll_configs SET payroll_time_basis='daily_clock' WHERE id='${id(30)}' RETURNING id`)).rows.length,0);
assert.equal((await db.query(`UPDATE employees SET user_id='${id(14)}' WHERE id='${id(20)}' RETURNING id`)).rows.length,0);
const request=`INSERT INTO manual_job_time_requests(id,technician_id,project_id,entry_date,clock_in,clock_out,reason) VALUES('${id(60)}','${id(10)}','${id(40)}','2026-09-01','2026-09-01T13:00Z','2026-09-01T15:00Z','Programming after the work order closed')`;
await db.exec(request);
await assert.rejects(()=>db.exec(`UPDATE manual_job_time_requests SET status='approved' WHERE id='${id(60)}'`),/permission denied/);
await assert.rejects(()=>db.exec(`SELECT review_manual_job_time_request('${id(60)}','approve')`),/review permission/);
await assert.rejects(()=>db.exec(`INSERT INTO manual_job_time_requests(technician_id,project_id,entry_date,clock_in,clock_out,reason) VALUES('${id(10)}','${id(41)}','2026-09-01','2026-09-01T13:00Z','2026-09-01T15:00Z','wrong tenant')`),/different organization/);
await assert.rejects(()=>db.exec(`INSERT INTO manual_job_time_requests(technician_id,project_id,entry_date,clock_in,clock_out,reason) VALUES('${id(10)}','${id(40)}','2026-09-02','2026-09-02T01:00Z','2026-09-02T02:00Z','wrong local date')`),/organization timezone/);
await as(13);await assert.rejects(()=>db.exec(`SELECT review_manual_job_time_request('${id(60)}','approve')`),/review permission/);
await as(12);
await db.exec(`INSERT INTO pay_periods VALUES('${id(90)}','${id(1)}','2026-09-01','2026-09-15','locked',null)`);
await assert.rejects(()=>db.exec(`SELECT review_manual_job_time_request('${id(60)}','approve')`),/Reopen the payroll/);
assert.equal((await db.query(`SELECT status FROM manual_job_time_requests WHERE id='${id(60)}'`)).rows[0].status,'pending');
await db.exec(`UPDATE pay_periods SET status='open',pay_schedule_id='${id(91)}' WHERE id='${id(90)}'`);
// An unrelated payroll schedule must not block this employee's approval.
await db.exec(`UPDATE pay_periods SET status='locked' WHERE id='${id(90)}'`);
const approved=(await db.query(`SELECT review_manual_job_time_request('${id(60)}','approve') AS id`)).rows[0].id;
assert.equal((await db.query(`SELECT review_manual_job_time_request('${id(60)}','approve') AS id`)).rows[0].id,approved);
assert.equal(Number((await db.query(`SELECT total_hours,status FROM time_entries WHERE id='${approved}'`)).rows[0].total_hours),2);
assert.equal((await db.query(`SELECT count(*)::int n FROM time_entries WHERE project_id='${id(40)}'`)).rows[0].n,1);
await as(10);await assert.rejects(()=>db.exec(`UPDATE time_entries SET total_hours=50 WHERE id='${approved}'`),/correction workflow/);
// Salary/hourly allocation is separate; non-manager may not directly approve it.
await as(14);await db.exec(`INSERT INTO time_entries(technician_id,entry_type,project_id,entry_date,clock_in,status) VALUES('${id(14)}','project','${id(40)}','2026-09-01',now(),'submitted')`);
// Pending internal time cannot become scheduled or payable by self-service.
await as(10);await db.exec(`INSERT INTO internal_time_sessions(id,assigned_to,requested_by,created_by,session_type,title,session_date,predetermined_hours,status) VALUES('${id(70)}','${id(10)}','${id(10)}','${id(10)}','shop_time','Shop','2026-09-01',1,'pending_approval')`);
await assert.rejects(()=>db.exec(`UPDATE internal_time_sessions SET status='scheduled' WHERE id='${id(70)}'`),/manager approval/);
await as(12);await db.exec(`UPDATE internal_time_sessions SET status='scheduled' WHERE id='${id(70)}'`);
await as(10);await db.exec(`INSERT INTO time_entries(id,technician_id,internal_session_id,entry_type,entry_date,clock_in,status) VALUES('${id(71)}','${id(10)}','${id(70)}','shop_time','2026-09-01',now(),'draft')`);
await assert.rejects(()=>db.exec(`INSERT INTO time_entries(technician_id,internal_session_id,entry_type,entry_date,clock_in) VALUES('${id(10)}','${id(70)}','shop_time','2026-09-01',now())`),/already been recorded/);
await db.exec(`UPDATE time_entries SET clock_out=clock_in + interval '1 hour',status='submitted' WHERE id='${id(71)}'`);
assert.equal(Number((await db.query(`SELECT total_hours FROM time_entries WHERE id='${id(71)}'`)).rows[0].total_hours),1);
await as(12);await db.exec(`UPDATE time_entries SET clock_out=now(),status='submitted',total_hours=1 WHERE id='${id(71)}'`);
// Canonical timer: repeated Start calls return the same running entry; another activity blocks start.
await as(10);const started=(await db.query(`SELECT start_work_order_time('${id(50)}') id`)).rows[0].id;
assert.equal((await db.query(`SELECT start_work_order_time('${id(50)}') id`)).rows[0].id,started);
await assert.rejects(()=>db.exec(`SELECT start_work_order_time('${id(51)}')`),/assigned Work Order/);
await assert.rejects(()=>db.exec(`SELECT start_work_order_time('${id(52)}')`),/assigned Work Order/);
await as(null);await assert.rejects(()=>db.exec(`SELECT start_work_order_time('${id(50)}')`),/Authentication/);
await as(10);
await assert.rejects(()=>db.exec(`SELECT * FROM get_appointments_with_privacy('${id(12)}','${id(1)}')`),/calendar owner/);
await assert.rejects(()=>db.exec(`SELECT * FROM get_appointments_with_privacy('${id(10)}','${id(2)}')`),/organization mismatch/);
await db.exec(`RESET ROLE;INSERT INTO appointments(id,organization_id,company_id,title,appointment_date,assigned_technician,created_by,is_private,all_day) VALUES('${id(80)}','${id(1)}','${id(1)}','Private meeting','2026-09-01','${id(12)}','${id(12)}',true,false),('${id(81)}','${id(2)}','${id(2)}','Other tenant','2026-09-01','${id(13)}','${id(13)}',false,false);SET ROLE authenticated;`);
const cal=(await db.query(`SELECT * FROM get_appointments_with_privacy('${id(10)}','${id(1)}')`)).rows;
assert.equal(cal.length,1);assert.equal(cal[0].title,'Busy');assert.equal(cal[0].can_view_details,false);
await as(null);await assert.rejects(()=>db.exec(`SELECT * FROM get_appointments_with_privacy('${id(10)}','${id(1)}')`),/calendar owner/);
// Reassignment must not strand the former assignee's running time.
await as(12);await db.exec(`UPDATE work_orders SET assigned_to='${id(14)}' WHERE id='${id(50)}'`);
await as(10);await db.exec(`UPDATE time_entries SET clock_out=clock_in+interval '1 minute',status='submitted' WHERE id='${started}'`);
await assert.rejects(()=>db.exec(`SELECT start_work_order_time('${id(50)}')`),/assigned Work Order/);
// Edited approval retains the request and atomically records only reviewed hours.
await as(10);
await db.exec(`INSERT INTO manual_job_time_requests(id,technician_id,project_id,entry_date,clock_in,clock_out,reason)
 VALUES('${id(61)}','${id(10)}','${id(40)}','2026-09-02','2026-09-02T13:00Z','2026-09-02T15:00Z','Additional project work')`);
await as(12);
await assert.rejects(()=>db.exec(`SELECT review_manual_job_time_request('${id(61)}','approve',null,null,'2026-09-02T16:00Z',30)`),/Explain changes/);
const edited=(await db.query(`SELECT review_manual_job_time_request('${id(61)}','approve','Removed unpaid lunch',null,'2026-09-02T16:00Z',30) id`)).rows[0].id;
const audit=(await db.query(`SELECT clock_out,review_adjustments FROM manual_job_time_requests WHERE id='${id(61)}'`)).rows[0];
assert.equal(new Date(audit.clock_out).toISOString(),'2026-09-02T15:00:00.000Z');
assert.equal(audit.review_adjustments.break_minutes,30);
assert.equal(Number((await db.query(`SELECT total_hours FROM time_entries WHERE id='${edited}'`)).rows[0].total_hours),2.5);
// Request approval schedules work without manufacturing an entry; completion and pay review are separate.
await as(10);
await db.exec(`INSERT INTO internal_time_sessions(id,assigned_to,requested_by,created_by,session_type,title,session_date,predetermined_hours,status)
 VALUES('${id(72)}','${id(10)}','${id(10)}','${id(10)}','training','Training','2026-09-02',2,'pending_approval'),
 ('${id(73)}','${id(10)}','${id(10)}','${id(10)}','training','Future','2099-01-01',2,'pending_approval')`);
await assert.rejects(()=>db.exec(`SELECT review_internal_time('${id(72)}','approve')`),/review permission/);
await as(13);await assert.rejects(()=>db.exec(`SELECT review_internal_time('${id(72)}','approve')`),/review permission/);
await as(12);
await db.exec(`SELECT review_internal_time('${id(72)}','approve');SELECT review_internal_time('${id(72)}','approve');SELECT review_internal_time('${id(73)}','approve');`);
assert.equal((await db.query(`SELECT count(*)::int n FROM time_entries WHERE internal_session_id='${id(72)}'`)).rows[0].n,0);
await assert.rejects(()=>db.exec(`SELECT review_internal_time('${id(73)}','complete')`),/after the scheduled work/);
// Simulate the second write failing. The entry insert must roll back with it.
await db.exec(`RESET ROLE;CREATE FUNCTION fail_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test completion failure'; END $$;
CREATE TRIGGER test_fail_completion BEFORE UPDATE ON internal_time_sessions FOR EACH ROW WHEN (NEW.status='completed' AND NEW.id='${id(72)}') EXECUTE FUNCTION fail_completion();SET ROLE authenticated;`);
await assert.rejects(()=>db.exec(`SELECT review_internal_time('${id(72)}','complete')`),/test completion failure/);
assert.equal((await db.query(`SELECT count(*)::int n FROM time_entries WHERE internal_session_id='${id(72)}'`)).rows[0].n,0);
assert.equal((await db.query(`SELECT status FROM internal_time_sessions WHERE id='${id(72)}'`)).rows[0].status,'scheduled');
await db.exec(`RESET ROLE;DROP TRIGGER test_fail_completion ON internal_time_sessions;SET ROLE authenticated;`);
const completed=(await db.query(`SELECT review_internal_time('${id(72)}','complete') id`)).rows[0].id;
assert.equal((await db.query(`SELECT review_internal_time('${id(72)}','complete') id`)).rows[0].id,completed);
assert.equal((await db.query(`SELECT status FROM time_entries WHERE id='${completed}'`)).rows[0].status,'submitted');
await db.exec(`UPDATE pay_periods SET pay_schedule_id=null WHERE id='${id(90)}'`);
await assert.rejects(()=>db.exec(`SELECT review_internal_time('${id(72)}','approve_time')`),/Reopen the payroll/);
await db.exec(`UPDATE pay_periods SET status='open' WHERE id='${id(90)}'`);
await db.exec(`SELECT review_internal_time('${id(72)}','approve_time');SELECT review_internal_time('${id(72)}','approve_time');`);
assert.equal((await db.query(`SELECT status FROM time_entries WHERE id='${completed}'`)).rows[0].status,'approved');
assert.equal((await db.query(`SELECT count(*)::int n FROM time_entries WHERE internal_session_id='${id(72)}'`)).rows[0].n,1);
// A disabled manager cannot approve with a still-valid access token or reactivate themselves.
await as(12);await db.exec(`UPDATE profiles SET is_active=false WHERE id='${id(12)}'`);
await assert.rejects(()=>db.exec(`SELECT review_manual_job_time_request('${id(60)}','approve')`),/review permission/);
await assert.rejects(()=>db.exec(`SELECT review_internal_time('${id(72)}','approve_time')`),/review permission/);
await assert.rejects(()=>db.exec(`UPDATE profiles SET is_active=true WHERE id='${id(12)}'`),/authorized manager/);
await db.close();console.log('Time authority: effective classification, tenant isolation, approval bypasses, immutable review, repeat approval, internal permission, canonical WO start, edited approval audit, atomic completion rollback and repeat review passed.');
