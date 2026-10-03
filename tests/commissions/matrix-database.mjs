import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
// Reuse the real-schema phase-1 fixture without running its independent assertions.
const fixture = (await readFile("tests/commissions/database.mjs", "utf8"))
  .split("async function invoice(")[0]
  .replace(/^import[^;]+;\n/gm, "");
const init = new (Object.getPrototypeOf(async function () {}).constructor)(
  "PGlite",
  "readFile",
  "assert",
  fixture + "; return {db,id};",
);
const { db, id } = await init(PGlite, readFile, assert);
await db.exec(`CREATE TABLE organizations(id uuid PRIMARY KEY,timezone text);
CREATE TABLE change_orders(id uuid PRIMARY KEY, organization_id uuid, sales_order_id uuid,project_id uuid,status text);
INSERT INTO organizations VALUES('${id(10)}','America/Chicago'),('${id(20)}','America/Chicago');
ALTER TABLE proposals ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN contact_id uuid, ADD COLUMN subtotal numeric, ADD COLUMN total numeric, ADD COLUMN status text, ADD COLUMN proposal_number text, ADD COLUMN approved_at timestamptz;
ALTER TABLE sales_orders ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN contact_id uuid, ADD COLUMN contract_total numeric, ADD COLUMN order_number text, ADD COLUMN booked_at timestamptz;
`);
await db.exec('CREATE SCHEMA private; CREATE ROLE service_role;');
await db.exec(await readFile('supabase/migrations/20261002172125_fix_commission_invoice_payment_trigger.sql','utf8'));
await db.exec(
  await readFile(
    "supabase/migrations/20261003112133_dealer_commission_matrix.sql",
    "utf8",
  ),
);
const fixed = (pool = 7, design = 1, method = "gross", timing = "cash") => ({
  method,
  base: "gross",
  timing,
  pool,
  design,
  pm: 0,
  department: 0,
});
const matrix = (rule = fixed()) => ({
  proposal: rule,
  service: rule,
  retail: { ...rule, design: 0 },
});
const policy = async (rules) =>
  (
    await db.query("select save_commission_matrix($1) as id", [
      JSON.stringify(rules),
    ])
  ).rows[0].id;
const save = async (
  n,
  type = "retail",
  rep = 2,
  designer = null,
  cost = null,
  finalize = true,
  kind = "invoice",
) =>
  (
    await db.query(
      "select review_commission_sale($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10) as id",
      [
        kind,
        id(n),
        type,
        id(rep),
        designer && id(designer),
        cost,
        999,
        999,
        finalize,
        "Reviewed full direct costs",
      ],
    )
  ).rows[0].id;
await policy(matrix());
await db.exec(
  `INSERT INTO invoices(id,organization_id,invoice_number,contact_id,created_by,subtotal,tax_amount,total,status) VALUES('${id(700)}','${id(10)}','R-700','${id(30)}','${id(1)}',999,0,999,'submitted');`,
);
const sale = await save(700);
await db.exec(
  `INSERT INTO payments(id,invoice_id,organization_id,created_by,amount,payment_date,payment_method) VALUES('${id(800)}','${id(700)}','${id(10)}','${id(1)}',999,'2026-10-03','cash');`,
);
const records = async (sale) =>
  (
    await db.query(
      "select * from commission_records where commission_sale_id=$1",
      [sale],
    )
  ).rows;
assert.equal(Number((await records(sale))[0].amount_earned), 69.93);
assert.equal((await records(sale)).length, 1);
// Full role, cost, recognition, correction and authorization scenarios.
const createInvoice = async (n, revenue = 1000, tax = 100, extras = "") => {
  await db.exec(
    `INSERT INTO invoices(id,organization_id,invoice_number,contact_id,created_by,subtotal,tax_amount,total,status ${extras ? "," + extras.split("=")[0] : ""}) VALUES('${id(n)}','${id(10)}','INV-${n}','${id(30)}','${id(1)}',${revenue},${tax},${revenue + tax},'submitted' ${extras ? "," + extras.slice(extras.indexOf("=") + 1) : ""});`,
  );
};
const review = async (
  n,
  {
    type = "retail",
    rep = 2,
    designer = null,
    cost = null,
    revenue = 1000,
    total = 1100,
    kind = "invoice",
    finalize = true,
  } = {},
) =>
  (
    await db.query(
      "select review_commission_sale($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10) id",
      [
        kind,
        id(n),
        type,
        rep && id(rep),
        designer && id(designer),
        cost,
        revenue,
        total,
        finalize,
        "Approved complete materials and labor costs",
      ],
    )
  ).rows[0].id;
