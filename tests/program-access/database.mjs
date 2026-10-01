import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE organizations(id uuid PRIMARY KEY);INSERT INTO organizations VALUES('${id(1)}'),('${id(2)}');
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,role text,is_active boolean,contact_id uuid);
INSERT INTO profiles VALUES('${id(10)}','${id(1)}','admin',true,NULL),('${id(11)}','${id(1)}','tech',true,NULL),('${id(12)}','${id(2)}','admin',true,NULL),('${id(13)}','${id(1)}','customer',true,'${id(20)}');
CREATE TABLE contacts(id uuid PRIMARY KEY,organization_id uuid,full_name text,email text,phone text);INSERT INTO contacts(id,organization_id) VALUES('${id(20)}','${id(1)}'),('${id(21)}','${id(2)}');
CREATE TABLE projects(id uuid PRIMARY KEY,contact_id uuid,organization_id uuid,substantial_completion_date date,name text);
INSERT INTO projects(id,contact_id,organization_id,substantial_completion_date) VALUES('${id(30)}','${id(20)}','${id(1)}',CURRENT_DATE-10),('${id(31)}','${id(20)}','${id(1)}',CURRENT_DATE-100);
CREATE TABLE work_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,type text,status text,project_id uuid,contact_id uuid,recurring_subscription_id uuid);
CREATE TABLE recurring_plans(id uuid PRIMARY KEY,plan_name text,plan_type text);
CREATE TABLE recurring_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,organization_id uuid,contact_id uuid,plan_id uuid,status text,start_date date,end_date date,next_billing_date date,trial_started_date date,trial_end_date date,auto_invoice boolean,auto_send boolean,auto_renew boolean,created_by uuid,notes text);
INSERT INTO recurring_subscriptions(contact_id,organization_id,notes,status)VALUES('${id(20)}','${id(1)}','Trial subscription created from punchlist invite','trial');
CREATE TABLE punchlist_access_grants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,contact_id uuid,project_id uuid,subscription_id uuid,access_type text CONSTRAINT punchlist_access_grants_access_type_check CHECK(access_type IN ('test_and_tune','promotional','vip_signup')),status text,granted_date date,expiration_date date);
CREATE TABLE pending_punchlist_invites(id uuid PRIMARY KEY,contact_id uuid,project_id uuid,status text);
GRANT SELECT ON profiles,contacts,projects,recurring_plans TO authenticated;
GRANT ALL ON work_orders,punchlist_access_grants,pending_punchlist_invites,recurring_subscriptions TO authenticated;
`);
await db.exec(
  await readFile(
    "supabase/migrations/20261001113659_work_order_configuration_and_program_access.sql",
    "utf8",
  ),
);
async function as(user, sql) {
  await db.exec(
    `RESET ROLE;SELECT set_config('test.uid','${user}',false);SET ROLE authenticated;`,
  );
  return db.query(sql);
}
async function denied(user, sql) {
  await assert.rejects(() => as(user, sql));
}
assert.equal(
  (await as(id(10), `SELECT * FROM work_order_options`)).rows.length,
  13,
);
assert.equal(
  (await as(id(11), `SELECT * FROM work_order_options`)).rows.length,
  13,
);
await denied(
  id(11),
  `INSERT INTO work_order_options(organization_id,kind,label,behavior)VALUES('${id(1)}','type','Tech added','service')`,
);
await denied(
  id(10),
  `INSERT INTO work_order_options(organization_id,kind,label,behavior)VALUES('${id(2)}','type','Other tenant','service')`,
);
const option = (
  await as(
    id(10),
    `INSERT INTO work_order_options(organization_id,kind,label,behavior)VALUES('${id(1)}','type','Custom service','service') RETURNING id`,
  )
).rows[0].id;
const status = (
  await as(
    id(10),
    `INSERT INTO work_order_options(organization_id,kind,label,behavior)VALUES('${id(1)}','status','Awaiting parts','on_hold') RETURNING id`,
  )
).rows[0].id;
const wo = (
  await as(
    id(10),
    `INSERT INTO work_orders(company_id,type,status,work_order_type_id,work_order_status_id)VALUES('${id(1)}','project','assigned','${option}','${status}') RETURNING *`,
  )
).rows[0];
assert.equal(wo.type, "service");
assert.equal(wo.status, "on_hold");
await denied(
  id(10),
  `UPDATE work_order_options SET behavior='warranty' WHERE id='${option}'`,
);
await denied(id(10), `DELETE FROM work_order_options WHERE id='${option}'`);
await as(
  id(10),
  `UPDATE work_order_options SET is_active=false WHERE id='${option}'`,
);
await denied(
  id(10),
  `INSERT INTO work_orders(company_id,type,status,work_order_type_id)VALUES('${id(1)}','service','assigned','${option}')`,
);
const transition = (
  await as(
    id(10),
    `UPDATE work_orders SET status='completed' WHERE id='${wo.id}' RETURNING *`,
  )
).rows[0];
assert.equal(transition.work_order_status_id, null);
await denied(
  id(12),
  `INSERT INTO work_orders(company_id,type,status,work_order_type_id)VALUES('${id(2)}','service','assigned','${option}')`,
);
await denied(
  id(11),
  `SELECT grant_customer_program('${id(20)}','vip_trial',NULL,90)`,
);
await denied(
  id(10),
  `SELECT grant_customer_program('${id(21)}','vip_trial',NULL,90)`,
);
await denied(
  id(10),
  `SELECT grant_customer_program('${id(20)}','test_and_tune','${id(31)}',90)`,
);
const tt = (
  await as(
    id(10),
    `SELECT grant_customer_program('${id(20)}','test_and_tune','${id(30)}',90) AS id`,
  )
).rows[0].id;
const dates = (
  await as(
    id(10),
    `SELECT granted_date=CURRENT_DATE-10 AS starts_at_completion,expiration_date=CURRENT_DATE+80 AS ends_at_90 FROM punchlist_access_grants WHERE id='${tt}'`,
  )
).rows[0];
assert.ok(dates.starts_at_completion && dates.ends_at_90);
assert.equal(
  (await as(id(10), `SELECT count(*)::int AS n FROM recurring_subscriptions`))
    .rows[0].n,
  1,
  "Test & Tune must not create a VIP trial",
);
await as(
  id(10),
  `SELECT grant_customer_program('${id(20)}','vip_trial',NULL,90)`,
);
assert.equal(
  (await as(id(13), `SELECT * FROM get_punchlist_access_info('${id(20)}')`))
    .rows[0].access_type,
  "vip_trial",
);
await denied(id(13), `SELECT * FROM get_punchlist_access_info('${id(21)}')`);
await as(
  id(10),
  `UPDATE recurring_subscriptions SET status='cancelled' WHERE trial_source='vip_trial'`,
);
assert.equal(
  (await as(id(13), `SELECT * FROM get_punchlist_access_info('${id(20)}')`))
    .rows[0].access_type,
  "test_and_tune",
  "Cancelled trial cannot override valid project access",
);
assert.equal(
  (
    await as(
      id(10),
      `SELECT expiration_date=CURRENT_DATE+80 AS unchanged FROM punchlist_access_grants WHERE id='${tt}'`,
    )
  ).rows[0].unchanged,
  true,
);
await db.exec(`RESET ROLE;ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;CREATE POLICY contact_tenant ON contacts FOR SELECT TO authenticated USING(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid()));
ALTER TABLE recurring_subscriptions ENABLE ROW LEVEL SECURITY;CREATE POLICY subscriptions_tenant ON recurring_subscriptions FOR ALL TO authenticated USING(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid())) WITH CHECK(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid()));
ALTER TABLE punchlist_access_grants ENABLE ROW LEVEL SECURITY;CREATE POLICY grants_tenant ON punchlist_access_grants FOR ALL TO authenticated USING(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid())) WITH CHECK(organization_id=(SELECT organization_id FROM profiles WHERE id=auth.uid()));`);
const customers = (
  await as(id(10), `SELECT * FROM get_all_punchlist_customers()`)
).rows;
assert.ok(customers.length);
assert.ok(customers.every((customer) => customer.contact_id === id(20)));
await as(
  id(10),
  `UPDATE recurring_subscriptions SET status='trial',trial_end_date=CURRENT_DATE+120 WHERE trial_source='vip_trial'`,
);
assert.equal(
  (
    await as(
      id(10),
      `SELECT expiration_date=CURRENT_DATE+120 AS extended FROM punchlist_access_grants WHERE access_type='vip_trial'`,
    )
  ).rows[0].extended,
  true,
);
assert.equal(
  (
    await as(
      id(10),
      `SELECT expiration_date=CURRENT_DATE+80 AS unchanged FROM punchlist_access_grants WHERE id='${tt}'`,
    )
  ).rows[0].unchanged,
  true,
);
await db.exec(`RESET ROLE;SET ROLE anon;`);
await assert.rejects(() =>
  db.query(`SELECT * FROM get_punchlist_access_info('${id(20)}')`),
);
await db.close();
console.log(
  "Dealer configuration RLS, canonical workflows, and separate program access tests passed.",
);
