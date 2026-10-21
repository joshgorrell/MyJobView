import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const id = (n) => "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
const existing = await readFile("tests/employee-time/database.mjs", "utf8");
for (const match of [
  ...existing.matchAll(/await db\.exec\(`([\s\S]*?)`\);/g),
].slice(0, 2))
  await db.exec(
    match[1].replace(/\$\{id\((\d+)\)\}/g, (_, n) => id(Number(n))),
  );
await db.exec(
  await readFile(
    "supabase/migrations/20261002110037_enforce_employee_time_authority.sql",
    "utf8",
  ),
);
await db.exec(`CREATE TABLE contacts(id uuid PRIMARY KEY,organization_id uuid,full_name text);
ALTER TABLE projects ADD contact_id uuid,ADD status text DEFAULT 'active';
ALTER TABLE work_orders ADD contact_id uuid,ADD project_id uuid,ADD type text DEFAULT 'service';
ALTER TABLE daily_clock_entries ADD organization_id uuid DEFAULT get_user_org_id(),ADD clock_in timestamptz,ADD clock_out timestamptz;
CREATE TABLE daily_clock_breaks(id uuid PRIMARY KEY,daily_clock_entry_id uuid,break_end timestamptz);
INSERT INTO contacts VALUES('${id(70)}','${id(1)}','Randy Travis'),('${id(71)}','${id(1)}','Other Customer'),('${id(72)}','${id(2)}','Other Tenant');
UPDATE projects SET contact_id='${id(70)}' WHERE id='${id(40)}';UPDATE projects SET contact_id='${id(72)}' WHERE id='${id(41)}';
UPDATE work_orders SET contact_id='${id(70)}',project_id='${id(40)}' WHERE id='${id(50)}';
GRANT SELECT ON contacts TO authenticated;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_read ON contacts FOR SELECT TO authenticated USING(organization_id=get_user_org_id());
`);
// Exercise the new migration alongside the existing live internal-timer guards.
const native = await readFile(
  "tests/employee-time/native-internal-time-database.mjs",
  "utf8",
);
let nativeSetup = [
  ...native.matchAll(/await db\.exec\(`([\s\S]*?)`\);/g),
][0][1];
nativeSetup = nativeSetup
  .replace(
    /ALTER TABLE daily_clock_entries[\s\S]*?CREATE TABLE daily_clock_breaks[^;]+;/,
    "",
  )
  .replace(
    /GRANT ALL ON daily_clock_breaks,company_settings/,
    "GRANT ALL ON daily_clock_breaks,company_settings",
  );
await db.exec(
  nativeSetup.replace(/\$\{id\((\d+)\)\}/g, (_, n) => id(Number(n))),
);
await db.exec(
  await readFile(
    "supabase/migrations/20261020173000_native_internal_live_timers.sql",
    "utf8",
  ),
);
// Production also inherits project IDs from WO links after authority validation.
const snapshots = await readFile(
  "tests/employee-time/existing-triggers.sql",
  "utf8",
);
await db.exec(
  snapshots.slice(
    snapshots.indexOf(
      "CREATE OR REPLACE FUNCTION public.set_project_id_from_work_order()",
    ),
    snapshots.indexOf("CREATE TRIGGER trg_time_entries_set_project_id"),
  ),
);
await db.exec(
  "CREATE TRIGGER trg_time_entries_set_project_id BEFORE INSERT ON time_entries FOR EACH ROW EXECUTE FUNCTION set_project_id_from_work_order()",
);
const migration = await readFile(
  "supabase/migrations/20261021174441_customer_first_job_time.sql",
  "utf8",
);
await db.exec(migration);
async function as(n) {
  await db.exec(
    `RESET ROLE;SELECT set_config('test.uid','${n ? id(n) : ""}',false);SET ROLE authenticated;`,
  );
}
const start = async (n, contact = 70, project = null, activity = "meeting") =>
  (
    await db.query(
      `SELECT start_customer_job_time('${id(n)}','${id(contact)}',${project ? `'${id(project)}'` : "null"},'${activity}','Customer meeting and planning') id`,
    )
  ).rows[0].id;