const pay = async (n, inv, amount, fee = 0) =>
  db.exec(
    `INSERT INTO payments(id,invoice_id,organization_id,created_by,amount,convenience_fee_amount,payment_date,payment_method) VALUES('${id(n)}','${id(inv)}','${id(10)}','${id(1)}',${amount},${fee},'2026-10-03','cash');`,
  );
const amounts = async (sale) =>
  Object.fromEntries(
    (await records(sale)).map((r) => [r.role_type, Number(r.amount_earned)]),
  );
await createInvoice(701);
const split = await review(701, { type: "service", designer: 3 });
await pay(801, 701, 550);
assert.deepEqual(await amounts(split), { service_sales: 30, design: 5 });
await pay(802, 701, 566.5, 16.5);
assert.deepEqual(await amounts(split), { service_sales: 60, design: 10 });
await db.exec(
  `UPDATE employee_commission_config SET eligible_for_commissions=false WHERE employee_id='${id(3)}';`,
);
await createInvoice(702);
const ineligible = await review(702, { type: "service", designer: 3 });
await pay(803, 702, 1100);
assert.deepEqual(await amounts(ineligible), { service_sales: 70 });
await db.exec(
  `UPDATE employee_commission_config SET eligible_for_commissions=true WHERE employee_id='${id(3)}';`,
);
await createInvoice(703);
const same = await review(703, { type: "service", designer: 2 });
await pay(804, 703, 1100);
assert.deepEqual(await amounts(same), { service_sales: 70 });
await createInvoice(704);
const noRep = await review(704, { type: "service", rep: 6, designer: 3 });
await pay(805, 704, 1100);
assert.deepEqual(await amounts(noRep), { design: 10 });
await createInvoice(705);
await assert.rejects(
  () => review(705, { designer: 3 }),
  /Invalid sale type|retail|Retail/,
);
await assert.rejects(() => review(705, { rep: 7 }), /another dealer/);
await assert.rejects(
  () =>
    db.exec(
      `UPDATE invoices SET commission_sale_id='${split}' WHERE id='${id(705)}';`,
    ),
  /does not belong/,
);
// Existing entitlement retains its policy after a new dealer matrix is activated.
await policy(matrix(fixed(9, 2)));
await pay(806, 701, -550);
assert.deepEqual(await amounts(split), { service_sales: 30, design: 5 });
await db.exec(`DELETE FROM payments WHERE id='${id(806)}';`);
assert.deepEqual(await amounts(split), { service_sales: 60, design: 10 });
await assert.rejects(
  () => review(701, { type: "service", designer: 2 }),
  /locked/,
);
await assert.rejects(
  () => review(701, { type: "service", designer: 3, finalize: false }),
  /approved correction/,
);
// Receipt date corrections reclassify original cash earnings without rewriting events.
await db.exec(`UPDATE payments SET payment_date='2026-09-01' WHERE id='${id(801)}';`);
const september=(await db.query("select get_commission_period_report('2026-09-01','2026-09-30') r")).rows[0].r;
const repRecord=(await records(split)).find(r=>r.role_type==='service_sales').id;
assert.equal(september.lines.filter(l=>l.commissionRecordId===repRecord).reduce((n,l)=>n+Number(l.commissionAmount),0),30);
await db.exec(`UPDATE payments SET payment_date='2026-10-03' WHERE id='${id(801)}';`);
const revertedSeptember=(await db.query("select get_commission_period_report('2026-09-01','2026-09-30') r")).rows[0].r;
assert.equal(revertedSeptember.lines.filter(l=>l.commissionRecordId===repRecord).reduce((n,l)=>n+Number(l.commissionAmount),0),0);

