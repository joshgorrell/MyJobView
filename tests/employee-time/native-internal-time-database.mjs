import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
// Reuse the existing employee-time test's two schema/identity setup blocks.
// Interpolate only its numeric fixture IDs; no source evaluation is needed.
const existing = await readFile('tests/employee-time/database.mjs', 'utf8');
const setups = [...existing.matchAll(/await db\.exec\(`([\s\S]*?)`\);/g)].slice(0, 2);
assert.equal(setups.length, 2);
for (const match of setups) await db.exec(match[1].replace(/\$\{id\((\d+)\)\}/g, (_, n) => id(Number(n))));
await db.exec(await readFile('supabase/migrations/20261002110037_enforce_employee_time_authority.sql', 'utf8'));
await db.exec(`
ALTER TABLE profiles ADD COLUMN full_name text, ADD COLUMN email text;
ALTER TABLE daily_clock_entries ADD COLUMN organization_id uuid DEFAULT get_user_org_id(),
  ADD COLUMN clock_in timestamptz, ADD COLUMN clock_out timestamptz, ADD COLUMN status text;
CREATE TABLE daily_clock_breaks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),daily_clock_entry_id uuid,break_end timestamptz);
CREATE TABLE company_settings(organization_id uuid,time_request_approver_ids uuid[]);
INSERT INTO company_settings VALUES('${id(1)}',ARRAY['${id(12)}'::uuid,'${id(13)}'::uuid,'${id(10)}'::uuid]);
ALTER TABLE notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE notifications ADD COLUMN body text,ADD COLUMN related_id uuid;
ALTER TABLE time_entries
 ADD COLUMN clock_in_gps_attempted_at timestamptz,ADD COLUMN clock_in_gps_capture_method text,
 ADD COLUMN clock_in_latitude double precision,ADD COLUMN clock_in_longitude double precision,
 ADD COLUMN clock_in_gps_accuracy double precision,ADD COLUMN clock_in_gps_captured_at timestamptz,ADD COLUMN clock_in_gps_duration_ms int,
 ADD COLUMN clock_out_gps_attempted_at timestamptz,ADD COLUMN clock_out_gps_capture_method text,
 ADD COLUMN clock_out_latitude double precision,ADD COLUMN clock_out_longitude double precision,
 ADD COLUMN clock_out_gps_accuracy double precision,ADD COLUMN clock_out_gps_captured_at timestamptz,ADD COLUMN clock_out_gps_duration_ms int;
ALTER TABLE internal_time_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_own_session_read ON internal_time_sessions FOR SELECT TO authenticated USING(organization_id=get_user_org_id() AND assigned_to=auth.uid());
GRANT ALL ON daily_clock_breaks,company_settings TO authenticated;
UPDATE profiles SET requires_daily_clock=true WHERE id='${id(11)}';
`);
await db.exec(await readFile('supabase/migrations/20261020173000_native_internal_live_timers.sql', 'utf8'));
async function as(n) {
  await db.exec(`RESET ROLE;SELECT set_config('test.uid','${n ? id(n) : ''}',false);SET ROLE authenticated;`);
}
const start = async (n, type = 'shop_time', evidence = '{}') => (await db.query(
  `SELECT start_internal_time('${id(n)}','${type}','Organizing the shop','${evidence}'::jsonb) id`)).rows[0].id;
