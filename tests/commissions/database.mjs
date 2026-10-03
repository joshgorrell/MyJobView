import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
// Use the audited schema's actual table definitions for financial tables.
const schema = await readFile("mjv-staging-schema.sql", "utf8");
const financial = [
  "company_commission_settings",
  "employee_commission_config",
  "commission_records",
  "commission_payments",
  "commission_adjustments",
  "project_commission_overrides",
  "commission_report_rate_overrides",
  "commission_report_deductions",
  "commission_statements",
  "commission_payment_batches",
  "invoices",
  "payments",
  "invoice_line_items",
  "service_billing_queue",
];
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,role text,is_active boolean,full_name text);
CREATE FUNCTION get_user_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT organization_id FROM profiles WHERE id=auth.uid()$$;
CREATE TABLE contacts(id uuid PRIMARY KEY,organization_id uuid,contact_name text,full_name text);
CREATE TABLE sales_orders(id uuid PRIMARY KEY,organization_id uuid,created_by uuid,sales_rep_id uuid,proposal_id uuid);
CREATE TABLE projects(id uuid PRIMARY KEY,organization_id uuid,sales_order_id uuid,salesperson_id uuid,assigned_pm uuid,designer_id uuid);
CREATE TABLE work_orders(id uuid PRIMARY KEY,organization_id uuid,type text,contact_id uuid,project_id uuid,customer_sales_rep_id uuid);
CREATE TABLE proposals(id uuid PRIMARY KEY,organization_id uuid,created_by uuid);
CREATE TABLE tax_classifications(id uuid PRIMARY KEY,code text);
`);
for (const table of financial) {
  const definition = schema.match(
    new RegExp(
      `CREATE TABLE IF NOT EXISTS public\\.${table}\\n\\([\\s\\S]*?\\n\\);`,
    ),
  )?.[0];
  assert.ok(definition, `Actual schema definition exists for ${table}`);
  await db.exec(definition);
  await db.exec(`ALTER TABLE ${table} ADD PRIMARY KEY(id);`);
}
// Real status/role constraints expose errors that permissive fixtures would hide.
for (const table of ["invoices", "commission_records", "commission_payments"]) {
  for (const match of schema.matchAll(
    new RegExp(
      `ALTER TABLE public\\.${table} ADD CONSTRAINT [^;]+CHECK [^;]+;`,
      "g",
    ),
  ))
    await db.exec(match[0]);
}
await db.exec(`CREATE FUNCTION stub_placeholder() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;
CREATE TRIGGER trigger_create_commission_records AFTER INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION stub_placeholder();
CREATE TRIGGER trigger_update_commission_on_payment AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION stub_placeholder();
CREATE TRIGGER trigger_update_invoice_on_payment AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION stub_placeholder();
INSERT INTO profiles VALUES('${id(1)}','${id(10)}','admin',true,'Admin'),('${id(2)}','${id(10)}','sales',true,'Rep'),('${id(3)}','${id(10)}','manager',true,'PM'),('${id(4)}','${id(20)}','admin',true,'Other Admin'),('${id(5)}','${id(10)}','sales',false,'Inactive'),('${id(6)}','${id(10)}','sales',true,'Ineligible'),('${id(7)}','${id(20)}','sales',true,'Other Rep');
INSERT INTO contacts VALUES('${id(30)}','${id(10)}','Customer','Customer');
INSERT INTO company_commission_settings(id,organization_id,default_sales_projects_rate,default_design_rate,default_pm_rate,default_service_sales_rate,default_service_pm_rate) VALUES('${id(40)}','${id(10)}',5,1,1,5,2),('${id(41)}','${id(20)}',9,1,1,9,3);
INSERT INTO employee_commission_config(employee_id,organization_id,eligible_for_commissions) VALUES('${id(2)}','${id(10)}',true),('${id(3)}','${id(10)}',true),('${id(6)}','${id(10)}',false),('${id(7)}','${id(20)}',true);
INSERT INTO sales_orders VALUES('${id(50)}','${id(10)}','${id(1)}','${id(2)}',NULL);
INSERT INTO projects VALUES('${id(60)}','${id(10)}','${id(50)}','${id(1)}','${id(3)}',NULL);
INSERT INTO work_orders VALUES('${id(70)}','${id(10)}','service','${id(30)}',NULL,'${id(2)}'),('${id(71)}','${id(10)}','service','${id(30)}','${id(60)}','${id(2)}'),('${id(72)}','${id(20)}','service','${id(30)}',NULL,'${id(7)}');
GRANT SELECT ON profiles,projects,invoices TO authenticated;
SELECT set_config('test.uid','${id(1)}',false);
`);
const migration = await readFile(
  "supabase/migrations/20261002161413_commission_accrual_repairs.sql",
  "utf8",
);
await db.exec(migration);
// Replace existing trigger callbacks, just as CREATE OR REPLACE does in production.
await db.exec(`DROP TRIGGER trigger_create_commission_records ON invoices;
CREATE TRIGGER trigger_create_commission_records AFTER INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION create_commission_records_for_invoice();
DROP TRIGGER trigger_update_commission_on_payment ON payments;
CREATE TRIGGER trigger_update_commission_on_payment AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION update_commission_on_payment();
DROP TRIGGER trigger_update_invoice_on_payment ON payments;
CREATE TRIGGER trigger_update_invoice_on_payment AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION update_invoice_payment_status();`);
async function invoice(n, extra = "") {
  await db.exec(
    `INSERT INTO invoices(id,invoice_number,contact_id,created_by,organization_id,subtotal,tax_amount,total,status${extra ? "," + extra.split("=")[0] : ""}) VALUES('${id(n)}','INV-${n}','${id(30)}','${id(1)}','${id(10)}',1000,100,1100,'submitted'${extra ? "," + extra.slice(extra.indexOf("=") + 1) : ""})`,
  );
}
async function payment(n, inv, amount, date = "2026-10-02", fee = 0) {
  await db.exec(
    `INSERT INTO payments(id,invoice_id,organization_id,created_by,amount,convenience_fee_amount,payment_date,payment_method) VALUES('${id(n)}','${id(inv)}','${id(10)}','${id(1)}',${amount},${fee},'${date}','credit_card')`,
  );
}
const records = async (inv) =>
  (
    await db.query(
      `SELECT * FROM commission_records WHERE invoice_id='${id(inv)}' ORDER BY role_type`,
    )
  ).rows;
const sales = async (inv) =>
  (await records(inv)).find(
    (r) => r.role_type === "sales_projects" || r.role_type === "service_sales",
  );
const report = async (from, to) =>
  (
    await db.query(
      `SELECT get_commission_period_report('${from}','${to}') AS result`,
    )
  ).rows[0].result;
await invoice(100, `project_id='${id(60)}'`);
assert.equal(
  (await sales(100)).employee_id,
  id(2),
  "SO rep wins over creator and project fallback",
);
assert.equal(
  Number((await sales(100)).total_potential_commission),
  50,
  "tax excluded",
);
await payment(200, 100, 566.5, "2026-09-30", 16.5);
assert.equal(
  Number((await sales(100)).amount_earned),
  25,
  "half principal creates half pretax commission",
);
assert.equal(
  Number(
    (await db.query(`SELECT amount_paid FROM invoices WHERE id='${id(100)}'`))
      .rows[0].amount_paid,
  ),
  550,
  "invoice excludes convenience fee",
);
await payment(201, 100, 550);
assert.equal(Number((await sales(100)).amount_earned), 50);
assert.equal(
  (await records(100)).length,
  2,
  "repeated triggers do not duplicate roles",
);
assert.equal(
  (await report("2026-10-01", "2026-10-31")).lines.find(
    (l) => l.invoiceId === id(100) && l.roleType === "sales_projects",
  ).commissionAmount,
  25,
  "period selects payment date",
);
await db.exec(
  `UPDATE employee_commission_config SET custom_sales_projects_rate=8 WHERE employee_id='${id(2)}'; UPDATE projects SET salesperson_id='${id(3)}' WHERE id='${id(60)}'; UPDATE payments SET amount=550 WHERE id='${id(201)}';`,
);
assert.equal(
  Number((await sales(100)).commission_rate),
  5,
  "collected rate frozen",
);
assert.equal(
  (await sales(100)).employee_id,
  id(2),
  "collected attribution frozen",
);
await payment(202, 100, -110, "2026-11-01");
assert.equal(
  Number((await sales(100)).amount_earned),
  45,
  "refund reduces earned commission",
);
assert.equal(
  (await report("2026-11-01", "2026-11-30")).lines.find(
    (l) => l.roleType === "sales_projects",
  ).commissionAmount,
  -5,
);
await db.exec(`DELETE FROM payments WHERE id='${id(202)}'`);
assert.equal(
  Number((await sales(100)).amount_earned),
  50,
  "deleted payment recalculates",
);
await payment(203, 100, 300, "2026-11-02");
assert.equal(
  Number((await sales(100)).amount_earned),
  50,
  "overpayment capped",
);
await invoice(101, `commission_work_order_id='${id(70)}'`);
await payment(204, 101, 550);
const service = await records(101);
assert.equal(service.length, 2);
assert.equal(
  service.find((r) => r.role_type === "service_sales").employee_id,
  id(2),
);
assert.equal(
  service.find((r) => r.role_type === "service_pm").recipient_type,
  "service_department",
);
assert.equal(
  service.find((r) => r.role_type === "service_pm").employee_id,
  null,
);
assert.equal(
  Number(service.find((r) => r.role_type === "service_pm").amount_earned),
  10,
  "department allocation 2%",
);
await invoice(102, `commission_work_order_id='${id(71)}'`);
await payment(205, 102, 1100);
assert.ok(
  (await records(102)).every((r) => r.role_type.startsWith("service_")),
  "project-linked service keeps service rates",
);
await invoice(103, `sales_order_id='${id(50)}'`);
assert.equal(
  (await sales(103)).employee_id,
  id(2),
  "SO without project still covered",
);
await db.exec(
  `UPDATE invoices SET subtotal=800,tax_amount=80,total=880 WHERE id='${id(103)}';`,
);
assert.equal(
  Number((await sales(103)).total_potential_commission),
  64,
  "unpaid revised base and current employee rate",
);
await db.exec(
  `INSERT INTO tax_classifications VALUES('${id(80)}','credit_card_fee'); INSERT INTO invoice_line_items(invoice_id,description,amount,tax_classification_id,organization_id)VALUES('${id(103)}','CC fee',100,'${id(80)}','${id(10)}')`,
);
assert.equal(
  Number((await sales(103)).basis_amount),
  700,
  "actual billed CC fee line excluded",
);
await invoice(104);
assert.equal(
  (await records(104)).length,
  0,
  "unattributed manual invoice not guessed",
);
await db.exec(
  `UPDATE invoices SET project_id='${id(60)}' WHERE id='${id(104)}'`,
);
assert.equal(
  (await sales(104)).employee_id,
  id(2),
  "late project linkage creates record",
);
await db.exec(
  `INSERT INTO proposals VALUES('${id(90)}','${id(10)}','${id(2)}')`,
);
await invoice(105, `proposal_id='${id(90)}'`);
await payment(206, 105, 550);
assert.equal(
  Number((await sales(105)).amount_earned),
  40,
  "early proposal deposit accrues using selected rep",
);
await db.exec(
  `UPDATE invoices SET sales_order_id='${id(50)}',project_id='${id(60)}' WHERE id='${id(105)}'`,
);
assert.equal(
  (await records(105)).length,
  1,
  "late link does not duplicate collected deposit",
);
await db.exec(
  `UPDATE payments SET invoice_id='${id(101)}' WHERE id='${id(201)}'`,
);
assert.equal(
  Number((await sales(100)).amount_earned),
  (((1000 * 5) / 100) * (850 / 1100)).toFixed(2) * 1,
  "moved payment recalculates original",
);
assert.equal(
  Number((await sales(101)).amount_earned),
  50,
  "moved payment recalculates destination",
);
await invoice(106, `sales_order_id='${id(50)}'`);
await db.exec(
  `UPDATE invoices SET total=0,subtotal=0,tax_amount=0 WHERE id='${id(106)}'`,
);
assert.equal(Number((await sales(106)).amount_earned), 0, "zero total safe");
await db.exec(
  `UPDATE sales_orders SET sales_rep_id='${id(6)}' WHERE id='${id(50)}'`,
);
await invoice(107, `sales_order_id='${id(50)}'`);
assert.equal(
  (await records(107)).length,
  0,
  "explicitly ineligible rep skipped",
);
await db.exec(
  `UPDATE sales_orders SET sales_rep_id='${id(1)}' WHERE id='${id(50)}'`,
);
await invoice(108, `sales_order_id='${id(50)}'`);
assert.equal(
  (await records(108)).length,
  0,
  "no config does not imply eligible",
);
await assert.rejects(
  () => invoice(109, `commission_work_order_id='${id(72)}'`),
  "cross-tenant work order rejected",
);
await db.exec(
  `UPDATE company_commission_settings SET commission_basis='profit' WHERE organization_id='${id(10)}'`,
);
await invoice(110, `commission_work_order_id='${id(70)}'`);
await payment(207, 110, 550);
assert.ok(
  (await records(110)).every(
    (r) => r.approval_status === "on_hold" && Number(r.amount_earned) === 0,
  ),
  "profit requires costs",
);
await db.exec(
  `UPDATE company_commission_settings SET commission_basis='gross' WHERE organization_id='${id(10)}'`,
);
// Legacy amounts/rates/recipients are not rewritten by the migration.
await invoice(111);
await db.exec(
  `INSERT INTO commission_records(employee_id,invoice_id,organization_id,role_type,basis_type,commission_rate,basis_amount,total_potential_commission)VALUES('${id(2)}','${id(111)}','${id(10)}','sales_projects','gross',5,1100,55);`,
);
await payment(208, 111, 550);
assert.equal(
  Number((await sales(111)).amount_earned),
  27.5,
  "legacy accrual operational pending reconciliation",
);
assert.ok((await report("2026-10-01", "2026-10-31")).legacyCount > 0);

// Signed fee refunds, already-paid balances, and rounding across installments.
await payment(209, 101, -113.3, "2026-11-03", -3.3);
assert.equal(
  Number((await sales(101)).amount_earned),
  45,
  "fee refund excludes the returned convenience fee from principal",
);
await db.exec(
  `UPDATE commission_records SET amount_paid=50 WHERE invoice_id='${id(101)}' AND role_type='service_sales'`,
);
await payment(210, 101, -110, "2026-11-04");
assert.equal(
  Number((await sales(101)).amount_paid),
  50,
  "customer refund never rewrites payroll paid balance",
);
assert.equal((await sales(101)).status, "paid");
assert.equal(Number((await sales(101)).amount_earned), 40);
await assert.rejects(() =>
  db.exec(
    `INSERT INTO payments(invoice_id,organization_id,created_by,amount,payment_date,payment_method)VALUES('${id(101)}','${id(20)}','${id(1)}',10,'2026-10-02','cash')`,
  ),
);
await db.exec(
  `UPDATE sales_orders SET sales_rep_id='${id(2)}' WHERE id='${id(50)}'`,
);
await invoice(112, `sales_order_id='${id(50)}'`);
await payment(211, 112, 366.67, "2026-12-01");
await payment(212, 112, 366.67, "2026-12-02");
await payment(213, 112, 366.66, "2026-12-03");
const installmentLines = (
  await report("2026-12-01", "2026-12-31")
).lines.filter((l) => l.invoiceId === id(112));
assert.equal(
  installmentLines.reduce((sum, line) => sum + line.commissionAmount, 0),
  Number((await sales(112)).amount_earned),
  "rounded report installments reconcile exactly to ledger",
);
await db.exec(
  `INSERT INTO projects VALUES('${id(61)}','${id(10)}',NULL,'${id(2)}','${id(2)}','${id(2)}')`,
);
await invoice(113, `project_id='${id(61)}'`);
assert.equal(
  (await records(113)).length,
  3,
  "same-person sales, design and PM are separate approved roles",
);
assert.equal(
  (await sales(105)).source_sales_order_id,
  id(50),
  "late deposit linkage updates source metadata without another commission",
);

async function as(user, sql) {
  await db.exec(
    `RESET ROLE; SELECT set_config('test.uid','${user}',false); SET ROLE authenticated;`,
  );
  return db.query(sql);
}
const own = await as(id(2), "SELECT * FROM commission_records");
assert.ok(
  own.rows.length > 0 && own.rows.every((r) => r.employee_id === id(2)),
  "rep only own earnings",
);
assert.equal(
  (await as(id(4), "SELECT * FROM commission_records")).rows.length,
  0,
  "other tenant admin cannot read",
);
assert.equal(
  (await as(id(5), "SELECT * FROM commission_records")).rows.length,
  0,
  "inactive cannot read",
);
for (const table of [
  "commission_records",
  "commission_payments",
  "commission_adjustments",
  "commission_payment_batches",
  "commission_statements",
])
  await assert.rejects(
    () => as(id(2), `DELETE FROM ${table}`),
    "rep financial writes revoked",
  );
assert.equal(
  (
    await as(
      id(2),
      `UPDATE company_commission_settings SET default_sales_projects_rate=99 RETURNING id`,
    )
  ).rows.length,
  0,
  "rep settings update denied",
);
assert.equal(
  (
    await as(
      id(4),
      `UPDATE company_commission_settings SET default_sales_projects_rate=99 WHERE organization_id='${id(10)}' RETURNING id`,
    )
  ).rows.length,
  0,
  "cross-tenant settings denied",
);
await assert.rejects(
  () =>
    as(
      id(1),
      `INSERT INTO employee_commission_config(employee_id,organization_id)VALUES('${id(7)}','${id(10)}')`,
    ),
  "employee ownership checked",
);
await assert.rejects(() =>
  as(
    id(2),
    `SELECT get_effective_commission_rate('${id(7)}','sales_projects')`,
  ),
);
await assert.rejects(
  () => as(id(2), `SELECT commission_private.sync_invoice('${id(100)}')`),
  "internal mutator private",
);
const repReport = (
  await as(
    id(2),
    `SELECT get_commission_period_report('2026-10-01','2026-10-31') AS result`,
  )
).rows[0].result;
assert.ok(
  repReport.lines.every((l) => l.employeeId === id(2)),
  "report own records only",
);
const otherReport = (
  await as(
    id(4),
    `SELECT get_commission_period_report('2026-10-01','2026-10-31') AS result`,
  )
).rows[0].result;
assert.equal(otherReport.lines.length, 0, "report tenant isolation");
await assert.rejects(() =>
  as(id(5), `SELECT get_commission_period_report('2026-10-01','2026-10-31')`),
);
await db.exec("RESET ROLE; SET ROLE anon");
await assert.rejects(() => db.query("SELECT * FROM commission_records"));
await assert.rejects(() =>
  db.query("SELECT get_commission_period_report('2026-10-01','2026-10-31')"),
);
await db.close();
console.log(
  "Commission SQL: payment/invoice triggers, principal/fees, installments, refund, overpayment, service pool, attribution, legacy protection, RLS and report isolation passed.",
);