// Profit dollars, full recognition before any collection, then a cost correction.
await policy(matrix(fixed(7, 1, "profit", "sale")));
await createInvoice(710, 10000, 1000);
await assert.rejects(
  () =>
    review(710, { type: "service", designer: 3, revenue: 10000, total: 11000 }),
  /direct costs/,
);
const profit = await review(710, {
  type: "service",
  designer: 3,
  cost: 6000,
  revenue: 10000,
  total: 11000,
});
assert.deepEqual(await amounts(profit), { service_sales: 240, design: 40 });
await pay(810, 710, 5500);
assert.deepEqual(await amounts(profit), { service_sales: 240, design: 40 });
await pay(811, 710, -5500);
assert.deepEqual(await amounts(profit), { service_sales: 240, design: 40 });
await review(710, {
  type: "service",
  designer: 3,
  cost: 7000,
  revenue: 10000,
  total: 11000,
});
assert.deepEqual(await amounts(profit), { service_sales: 180, design: 30 });
const eventCount = (
  await db.query(
    "select count(*) n from commission_earning_events where commission_record_id in (select id from commission_records where commission_sale_id=$1)",
    [profit],
  )
).rows[0].n;
await review(710, {
  type: "service",
  designer: 3,
  cost: 7000,
  revenue: 10000,
  total: 11000,
});
assert.equal(
  (
    await db.query(
      "select count(*) n from commission_earning_events where commission_record_id in (select id from commission_records where commission_sale_id=$1)",
      [profit],
    )
  ).rows[0].n,
  eventCount,
);
await db.exec(`UPDATE invoices SET status='void' WHERE id='${id(710)}';`);
assert.deepEqual(await amounts(profit), { service_sales: 0, design: 0 });
const sliding = {
  ...fixed(),
  method: "sliding",
  base: "gross",
  tiers: [
    { min: null, pool: 0, design: 0, pm: 0, department: 0 },
    ...[10, 20, 30, 40, 50].map((min, i) => ({
      min,
      pool: i + 3,
      design: 1,
      pm: 0,
      department: 0,
    })),
  ],
};
const slidingMatrix = {
  proposal: sliding,
  service: sliding,
  retail: {
    ...sliding,
    design: 0,
    tiers: sliding.tiers.map((t) => ({ ...t, design: 0 })),
  },
};
await policy(slidingMatrix);
// Exact thresholds and just below thresholds select with full precision.
for (const [margin, expected] of [
  [9.999, 0],
  [10, 3],
  [19.999, 3],
  [20, 4],
  [29.999, 4],
  [30, 5],
  [39.999, 5],
  [40, 6],
  [49.999, 6],
  [50, 7],
  [80, 7],
  [-1, 0],
]) {
  const cost = 1000 * (1 - margin / 100);
  const c = (
    await db.query(
      "select commission_private.matrix_calculation($1,1000,$2) c",
      [JSON.stringify(sliding), cost],
    )
  ).rows[0].c;
  assert.equal(Number(c.shares.pool), expected, `Margin ${margin}`);
}
await createInvoice(720, 999, 0);
const low = await review(720, { cost: 940, revenue: 999, total: 999 });
await pay(820, 720, 999);
assert.equal((await records(low)).length, 0);
await createInvoice(721, 1000, 0);
const goal = await review(721, { cost: 500, revenue: 1000, total: 1000 });
await pay(821, 721, 500);
assert.deepEqual(await amounts(goal), { sales_projects: 35 });
await pay(822, 721, 500);
assert.deepEqual(await amounts(goal), { sales_projects: 70 });
await review(721, { cost: 600, revenue: 1000, total: 1000 });
assert.deepEqual(await amounts(goal), { sales_projects: 60 });
await policy({
  proposal: { ...sliding, base: "profit" },
  service: { ...sliding, base: "profit" },
  retail: { ...slidingMatrix.retail, base: "profit" },
});
await createInvoice(722, 1000, 0);
const sp = await review(722, { cost: 500, revenue: 1000, total: 1000 });
await pay(823, 722, 1000);
assert.deepEqual(await amounts(sp), { sales_projects: 35 });
// A reviewed cost correction introducing earnings posts today, not to an old receipt date.
await db.exec(
  `UPDATE payments SET payment_date='2026-09-01' WHERE id='${id(820)}';`,
);
await review(720, { cost: 500, revenue: 999, total: 999 });
const lowEvents = (
  await db.query(
    "select earned_date::text d from commission_earning_events where commission_record_id in (select id from commission_records where commission_sale_id=$1)",
    [low],
  )
).rows;
const today = (
  await db.query("select commission_private.today($1)::text d", [id(10)])
).rows[0].d;
assert.ok(lowEvents.length > 0 && lowEvents.every((e) => e.d === today));

