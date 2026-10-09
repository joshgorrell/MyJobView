import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
export async function interactionCases(
  db,
  {
    org,
    otherOrg,
    user,
    colleague,
    outsider,
    customer,
    otherCustomer,
    project,
    wo,
    uid,
  },
) {
  await db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false);
 CREATE SCHEMA private;
 ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,ADD COLUMN employment_classification text DEFAULT 'employee';
 CREATE TABLE roles(id uuid,organization_id uuid,is_active boolean);INSERT INTO roles SELECT DISTINCT role_id,organization_id,true FROM profiles WHERE role_id IS NOT NULL;UPDATE profiles SET role='admin' WHERE id='${user}';
 CREATE TABLE departments(id uuid PRIMARY KEY,organization_id uuid,is_active boolean);
 INSERT INTO departments VALUES('${uid(900)}','${org}',true);
 ALTER TABLE department_modules ADD COLUMN organization_id uuid,ADD COLUMN department_id uuid;
 UPDATE department_modules SET organization_id='${org}',department_id='${uid(900)}';
 INSERT INTO department_modules(module_key,organization_id,department_id) VALUES('feed','${org}','${uid(900)}'),('connections','${org}','${uid(900)}'),('sales_activity','${org}','${uid(900)}');
 ALTER TABLE role_module_access ADD COLUMN organization_id uuid;UPDATE role_module_access a SET organization_id=r.organization_id FROM roles r WHERE r.id=a.role_id;CREATE UNIQUE INDEX role_modules_unique ON role_module_access(role_id,module_id);
 ALTER TABLE user_permission_overrides ADD COLUMN organization_id uuid,ADD COLUMN notes text;UPDATE user_permission_overrides o SET organization_id=p.organization_id FROM profiles p WHERE p.id=o.user_id;CREATE UNIQUE INDEX user_modules_unique ON user_permission_overrides(user_id,module_id);
 CREATE FUNCTION private.is_current_page_key(text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE TABLE connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,contact_id uuid,connection_type text CHECK(connection_type IN ('meeting','call','email','casual_conversation','other')),connection_date timestamptz,notes text,follow_up_needed boolean DEFAULT false,reminder_date timestamptz,follow_up_description text,completed_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE scheduled_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,prospect_id uuid,created_by_user_id uuid,connection_type text,recurrence_pattern text,recurrence_interval int,schedule_start_date date,default_notes text,is_active boolean DEFAULT true,last_occurrence_date date,next_occurrence_date date,created_at timestamptz DEFAULT now());
 CREATE TABLE scheduled_connection_occurrences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,scheduled_connection_id uuid,prospect_id uuid,scheduled_date date,original_scheduled_date date,is_completed boolean DEFAULT false,is_skipped boolean DEFAULT false,completed_at timestamptz,connection_id uuid,rollover_count integer DEFAULT 0);
 CREATE FUNCTION send_scheduled_connection_notifications() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM sc.contact_id FROM scheduled_connections sc WHERE sc.id=NEW.scheduled_connection_id; RETURN NEW; END$$;
 CREATE TRIGGER send_scheduled_connection_notification_trigger AFTER INSERT ON scheduled_connection_occurrences FOR EACH ROW EXECUTE FUNCTION send_scheduled_connection_notifications();
 CREATE TABLE activity_feed(id uuid PRIMARY KEY,user_id uuid,type text,metadata jsonb,created_at timestamptz);
 GRANT SELECT,INSERT,UPDATE ON connections,scheduled_connections,scheduled_connection_occurrences TO authenticated;
 CREATE POLICY connection_org ON connections FOR ALL TO authenticated USING(organization_id=get_user_org_id()) WITH CHECK(organization_id=get_user_org_id());
 CREATE POLICY schedule_org ON scheduled_connections FOR ALL TO authenticated USING(organization_id=get_user_org_id()) WITH CHECK(organization_id=get_user_org_id());
 CREATE POLICY occurrence_org ON scheduled_connection_occurrences FOR ALL TO authenticated USING(organization_id=get_user_org_id()) WITH CHECK(organization_id=get_user_org_id());
 INSERT INTO connections(id,organization_id,user_id,contact_id,connection_type,connection_date,notes) VALUES('${uid(901)}','${org}','${user}','${customer}','call','2026-01-01T12:00Z','Historical connection');
 INSERT INTO activity_feed VALUES('${uid(902)}','${colleague}','meeting','{"description":"Historical activity"}','2026-01-02T12:00Z');
 `);
  const catalog = await readFile(
    "supabase/migrations/20261009163907_permission_catalog_consistency.sql",
    "utf8",
  );
  await db.exec(
    catalog.slice(
      catalog.indexOf("CREATE OR REPLACE FUNCTION private.can_access_page("),
      catalog.indexOf(
        "CREATE OR REPLACE FUNCTION private.guard_product_permission()",
      ),
    ),
  );
  const scheduleSQL = await readFile(
    "supabase/migrations/20260127201931_create_scheduled_connections_system.sql",
    "utf8",
  );
  const start = scheduleSQL.indexOf(
    "CREATE OR REPLACE FUNCTION calculate_next_occurrence_date(",
  );
  const end = scheduleSQL.indexOf(
    "CREATE OR REPLACE FUNCTION generate_scheduled_occurrences",
    start,
  );
  await db.exec(
    scheduleSQL
      .slice(start, end)
      .replace(
        "FUNCTION calculate_next_occurrence_date",
        "FUNCTION public.calculate_next_occurrence_date",
      ),
  );
  const migration = await readFile(
    "supabase/migrations/20261009173255_flow_interactions_and_followups.sql",
    "utf8",
  );
  await db.exec(migration);
  async function as(id, sql, args = []) {
    await db.exec(
      `RESET ROLE;SELECT set_config('request.jwt.claim.sub','${id}',false);SET ROLE authenticated;`,
    );
    return db.query(sql, args);
  }
  const save = (scope, type = "call", repeat = "", due = null) =>
    as(user, "SELECT save_flow_interaction($1,$2,$3,now(),$4,$5,$6) id", [
      scope,
      type,
      "Useful notes",
      due,
      "Call back",
      repeat,
    ]);
  assert.equal(
    (
      await as(
        user,
        "SELECT count(*)::int n FROM flow_events WHERE source_table='connections' AND details='Historical connection'",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await as(
        user,
        "SELECT count(*)::int n FROM flow_events WHERE source_table='activity_feed'",
      )
    ).rows[0].n,
    1,
    "Admin may read historical sales activity",
  );
  const saved = (
    await save(
      { project_id: project },
      "site_visit",
      "",
      new Date().toISOString(),
    )
  ).rows[0].id;
  const context = (
    await as(
      user,
      "SELECT project_id,contact_id FROM flow_events WHERE source_id=$1",
      [saved],
    )
  ).rows[0];
  assert.equal(context.project_id, project);
  assert.equal(context.contact_id, customer);
  await assert.rejects(
    () => save({ contact_id: otherCustomer }),
    /Customer access/,
  );
  await assert.rejects(
    () => save({ project_id: project, contact_id: otherCustomer }),
    /Inconsistent/,
  );
  const before = (await as(user, "SELECT count(*)::int n FROM connections"))
    .rows[0].n;
  await assert.rejects(
    () => save({ contact_id: customer }, "call", "bad"),
    /Invalid follow-up/,
  );
  assert.equal(
    (await as(user, "SELECT count(*)::int n FROM connections")).rows[0].n,
    before,
  );
  const followups = (await as(user, "SELECT get_flow_followups() value"))
    .rows[0].value;
  assert.ok(followups.items.some((i) => i.id === saved));
  await assert.rejects(
    () =>
      as(colleague, "SELECT complete_flow_followup($1,$2,$3)", [
        saved,
        "reminder",
        "Foreign completion",
      ]),
    /unavailable/,
  );
  await as(user, "SELECT complete_flow_followup($1,$2,$3)", [
    saved,
    "reminder",
    "Completed call",
  ]);
  await assert.rejects(
    () =>
      as(user, "SELECT complete_flow_followup($1,$2,$3)", [
        saved,
        "reminder",
        "Repeat",
      ]),
    /already completed/,
  );
  await save({ work_order_id: wo }, "demo", "weekly", new Date().toISOString());
  const scheduled = (await as(user, "SELECT get_flow_followups() value"))
    .rows[0].value;
  assert.equal(
    (
      await as(
        user,
        "SELECT count(*)::int n FROM notifications WHERE title='Follow-up due'",
      )
    ).rows[0].n,
    1,
    "Only due occurrences notify, using actual schedule columns",
  );
  assert.ok(scheduled.items.filter((i) => i.kind === "schedule").length >= 12);
  const recurring = scheduled.items.find((i) => i.kind === "schedule");
  const schedule = scheduled.schedules[0];
  await as(user, "SELECT set_flow_schedule_active($1,false)", [schedule.id]);
  assert.equal(
    (
      await as(user, "SELECT get_flow_followups() value")
    ).rows[0].value.items.filter((i) => i.kind === "schedule").length,
    0,
  );
  await as(user, "SELECT set_flow_schedule_active($1,true)", [schedule.id]);
  await as(user, "SELECT complete_flow_followup($1,$2,$3)", [
    recurring.id,
    "schedule",
    "Recurring call done",
  ]);
  await assert.rejects(
    () =>
      as(user, "SELECT complete_flow_followup($1,$2,$3)", [
        recurring.id,
        "schedule",
        "Again",
      ]),
    /already completed/,
  );
  await assert.rejects(
    () =>
      as(outsider, "SELECT set_flow_schedule_active($1,false)", [schedule.id]),
    /Flow access|unavailable/,
  );
  await assert.rejects(
    () =>
      as(
        colleague,
        "INSERT INTO connections(organization_id,user_id,contact_id,connection_type,notes) VALUES($1,$2,$3,'call','Forged')",
        [org, user, customer],
      ),
    /row-level security/,
  );
  await db.exec(
    `RESET ROLE;UPDATE profiles SET role='sales' WHERE id='${colleague}';INSERT INTO user_permission_overrides(user_id,module_id,override_type,organization_id) SELECT '${colleague}',id,'grant','${org}' FROM department_modules WHERE module_key IN ('feed','contacts');`,
  );
  assert.equal(
    (
      await as(
        colleague,
        "SELECT count(*)::int n FROM flow_events WHERE source_table='connections'",
      )
    ).rows[0].n,
    0,
    "Owner-only history is not broadened by customer access",
  );
  await db.exec(
    `RESET ROLE;UPDATE profiles SET is_active=false WHERE id='${user}';`,
  );
  await assert.rejects(
    () => as(user, "SELECT get_flow_followups()"),
    /Flow access/,
  );
  await db.exec(
    `RESET ROLE;UPDATE profiles SET is_active=true WHERE id='${user}';SELECT set_config('request.jwt.claim.sub','',false);`,
  );
  await db.exec(migration);
  assert.equal(
    (
      await as(
        user,
        "SELECT count(*)::int n FROM flow_events WHERE source_table='connections' AND source_id=$1",
        [saved],
      )
    ).rows[0].n,
    1,
    "History backfill is idempotent",
  );
  assert.equal(
    (
      await as(
        user,
        "SELECT count(*)::int n FROM department_modules WHERE is_active AND module_key IN ('connections','sales_activity')",
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "PASS: Flow interactions/history, scoped jobs, atomic reminders and recurring completion, tenant/owner/disabled-user guards, rollback, pauses and idempotent retirement.",
  );
}
