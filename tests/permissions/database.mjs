import { transform } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`
 CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,role text,role_id uuid,is_active boolean DEFAULT true,is_global_admin boolean DEFAULT false,is_sales_rep boolean DEFAULT false,employment_classification text DEFAULT 'employee',can_edit_products boolean DEFAULT false,can_create_purchase_orders boolean DEFAULT false,can_create_proposals boolean DEFAULT false,can_view_all_tasks boolean DEFAULT false,can_view_all_pipeline boolean DEFAULT false);
 CREATE TABLE roles(id uuid PRIMARY KEY,organization_id uuid,role_key text,display_name text,is_active boolean DEFAULT true,is_system_role boolean DEFAULT false);
 CREATE TABLE departments(id uuid PRIMARY KEY,organization_id uuid,name text,is_active boolean DEFAULT true);
 CREATE TABLE department_modules(id uuid PRIMARY KEY,organization_id uuid,department_id uuid,module_key text,display_name text,is_active boolean DEFAULT true);
 CREATE TABLE role_module_access(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,role_id uuid,module_id uuid,has_access boolean,UNIQUE(role_id,module_id));
 CREATE TABLE role_department_access(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,role_id uuid,department_id uuid,has_access boolean,UNIQUE(role_id,department_id));
 CREATE TABLE user_permission_overrides(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,module_id uuid,override_type text,notes text,created_by uuid,UNIQUE(user_id,module_id));
 CREATE TABLE department_user_overrides(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,department_id uuid,has_access boolean);
 CREATE TABLE products(id uuid PRIMARY KEY,organization_id uuid,name text);
 CREATE TABLE pay_periods(id uuid PRIMARY KEY,organization_id uuid,status text);
 CREATE TABLE tasks(id uuid PRIMARY KEY,organization_id uuid,user_id uuid,assigned_to uuid,claimed_by uuid,assigned_department_id uuid,title text);
 CREATE FUNCTION approve_payroll_period(p_pay_period_id uuid,p_approved_by uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','service_manager')) THEN RAISE EXCEPTION 'legacy role check'; END IF;
 RETURN '{"success":true}'::json;
 END $$;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
 ALTER TABLE pay_periods ENABLE ROW LEVEL SECURITY;
 CREATE POLICY periods_same_org ON pay_periods FOR ALL TO authenticated USING(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid())) WITH CHECK(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid()));
 ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
 CREATE POLICY tasks_same_org ON tasks FOR ALL TO authenticated USING(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid())) WITH CHECK(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid()));
`);
for (const [n, key] of [
  [10, "admin"],
  [11, "sales"],
  [12, "tech"],
  [13, "finance"],
  [14, "service_manager"],
  [15, "business_development"],
  [16, "manager"],
]) {
  await db.query(
    `INSERT INTO roles(id,organization_id,role_key,display_name,is_system_role) VALUES($1,$2,$3,$3,true)`,
    [id(n), id(1), key],
  );
  await db.query(
    `INSERT INTO profiles(id,organization_id,role,role_id,can_edit_products,can_create_proposals,is_sales_rep,can_view_all_tasks,can_view_all_pipeline) VALUES($1,$2,$3,$4,true,true,$5,true,true)`,
    [id(n + 100), id(1), key, id(n), key === "service_manager"],
  );
}
await db.exec(`INSERT INTO roles VALUES('${id(20)}','${id(2)}','admin','Other admin',true,true);
 INSERT INTO profiles(id,organization_id,role,role_id) VALUES('${id(120)}','${id(2)}','admin','${id(20)}');
 INSERT INTO profiles(id,organization_id,role,role_id,is_active) VALUES('${id(121)}','${id(1)}','admin','${id(10)}',false);
 INSERT INTO departments VALUES('${id(30)}','${id(1)}','sales',true),('${id(31)}','${id(1)}','finance',true),('${id(32)}','${id(2)}','sales',true);
 INSERT INTO pay_periods VALUES('${id(90)}','${id(1)}','needs_review'),('${id(91)}','${id(2)}','needs_review');`);