// Source sale identity survives proposal deposit -> order -> progress invoices.
await policy(matrix());
await db.exec(
  `INSERT INTO proposals(id,organization_id,created_by,contact_id,subtotal,total,status,proposal_number) VALUES('${id(730)}','${id(10)}','${id(2)}','${id(30)}',1000,1100,'approved','P-730');`,
);
await createInvoice(731, 500, 50, `proposal_id='${id(730)}'`);
const proposalSale = await review(730, {
  kind: "proposal",
  type: "proposal",
  designer: 3,
});
await pay(830, 731, 550);
assert.deepEqual(await amounts(proposalSale), {
  sales_projects: 30,
  design: 5,
});
await db.exec(
  `INSERT INTO sales_orders(id,organization_id,created_by,sales_rep_id,proposal_id,contact_id,contract_total,order_number) VALUES('${id(732)}','${id(10)}','${id(1)}','${id(2)}','${id(730)}','${id(30)}',1100,'SO-732');`,
);
await createInvoice(733, 500, 50, `sales_order_id='${id(732)}'`);
await pay(831, 733, 550);
assert.deepEqual(await amounts(proposalSale), {
  sales_projects: 60,
  design: 10,
});
assert.equal(
  (
    await db.query(
      "select count(*) n from commission_sales where source_id=$1",
      [id(730)],
    )
  ).rows[0].n,
  1,
);
await pay(832, 733, 550);
assert.deepEqual(await amounts(proposalSale), {
  sales_projects: 60,
  design: 10,
});
// Late proposal links before recognition merge into the same entitlement.
await createInvoice(734, 500, 50);
const oldPending = (
  await db.query("select commission_sale_id id from invoices where id=$1", [
    id(734),
  ])
).rows[0].id;
await db.exec(
  `UPDATE invoices SET proposal_id='${id(730)}' WHERE id='${id(734)}';`,
);
assert.equal(
  (
    await db.query("select commission_sale_id id from invoices where id=$1", [
      id(734),
    ])
  ).rows[0].id,
  proposalSale,
);
assert.equal(
  (
    await db.query("select state from commission_sales where id=$1", [
      oldPending,
    ])
  ).rows[0].state,
  "cancelled",
);
// Approved change orders suspend accrual until a complete new cost/revenue review.
await db.exec(
  `INSERT INTO change_orders VALUES('${id(735)}','${id(10)}','${id(732)}',NULL,'approved');`,
);
assert.equal(
  (
    await db.query("select state from commission_sales where id=$1", [
      proposalSale,
    ])
  ).rows[0].state,
  "cost_review",
);
await review(730, { kind: "proposal", type: "proposal", designer: 3 });
// Order recognition needs no invoice, uses the finalized source date, and does not duplicate.
await policy(matrix(fixed(7, 1, "gross", "sale")));
await db.exec(`INSERT INTO proposals(id,organization_id,created_by,contact_id,subtotal,total,status,proposal_number,approved_at) VALUES('${id(745)}','${id(10)}','${id(2)}','${id(30)}',1000,1100,'approved','P-745','2026-10-02T23:00:00Z');
INSERT INTO sales_orders(id,organization_id,created_by,sales_rep_id,proposal_id,contact_id,contract_total,order_number,booked_at) VALUES('${id(746)}','${id(10)}','${id(1)}','${id(2)}','${id(745)}','${id(30)}',1100,'SO-746','2026-10-02T23:00:00Z');`);
const unpaidOrder = await review(746, {
  kind: "order",
  type: "proposal",
  designer: 3,
});
assert.deepEqual(await amounts(unpaidOrder), {
  sales_projects: 60,
  design: 10,
});
assert.equal(
  (
    await db.query(
      "select recognized_date::text d from commission_sales where id=$1",
      [unpaidOrder],
    )
  ).rows[0].d,
  "2026-10-02",
);
await createInvoice(747, 1000, 100, `sales_order_id='${id(746)}'`);
await pay(847, 747, 1100);
assert.deepEqual(await amounts(unpaidOrder), {
  sales_projects: 60,
  design: 10,
});