const stop = n => db.query(`SELECT stop_internal_time('${id(n)}','Completed internal work') id`);
const entry = async n => (await db.query(`SELECT * FROM time_entries WHERE internal_session_id='${id(n)}'`)).rows[0];
await as(10);
const first = await start(200, 'shop_time', '{"clock_in_gps_capture_method":"high_accuracy","clock_in_latitude":0,"clock_in_longitude":0}');
assert.equal(await start(200), first, 'lost start acknowledgment does not duplicate a session');
let captured = await entry(200);
assert.equal(captured.status, 'draft');
assert.equal(captured.clock_out, null);
assert.equal(captured.clock_in_latitude, 0);
assert.equal((await db.query(`SELECT approved_by,employee_started FROM internal_time_sessions WHERE id='${id(200)}'`)).rows[0].approved_by, null);
assert.equal((await db.query("SELECT count(*)::int n FROM time_entries WHERE status='approved'")).rows[0].n, 0);
assert.equal((await db.query(`SELECT entry_date=(clock_in AT TIME ZONE 'America/Chicago')::date AS valid FROM time_entries WHERE id='${first}'`)).rows[0].valid, true);
await assert.rejects(() => start(201, 'training'), /Stop your active/);
await assert.rejects(() => db.query(`SELECT start_work_order_time('${id(50)}')`), /Stop the active/);
await assert.rejects(() => db.exec(`UPDATE time_entries SET status='approved' WHERE id='${first}'`), /Manager approval|Another manager/);
await assert.rejects(() => db.exec(`UPDATE internal_time_sessions SET employee_started=false WHERE id='${id(200)}'`), /capture mode/);
await as(14);
await assert.rejects(() => stop(200), /Assigned session not found/);
await as(13);
await assert.rejects(() => db.query(`SELECT review_internal_time('${id(200)}','approve_time')`), /review permission/);
await as(10);
// A failed session completion must also roll back the entry's stop.
await db.exec(`RESET ROLE;CREATE FUNCTION fail_live_stop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test completion failure'; END $$;
CREATE TRIGGER test_stop_failure BEFORE UPDATE ON internal_time_sessions FOR EACH ROW WHEN (NEW.id='${id(200)}' AND NEW.status='completed') EXECUTE FUNCTION fail_live_stop();
SET ROLE authenticated;`);
await assert.rejects(() => stop(200), /test completion failure/);
assert.equal((await entry(200)).clock_out, null);
await db.exec('RESET ROLE;DROP TRIGGER test_stop_failure ON internal_time_sessions;SET ROLE authenticated;');
assert.equal((await stop(200)).rows[0].id, first);
captured = await entry(200);
assert.equal(captured.status, 'submitted');
assert.ok(captured.clock_out);
const savedStop = String(captured.clock_out);
await stop(200);
assert.equal(String((await entry(200)).clock_out), savedStop, 'repeat stops do not change recorded work');
assert.equal((await db.query(`SELECT status FROM internal_time_sessions WHERE id='${id(200)}'`)).rows[0].status, 'completed');
await as(12);
assert.equal((await db.query(`SELECT count(*)::int n FROM notifications WHERE related_id='${id(200)}' AND user_id='${id(12)}'`)).rows[0].n, 1);
await db.exec(`INSERT INTO pay_periods(id,organization_id,period_start_date,period_end_date,status) VALUES('${id(300)}','${id(1)}',current_date-1,current_date+1,'needs_review')`);
await assert.rejects(() => db.exec(`UPDATE pay_periods SET status='payroll_approved' WHERE id='${id(300)}'`), /Review pending Shop Time/);
await db.query(`SELECT review_internal_time('${id(200)}','approve_time')`);
assert.equal((await entry(200)).status, 'approved');
await db.query(`SELECT review_internal_time('${id(200)}','approve_time')`);
await db.exec(`UPDATE pay_periods SET status='payroll_approved' WHERE id='${id(300)}'`);
await as(10);
await assert.rejects(() => start(201), /Reopen the payroll/);
await as(12);
await db.exec(`UPDATE pay_periods SET status='open' WHERE id='${id(300)}'`);
// Even a manager records their own work without self-approving payroll.
await start(202, 'training'); await stop(202);
await assert.rejects(() => db.query(`SELECT review_internal_time('${id(202)}','approve_time')`), /Another manager/);
const ownManager = await entry(202);
await assert.rejects(() => db.exec(`UPDATE time_entries SET status='approved' WHERE id='${ownManager.id}'`), /Another manager/);
await assert.rejects(() => db.exec(`UPDATE time_entries SET internal_session_id=NULL,status='approved' WHERE id='${ownManager.id}'`), /retain its session linkage/);
// Effective config, not legacy job_time classification, requires this employee's Daily Clock.
await as(11);
await assert.rejects(() => start(203), /Clock in for the day/);
await db.exec(`INSERT INTO daily_clock_entries(id,technician_id,entry_date,clock_in,status) VALUES('${id(400)}','${id(11)}',current_date,now(),'clocked_in');
INSERT INTO daily_clock_breaks(id,daily_clock_entry_id) VALUES('${id(401)}','${id(400)}')`);
await assert.rejects(() => start(203), /End your break/);
await db.exec(`UPDATE daily_clock_breaks SET break_end=now() WHERE id='${id(401)}'`);
await start(203, 'training');
await stop(203);
assert.equal((await entry(203)).status, 'submitted');
await as(12);
await assert.rejects(() => db.exec(`UPDATE pay_periods SET status='processed' WHERE id='${id(300)}'`), /Review pending Shop Time/);
// Disabled users and anonymous clients cannot start timers.
await db.exec(`UPDATE profiles SET is_active=false WHERE id='${id(10)}'`);
await as(10);await assert.rejects(() => start(204), /Active employee/);
await as(null);await assert.rejects(() => start(204), /Authentication required/);
await db.exec('RESET ROLE;SET ROLE anon;');
await assert.rejects(() => start(204), /permission denied/);
await db.close();
console.log('Live internal timers: immediate capture, atomic/idempotent stops, tenant/ownership guards, approval-only payroll, Daily Clock/break rules, GPS zero coordinates and self-approval denial passed.');