for (const [n, dept, key, active] of [
  [40, 30, "invoices", true],
  [41, 31, "invoices", true],
  [42, 30, "feed", true],
  [43, 31, "payroll", true],
  [44, 30, "tasks", true],
  [45, 30, "proposals", true],
  [46, 30, "by_office", true],
  [47, 30, "settings", true],
  [48, 30, "my_time_off", true],
  [49, 30, "old_page", false],
]) {
  await db.query(`INSERT INTO department_modules VALUES($1,$2,$3,$4,$4,$5)`, [
    id(n),
    id(1),
    id(dept),
    key,
    active,
  ]);
}
await db.exec(`INSERT INTO department_modules VALUES('${id(50)}','${id(2)}','${id(32)}','invoices','Invoices',true);
 INSERT INTO role_module_access(organization_id,role_id,module_id,has_access) VALUES
 ('${id(1)}','${id(11)}','${id(40)}',true),('${id(1)}','${id(11)}','${id(41)}',false),
 ('${id(1)}','${id(13)}','${id(43)}',true),('${id(1)}','${id(14)}','${id(45)}',true);
 INSERT INTO user_permission_overrides(organization_id,user_id,module_id,override_type,notes) VALUES('${id(1)}','${id(111)}','${id(41)}','revoke','Preserve this note');
 INSERT INTO role_department_access(organization_id,role_id,department_id,has_access) VALUES('${id(1)}','${id(11)}','${id(30)}',true);
 INSERT INTO products VALUES('${id(80)}','${id(1)}','Catalog product');
 INSERT INTO tasks VALUES('${id(70)}','${id(1)}','${id(110)}','${id(112)}',null,null,'Assigned tech'),
 ('${id(71)}','${id(1)}','${id(110)}',null,null,null,'Open team'),
 ('${id(72)}','${id(1)}','${id(110)}','${id(113)}',null,null,'Finance private'),
 ('${id(73)}','${id(2)}','${id(120)}',null,null,null,'Other org'),
 ('${id(74)}','${id(1)}','${id(110)}',null,null,'${id(31)}','Finance department');`);
await db.exec(`
 ALTER TABLE profiles ADD COLUMN full_name text;
 ALTER TABLE departments ADD COLUMN display_name text;
 ALTER TABLE tasks ADD COLUMN status text DEFAULT 'pending', ADD COLUMN contact_id uuid, ADD COLUMN completed_at timestamptz;
 CREATE TABLE contacts(id uuid,full_name text,company_name text);
 CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,title text,body text,type text,is_read boolean,related_id uuid,created_at timestamptz);
 CREATE TABLE points_transactions(id uuid DEFAULT gen_random_uuid(),user_id uuid,points_amount int,transaction_type text,reference_id uuid,description text);
 CREATE TABLE task_watchers(task_id uuid,user_id uuid);
 CREATE SCHEMA time_private;
 CREATE FUNCTION time_private.can_manage_time(p_org uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 GRANT USAGE ON SCHEMA time_private TO authenticated;
`);
await db.exec(
  await readFile(
    "supabase/migrations/20261005131500_task_department_assignment_and_atomic_completion.sql",
    "utf8",
  ),
);
await db.exec(
  await readFile(
    "supabase/migrations/20261009163907_permission_catalog_consistency.sql",
    "utf8",
  ),
);
await db.exec(
  await readFile(
    "supabase/migrations/20261009171351_align_legacy_permission_helper.sql",
    "utf8",
  ),
);
async function as(n, sql, params = []) {
  await db.exec(
    `RESET ROLE;SELECT set_config('test.uid','${n ? id(n) : ""}',false);SET ROLE authenticated`,
  );
  return db.query(sql, params);
}
async function owner(sql, params = []) {
  await db.exec(`RESET ROLE;SELECT set_config('test.uid','',false)`);
  return db.query(sql, params);
}
const snapshot = () =>
  as(110, `SELECT get_role_page_permissions('${id(11)}') AS data`);
const roleRows = () =>
  owner(
    `SELECT module_id,has_access FROM role_module_access WHERE role_id='${id(11)}' ORDER BY module_id`,
  );