// Moving a payment reconciles old and new entitlements without changing paid payroll history.
await db.exec(`UPDATE commission_records SET amount_paid=65 WHERE commission_sale_id='${proposalSale}' AND role_type='sales_projects';
UPDATE payments SET invoice_id='${id(705)}' WHERE id='${id(830)}';`);
assert.deepEqual(await amounts(proposalSale), {
  sales_projects: 60,
  design: 10,
}); // remaining overpayment still fills old sale
await db.exec(`DELETE FROM payments WHERE id='${id(832)}';`);
assert.deepEqual(await amounts(proposalSale), {
  sales_projects: 30,
  design: 5,
});
assert.equal(
  Number(
    (await records(proposalSale)).find((r) => r.role_type === "sales_projects")
      .amount_paid,
  ),
  65,
);
// Cent allocation cannot exceed the pool, and installments sum to it.
assert.equal(
  Number(
    (
      await db.query(
        `select commission_private.role_target(0.10,10,5,5,0,true,'sales_projects',1)+commission_private.role_target(0.10,10,5,5,0,true,'design',1)+commission_private.role_target(0.10,10,5,5,0,true,'pm',1) n`,
      )
    ).rows[0].n,
  ),
  0.01,
);
// Role appearance after a tier correction cannot recognize the same sale base twice.
const roleTiers = {
  ...sliding,
  tiers: sliding.tiers.map((t) => ({ ...t, design: t.min >= 50 ? 1 : 0 })),
};
await policy({
  proposal: roleTiers,
  service: roleTiers,
  retail: slidingMatrix.retail,
});
await createInvoice(750, 1000, 0);
const changingRoles = await review(750, {
  type: "service",
  designer: 3,
  cost: 700,
  revenue: 1000,
  total: 1000,
});
await pay(850, 750, 1000);
assert.deepEqual(await amounts(changingRoles), { service_sales: 50 });
await review(750, {
  type: "service",
  designer: 3,
  cost: 500,
  revenue: 1000,
  total: 1000,
});
assert.deepEqual(await amounts(changingRoles), {
  service_sales: 60,
  design: 10,
});
const basisEvents = (
  await db.query(
    "select source_key,created_at::text stamp,base_delta from commission_earning_events where commission_record_id in(select id from commission_records where commission_sale_id=$1)",
    [changingRoles],
  )
).rows;
assert.equal(
  [
    ...new Map(
      basisEvents.map((e) => [e.source_key + e.stamp, Number(e.base_delta)]),
    ).values(),
  ].reduce((a, b) => a + b, 0),
  1000,
);
await assert.rejects(
  () =>
    db.exec(
      `INSERT INTO invoice_line_items(invoice_id,description,organization_id) VALUES('${id(750)}','Foreign fee','${id(20)}');`,
    ),
  /another dealer/,
);
await db.query("select set_commission_eligibility($1,true)", [id(6)]);
assert.equal(
  (
    await db.query(
      "select eligible_for_commissions e from employee_commission_config where employee_id=$1",
      [id(6)],
    )
  ).rows[0].e,
  true,
);
await db.query("select set_commission_eligibility($1,false)", [id(6)]);

// Drafts cannot be released and invalid matrix rows cannot be activated.
await createInvoice(740);
await db.exec(`UPDATE invoices SET status='draft' WHERE id='${id(740)}';`);
await assert.rejects(() => review(740, { cost: 500 }), /not finalized/);
await assert.rejects(() => policy(matrix(fixed(0.5, 1))), /exceed/);
await assert.rejects(
  () =>
    policy({
      ...slidingMatrix,
      retail: {
        ...slidingMatrix.retail,
        tiers: [
          sliding.tiers[0],
          { ...sliding.tiers[1], design: 0, min: 20 },
          { ...sliding.tiers[2], design: 0, min: 10 },
        ],
      },
    }),
  /increasing/,
);
// The report sums immutable earning/correction events, including sale-time earnings.
const report = (
  await db.query(
    "select get_commission_period_report('2026-01-01','2026-12-31') r",
  )
).rows[0].r;
for (const row of await records(proposalSale))
  assert.equal(
    Number(
      report.lines
        .filter((l) => l.commissionRecordId === row.id)
        .reduce((n, l) => n + Number(l.commissionAmount), 0),
    ),
    Number(row.amount_earned),
  );
await db.exec(
  `SET ROLE authenticated;SELECT set_config('test.uid','${id(2)}',false);`,
);
const own = (
  await db.query(
    "select get_commission_period_report('2026-01-01','2026-12-31') r",
  )
).rows[0].r;
assert.ok(own.lines.every((l) => l.employeeId === id(2)));
await assert.rejects(() => policy(matrix()), /permission/);
await assert.rejects(
  () => db.query("select set_commission_eligibility($1,true)", [id(7)]),
  /authorized/,
);
await assert.rejects(
  () => db.exec("UPDATE commission_sales SET revenue=0"),
  /permission/,
);
await assert.rejects(
  () => db.query("select commission_private.sync_sale($1)", [sale]),
  /permission/,
);
await db.exec(`SELECT set_config('test.uid','${id(4)}',false);`);
assert.equal(
  (await db.query("select count(*) n from commission_sales")).rows[0].n,
  0,
);
await assert.rejects(
  () => db.query("select get_commission_sale_context('invoice',$1)", [id(700)]),
  /unavailable/,
);
await db.exec("RESET ROLE;");
console.log(
  "Dealer matrix: pools, eligibility, gross/profit, sliding boundaries, both bases, cash/sale recognition, cost correction, refunds, cap, proposal identity, rounding, reports and RLS passed.",
);
await db.close();