await as(10);
await assert.rejects(() => start(200, 72), /open project/);
await assert.rejects(() => start(200, 71, 40, "project_work"), /open project/);
await start(200);
assert.equal(await start(200), id(200));
await assert.rejects(() => start(200, 71), /retry does not match/);
await assert.rejects(() => start(201), /Stop your active/);
await assert.rejects(
  () => db.query(`SELECT start_work_order_time('${id(50)}')`),
  /Stop your active customer/,
);
await assert.rejects(
  () =>
    db.query(
      `SELECT start_internal_time('${id(250)}','shop_time','Shop maintenance')`,
    ),
  /Stop your active customer/,
);
await assert.rejects(
  () =>
    db.exec(
      `UPDATE customer_time_sessions SET clock_in=now()-interval '1 hour' WHERE id='${id(200)}'`,
    ),
  /permission denied/,
);
await db.exec(
  `UPDATE customer_time_sessions SET start_gps='{"latitude":0,"longitude":0,"method":"high_accuracy"}' WHERE id='${id(200)}'`,
);
await as(14);
assert.equal(
  (await db.query(`SELECT * FROM customer_time_sessions WHERE id='${id(200)}'`))
    .rows.length,
  0,
);
await assert.rejects(
  () => db.query(`SELECT stop_customer_job_time('${id(200)}')`),
  /Own timer not found/,
);
await as(13);
await assert.rejects(
  () => db.query(`SELECT stop_customer_job_time('${id(200)}')`),
  /Own timer not found/,
);
await as(10);
const request = (
  await db.query(`SELECT stop_customer_job_time('${id(200)}') id`)
).rows[0].id;
assert.equal(
  (await db.query(`SELECT stop_customer_job_time('${id(200)}') id`)).rows[0].id,
  request,
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM time_entries")).rows[0].n,
  0,
  "Captured elapsed time is not payable before review",
);
await assert.rejects(
  () =>
    db.query(`SELECT review_manual_job_time_request('${request}','approve')`),
  /review permission/,
);
await as(12);
const approved = (
  await db.query(
    `SELECT review_manual_job_time_request('${request}','approve') id`,
  )
).rows[0].id;
assert.deepEqual(
  (
    await db.query(
      `SELECT entry_type,work_classification,contact_id,project_id,status FROM time_entries WHERE id='${approved}'`,
    )
  ).rows[0],
  {
    entry_type: "customer_activity",
    work_classification: "customer_activity",
    contact_id: id(70),
    project_id: null,
    status: "approved",
  },
);
assert.equal(
  (
    await db.query(
      `SELECT review_manual_job_time_request('${request}','approve') id`,
    )
  ).rows[0].id,
  approved,
);
// A service visit linked to a project stays service after manual-time approval.
await as(10);
await db.exec(
  `INSERT INTO manual_job_time_requests(id,technician_id,contact_id,work_order_id,entry_date,clock_in,clock_out,reason) VALUES('${id(202)}','${id(10)}','${id(70)}','${id(50)}','2026-10-01','2026-10-01T13:00Z','2026-10-01T14:00Z','Troubleshooting service work')`,
);
await assert.rejects(
  () =>
    db.exec(
      `INSERT INTO manual_job_time_requests(technician_id,contact_id,work_order_id,entry_date,clock_in,clock_out,reason) VALUES('${id(10)}','${id(71)}','${id(50)}','2026-10-01','2026-10-01T13:00Z','2026-10-01T14:00Z','Wrong customer')`,
    ),
  /another customer/,
);
await as(12);
const service = (
  await db.query(
    `SELECT review_manual_job_time_request('${id(202)}','approve') id`,
  )
).rows[0].id;
assert.deepEqual(
  (
    await db.query(
      `SELECT work_classification,project_id FROM time_entries WHERE id='${service}'`,
    )
  ).rows[0],
  { work_classification: "service", project_id: id(40) },
);
// Project live time, manual data validation, approval locks and rollback.
await as(10);
await start(203, 70, 40, "project_work");
await as(12);
await db.exec(
  `INSERT INTO pay_periods VALUES('${id(300)}','${id(1)}',current_date-1,current_date+1,'open',null)`,
);
await assert.rejects(
  () =>
    db.exec(
      `UPDATE pay_periods SET status='payroll_approved' WHERE id='${id(300)}'`,
    ),
  /Review pending job/,
);
await as(10);
await db.exec(
  `RESET ROLE;CREATE FUNCTION fail_customer_stop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test stop failed'; END $$;CREATE TRIGGER fail_stop BEFORE UPDATE ON customer_time_sessions FOR EACH ROW EXECUTE FUNCTION fail_customer_stop();SET ROLE authenticated;`,
);
await assert.rejects(
  () => db.query(`SELECT stop_customer_job_time('${id(203)}')`),
  /test stop failed/,
);
assert.equal(
  (
    await db.query(
      `SELECT clock_out FROM customer_time_sessions WHERE id='${id(203)}'`,
    )
  ).rows[0].clock_out,
  null,
);
await db.exec(
  `RESET ROLE;DROP TRIGGER fail_stop ON customer_time_sessions;SET ROLE authenticated;`,
);
const projectRequest = (
  await db.query(`SELECT stop_customer_job_time('${id(203)}') id`)
).rows[0].id;
await as(12);
const projectEntry = (
  await db.query(
    `SELECT review_manual_job_time_request('${projectRequest}','approve') id`,
  )
).rows[0].id;
assert.equal(
  (
    await db.query(
      `SELECT work_classification FROM time_entries WHERE id='${projectEntry}'`,
    )
  ).rows[0].work_classification,
  "project",
);
await db.exec(
  `UPDATE pay_periods SET status='payroll_approved' WHERE id='${id(300)}'`,
);
await as(10);
await assert.rejects(() => start(204), /Reopen the payroll/);
await as(12);
await db.exec(
  `UPDATE pay_periods SET status='open' WHERE id='${id(300)}';UPDATE profiles SET is_active=false WHERE id='${id(10)}'`,
);
await as(10);
await assert.rejects(() => start(204), /Active employee/);
// Required daily attendance still applies; salary explicitly does not require a daily punch.
await as(11);
await assert.rejects(() => start(260), /Clock in for the day/);
await as(12);
await db.exec(`INSERT INTO employees VALUES('${id(22)}','${id(1)}','${id(14)}');INSERT INTO employee_payroll_configs VALUES('${id(32)}','${id(22)}','${id(1)}','2020-01-01',null,'salary',null,false)`);
await as(14);await start(261);
const salaryRequest=(await db.query(`SELECT stop_customer_job_time('${id(261)}') id`)).rows[0].id;
assert.equal((await db.query(`SELECT count(*)::int n FROM daily_clock_entries WHERE technician_id='${id(14)}'`)).rows[0].n,0);
await as(12);await db.query(`SELECT review_manual_job_time_request('${salaryRequest}','approve')`);
await start(262);const managerRequest=(await db.query(`SELECT stop_customer_job_time('${id(262)}') id`)).rows[0].id;
await assert.rejects(()=>db.query(`SELECT review_manual_job_time_request('${managerRequest}','approve')`),/Another manager/);
await assert.rejects(()=>db.exec(`INSERT INTO manual_job_time_requests(technician_id,contact_id,entry_date,clock_in,clock_out,reason) VALUES('${id(12)}','${id(70)}','2026-10-01','2026-10-01T13:00Z','2026-10-01T14:00Z','Missing activity')`),/manual_job_target/);
// A timer that crosses a workday can be stopped and reviewed without exceeding request limits.
await as(14);await start(263);
await db.exec(`RESET ROLE;UPDATE customer_time_sessions SET clock_in=now()-interval '25 hours' WHERE id='${id(263)}';SET ROLE authenticated;`);
const before=(await db.query(`SELECT count(*)::int n FROM manual_job_time_requests WHERE technician_id='${id(14)}'`)).rows[0].n;
await db.query(`SELECT stop_customer_job_time('${id(263)}')`);
const after=(await db.query(`SELECT count(*)::int n FROM manual_job_time_requests WHERE technician_id='${id(14)}'`)).rows[0].n;
assert.equal(after-before,2);
await db.query(`SELECT stop_customer_job_time('${id(263)}')`);
assert.equal((await db.query(`SELECT count(*)::int n FROM manual_job_time_requests WHERE technician_id='${id(14)}'`)).rows[0].n,after);
await as(null);
await assert.rejects(() => start(204), /Authentication required/);
await db.exec("RESET ROLE;SET ROLE anon;");
await assert.rejects(() => start(204), /permission denied/);
await db.close();
console.log(
  "Customer-first time: customer/project/service classification, tenant/ownership guards, captured timer retries/overlap, GPS, atomic stop, reviewed payroll and disabled actors pass.",
);