assert.equal(
  (await owner(`SELECT can_edit_products FROM profiles WHERE id='${id(111)}'`))
    .rows[0].can_edit_products,
  false,
);
assert.equal(
  (
    await owner(
      `SELECT can_create_proposals FROM profiles WHERE id='${id(113)}'`,
    )
  ).rows[0].can_create_proposals,
  false,
);
assert.equal(
  (await owner(`SELECT is_active FROM department_modules WHERE id='${id(46)}'`))
    .rows[0].is_active,
  false,
);
assert.equal(
  (
    await owner(
      `SELECT count(*)::int AS n FROM user_permission_overrides WHERE user_id='${id(114)}' AND module_id='${id(45)}' AND override_type='grant'`,
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await owner(
      `SELECT bool_and(has_access) AS allowed FROM role_module_access WHERE role_id='${id(11)}' AND module_id IN ('${id(40)}','${id(41)}')`,
    )
  ).rows[0].allowed,
  true,
);
assert.equal(
  (
    await owner(
      `SELECT count(*)::int AS n FROM role_module_access WHERE role_id IN ('${id(12)}','${id(13)}') AND module_id='${id(42)}' AND has_access`,
    )
  ).rows[0].n,
  2,
);
for (const n of [111, 112, 116, 120, 121]) {
  await assert.rejects(
    () => as(n, `SELECT get_role_page_permissions('${id(11)}')`),
    /Administrator/,
  );
  await assert.rejects(
    () => as(n, `UPDATE roles SET display_name='Changed' WHERE id='${id(11)}'`),
    /administrator/,
  );
  await assert.rejects(
    () =>
      as(
        n,
        `UPDATE department_modules SET display_name='Changed' WHERE id='${id(40)}'`,
      ),
    /administrator/,
  );
  await assert.rejects(() =>
    as(n, `DELETE FROM role_department_access WHERE role_id='${id(11)}'`),
  );
}
await assert.rejects(
  () =>
    as(
      110,
      `INSERT INTO role_module_access(organization_id,role_id,module_id,has_access) VALUES('${id(1)}','${id(11)}','${id(50)}',true)`,
    ),
  /outside/,
);
await assert.rejects(
  () =>
    as(110, `UPDATE roles SET organization_id='${id(2)}' WHERE id='${id(11)}'`),
  /administrator|organizations/,
);
await assert.rejects(
  () => as(110, `DELETE FROM roles WHERE id='${id(11)}'`),
  /assigned|System/,
);
let revision = (await snapshot()).rows[0].data.revision;
const original = (await roleRows()).rows;
for (const pages of [
  [
    { module_key: "invoices", has_access: false },
    { module_key: "by_office", has_access: true },
  ],
  [
    { module_key: "invoices", has_access: false },
    { module_key: "tasks", has_access: "true" },
  ],
]) {
  await assert.rejects(() =>
    as(110, `SELECT save_role_page_permissions($1,$2,$3)`, [
      id(11),
      revision,
      JSON.stringify(pages),
    ]),
  );
  assert.deepEqual((await roleRows()).rows, original);
}
await as(110, `SELECT save_role_page_permissions($1,$2,$3)`, [
  id(11),
  revision,
  JSON.stringify([
    { module_key: "invoices", has_access: false },
    { module_key: "tasks", has_access: true },
  ]),
]);
assert.equal(
  (
    await owner(
      `SELECT bool_or(has_access) AS access FROM role_module_access WHERE role_id='${id(11)}' AND module_id IN ('${id(40)}','${id(41)}')`,
    )
  ).rows[0].access,
  false,
);
await assert.rejects(
  () =>
    as(110, `SELECT save_role_page_permissions($1,$2,'[]')`, [
      id(11),
      revision,
    ]),
  /another session/,
);
// Force a later row failure and verify the whole save rolls back, including revision.
await db.exec(
  `RESET ROLE;SELECT set_config('test.uid','',false);CREATE FUNCTION fail_task_grant() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.module_id='${id(44)}' AND NEW.has_access=false THEN RAISE EXCEPTION 'forced failure'; END IF;RETURN NEW;END$$;CREATE TRIGGER fail_task_grant BEFORE UPDATE ON role_module_access FOR EACH ROW EXECUTE FUNCTION fail_task_grant()`,
);
revision = (await snapshot()).rows[0].data.revision;
const beforeFailure = (await roleRows()).rows;
await assert.rejects(
  () =>
    as(110, `SELECT save_role_page_permissions($1,$2,$3)`, [
      id(11),
      revision,
      JSON.stringify([
        { module_key: "invoices", has_access: true },
        { module_key: "tasks", has_access: false },
      ]),
    ]),
  /forced failure/,
);
assert.deepEqual((await roleRows()).rows, beforeFailure);
assert.equal((await snapshot()).rows[0].data.revision, revision);
await owner("DROP TRIGGER fail_task_grant ON role_module_access");
await as(
  110,
  `SELECT set_user_page_permissions('${id(111)}',ARRAY['invoices'],true)`,
);
assert.equal(
  (
    await owner(
      `SELECT count(*)::int AS n FROM user_permission_overrides WHERE user_id='${id(111)}' AND override_type='grant'`,
    )
  ).rows[0].n,
  2,
);
assert.equal(
  (
    await owner(
      `SELECT notes FROM user_permission_overrides WHERE user_id='${id(111)}' AND module_id='${id(41)}'`,
    )
  ).rows[0].notes,
  "Preserve this note",
);
await owner(
  `INSERT INTO user_permission_overrides(organization_id,user_id,module_id,override_type) VALUES('${id(1)}','${id(112)}','${id(40)}','grant'),('${id(1)}','${id(112)}','${id(41)}','revoke')`,
);
assert.equal(
  (
    await owner(
      `SELECT private.can_access_page('${id(112)}','invoices') AS allowed`,
    )
  ).rows[0].allowed,
  false,
);
await as(
  110,
  `SELECT set_user_page_permissions('${id(111)}',ARRAY['invoices'],null)`,
);
assert.equal(
  (
    await owner(
      `SELECT count(*)::int AS n FROM user_permission_overrides WHERE user_id='${id(111)}'`,
    )
  ).rows[0].n,
  0,
);
await assert.rejects(
  () =>
    as(
      120,
      `SELECT set_user_page_permissions('${id(111)}',ARRAY['tasks'],true)`,
    ),
  /Administrator/,
);
await owner(
  `UPDATE profiles SET employment_classification='non_employee' WHERE id='${id(111)}'`,
);
await assert.rejects(
  () =>
    as(
      110,
      `SELECT set_user_page_permissions('${id(111)}',ARRAY['my_time_off'],true)`,
    ),
  /unavailable/,
);
for (const n of [111, 112, 120, 121])
  await assert.rejects(
    () => as(n, `UPDATE products SET name='Changed' WHERE id='${id(80)}'`),
    /editing permission/,
  );
await as(110, `UPDATE products SET name='Admin edited' WHERE id='${id(80)}'`);
await assert.rejects(
  () => as(111, `SELECT approve_payroll_period('${id(90)}','${id(111)}')`),
  /Payroll permission/,
);
await as(113, `SELECT approve_payroll_period('${id(90)}','${id(113)}')`);
await assert.rejects(
  () => as(113, `SELECT approve_payroll_period('${id(91)}','${id(113)}')`),
  /Payroll permission/,
);
await as(
  110,
  `SELECT set_user_page_permissions('${id(113)}',ARRAY['payroll'],false)`,
);
await assert.rejects(
  () => as(113, `SELECT approve_payroll_period('${id(90)}','${id(113)}')`),
  /Payroll permission/,
);
assert.equal((await as(111, `SELECT id FROM pay_periods`)).rows.length, 0);
await assert.rejects(
  () =>
    as(111, `INSERT INTO pay_periods VALUES('${id(95)}','${id(1)}','open')`),
  /row-level security/,
);
// Task assignment and tenant checks must hold even through direct API queries.
await owner(
  `UPDATE profiles SET can_view_all_tasks=false WHERE id='${id(112)}'`,
);
assert.deepEqual(
  (await as(112, `SELECT title FROM tasks ORDER BY title`)).rows.map(
    (r) => r.title,
  ),
  ["Assigned tech", "Open team"],
);
assert.equal(
  (
    await as(
      112,
      `UPDATE tasks SET title='Unauthorized' WHERE id='${id(72)}' RETURNING id`,
    )
  ).rows.length,
  0,
);
await as(112, `UPDATE tasks SET title='My assigned task' WHERE id='${id(70)}'`);
assert.equal(
  (await as(113, `SELECT id FROM tasks WHERE id='${id(73)}'`)).rows.length,
  0,
);
// Real task transition bodies must preserve atomic points while enforcing tenant
// and active-user authority, even though their SECURITY DEFINER bypasses RLS.
await assert.rejects(
  () => as(112, `SELECT complete_task_atomic('${id(73)}')`),
  /Task permission/,
);
await assert.rejects(
  () => as(120, `SELECT complete_task_atomic('${id(71)}')`),
  /Task permission/,
);
await assert.rejects(
  () =>
    as(
      112,
      `UPDATE tasks SET status='completed',completed_by='${id(112)}' WHERE id='${id(70)}'`,
    ),
  /atomic task/,
);
await as(112, `SELECT complete_task_atomic('${id(70)}')`);
await assert.rejects(
  () => as(112, `SELECT complete_task_atomic('${id(70)}')`),
  /already completed/,
);
assert.equal(
  (
    await owner(
      `SELECT count(*)::int n FROM points_transactions WHERE reference_id='${id(70)}'`,
    )
  ).rows[0].n,
  1,
);
await assert.rejects(
  () => as(120, `SELECT reopen_task_atomic('${id(70)}')`),
  /Task permission/,
);
await as(110, `SELECT reopen_task_atomic('${id(70)}')`);
await owner(`UPDATE profiles SET is_active=false WHERE id='${id(112)}'`);
await assert.rejects(
  () => as(112, `SELECT complete_task_atomic('${id(70)}')`),
  /Task permission/,
);
await as(
  110,
  `SELECT set_user_page_permissions('${id(113)}',ARRAY['payroll'],null)`,
);
assert.equal(
  (await as(113, `SELECT time_private.can_manage_time('${id(1)}') allowed`))
    .rows[0].allowed,
  true,
);
assert.equal(
  (await as(113, `SELECT time_private.can_manage_time('${id(2)}') allowed`))
    .rows[0].allowed,
  false,
);
await as(
  110,
  `SELECT set_user_page_permissions('${id(113)}',ARRAY['payroll'],false)`,
);
assert.equal(
  (await as(113, `SELECT time_private.can_manage_time('${id(1)}') allowed`))
    .rows[0].allowed,
  false,
);
assert.equal(
  (
    await as(
      113,
      `SELECT user_has_module_access('${id(110)}','settings') allowed`,
    )
  ).rows[0].allowed,
  false,
);
assert.equal(
  (await as(120, `SELECT user_has_module_access('${id(113)}','feed') allowed`))
    .rows[0].allowed,
  false,
);
assert.equal(
  (await as(113, `SELECT user_has_module_access('${id(113)}','feed') allowed`))
    .rows[0].allowed,
  true,
);
// The actual frontend evaluator must agree with the actual SQL capability
// helper across all remaining active role/user fixtures, including conflicting
// invoice copies and preserved overrides.
const compiled = await transform(
  await readFile("src/lib/permissionCatalog.ts", "utf8"),
  { loader: "ts", format: "esm" },
);
const { effectiveModuleAccess } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.code).toString("base64")
);
const catalog = (await owner("SELECT * FROM department_modules")).rows;
for (const profile of (await owner("SELECT * FROM profiles WHERE is_active"))
  .rows) {
  const grants = new Map(
    (
      await owner(
        "SELECT module_id,has_access FROM role_module_access WHERE role_id=$1",
        [profile.role_id],
      )
    ).rows.map((r) => [r.module_id, r.has_access]),
  );
  const overrides = new Map(
    (
      await owner(
        "SELECT module_id,override_type FROM user_permission_overrides WHERE user_id=$1",
        [profile.id],
      )
    ).rows.map((r) => [r.module_id, r.override_type === "grant"]),
  );
  for (const key of [
    "invoices",
    "feed",
    "tasks",
    "payroll",
    "by_office",
    "old_page",
    "settings",
  ]) {
    const sql = (
      await owner("SELECT private.can_access_page($1,$2) allowed", [
        profile.id,
        key,
      ])
    ).rows[0].allowed;
    assert.equal(
      effectiveModuleAccess(
        key,
        catalog.filter((m) => m.organization_id === profile.organization_id),
        grants,
        overrides,
        profile.role,
      ),
      sql,
      `Frontend/SQL mismatch for ${profile.role}: ${key}`,
    );
  }
}
await db.close();
console.log(
  "Permission transactions, revision conflicts, atomic rollback, tenant/admin guards, invoice conflict precedence, preserved exceptions, role cleanup, product editing, payroll grants, and task scope passed.",
);
