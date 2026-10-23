import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const moduleFrom = (source) =>
  import(
    "data:text/javascript;base64," +
      Buffer.from(
        ts.transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
          },
        }).outputText,
      ).toString("base64")
  );
const logic = await moduleFrom(
  await readFile(
    new URL("../../src/lib/proposalLoss.ts", import.meta.url),
    "utf8",
  ),
);
const evidence = (source, reasons, created_at) => ({
  source,
  reasons,
  created_at,
  notes: "",
});
const customer = evidence("customer", ["price_too_high"], "2026-09-01");
assert.equal(
  logic.selectLossEvidence([
    customer,
    evidence("staff_assessment", ["timing"], "2026-10-20"),
  ]).source,
  "customer",
);
assert.equal(
  logic.selectLossEvidence([
    customer,
    evidence("phone", ["went_with_competitor"], "2026-10-20"),
  ]).source,
  "phone",
);
assert.equal(logic.selectLossEvidence([]).reasons[0], "unknown");
assert.ok(
  logic.needsLossFeedback(
    evidence("legacy_staff", ["price_too_high"], "2026-10-01"),
  ),
);
assert.ok(
  logic.needsLossFeedback(evidence("customer", ["unknown"], "2026-10-01")),
);
const range = logic.lossDateRange(
  "last_month",
  new Date("2026-10-20T12:00:00Z"),
);
assert.equal(new Date(range.start).getMonth(), 8);
assert.equal(new Date(range.end).getMonth(), 9);
assert.deepEqual(
  logic
    .lossReasonStats([
      {
        total: 1000,
        evidence: evidence(
          "phone",
          ["price_too_high", "price_too_high", "timing"],
          "2026-10-01",
        ),
      },
      { total: 2000, evidence: customer },
    ])
    .find((s) => s.reason === "price_too_high"),
  { reason: "price_too_high", count: 2, value: 3000 },
);
const p = {
  id: "p1",
  status: "archived",
  archived_loss_status: "declined",
  total: 1000,
  proposal_number: "P1",
  created_by: "rep1",
  declined_at: "2026-09-20",
  contact: { full_name: "Customer One" },
};
const rows = logic.assembleLossRows(
  [
    p,
    { ...p, id: "cancelled", status: "cancelled", total: 99999 },
    { ...p, id: "won", status: "approved" },
    { ...p, id: "active", status: "sent" },
  ],
  [
    {
      proposal_id: "p1",
      ...evidence("staff_assessment", ["timing"], "2026-10-20"),
    },
  ],
  [
    { request_id: "r1", proposal_id: "p1" },
    { request_id: "r2", proposal_id: "p1" },
    { request_id: "r3", proposal_id: null, opportunity_name: "External" },
    { request_id: "r4", proposal_id: "active" },
  ],
  [{ id: "r3", sent_at: "2026-10-01" }],
  [
    {
      request_id: "r1",
      reasons: ["company"],
      message: "Older",
      created_at: "2026-09-01",
      source: "customer",
    },
    {
      request_id: "r2",
      reasons: ["price"],
      message: "Price",
      created_at: "2026-10-01",
      source: "customer",
    },
  ],
);
assert.equal(rows.filter((r) => r.id === "p1").length, 1);
assert.equal(
  rows.find((r) => r.id === "p1").evidence.reasons[0],
  "price_too_high",
);
assert.equal(rows.find((r) => r.id === "p1").canRecord, true);
assert.ok(!rows.some((r) => r.id === "won"));
assert.equal(rows.find((r) => r.id === "r3").valueKnown, false);
assert.equal(rows.find((r) => r.id === "active").status, "declined");
assert.equal(rows.find((r) => r.id === "active").canRecord, false);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const declineActorType of ['text', 'uuid']) {
const db = new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE organizations(id uuid PRIMARY KEY,subdomain text);CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,is_active boolean,role text);
CREATE FUNCTION get_user_org_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$SELECT organization_id FROM profiles WHERE id=auth.uid()$$;
CREATE FUNCTION flow_has_module_access(text) RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.access',true),'true')='true'$$;
CREATE TABLE proposals(id uuid PRIMARY KEY,organization_id uuid,created_by uuid,status text,declined_at timestamptz,auto_archived boolean DEFAULT false,decline_reason text,decline_notes text,declined_by ${declineActorType});
CREATE TABLE lost_review_tokens(request_id uuid PRIMARY KEY,token_hash text);CREATE TABLE lost_review_details(request_id uuid PRIMARY KEY);CREATE TABLE lost_review_responses(request_id uuid PRIMARY KEY);
CREATE TABLE company_settings(organization_id uuid,auto_review_followup_enabled boolean,auto_review_followup_days integer DEFAULT 14);
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;GRANT SELECT ON profiles,proposals TO authenticated;GRANT UPDATE ON proposals TO authenticated;
INSERT INTO organizations VALUES('${id(1)}','elife'),('${id(2)}','other');INSERT INTO company_settings(organization_id,auto_review_followup_enabled)VALUES('${id(1)}',false),('${id(2)}',false);
INSERT INTO profiles VALUES('${id(10)}','${id(1)}',true,'admin'),('${id(11)}','${id(1)}',true,'sales'),('${id(12)}','${id(1)}',true,'sales'),('${id(20)}','${id(2)}',true,'admin');
INSERT INTO proposals(id,organization_id,created_by,status)VALUES('${id(30)}','${id(1)}','${id(11)}','declined'),('${id(31)}','${id(1)}','${id(11)}','cancelled'),('${id(32)}','${id(1)}','${id(11)}','approved'),('${id(33)}','${id(2)}','${id(20)}','declined'),('${id(40)}','${id(1)}','${id(11)}','sent');`);
await db.exec(
  await readFile(
    new URL(
      "../../supabase/migrations/20261021113259_proposal_loss_feedback_reporting.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(await readFile(new URL('../../supabase/migrations/20261022153811_compatible_decline_actor.sql', import.meta.url), 'utf8'));
const settings = (
  await db.query("select * from company_settings order by organization_id")
).rows;
assert.equal(settings[0].lost_review_followup_enabled, true);
assert.equal(settings[0].lost_review_followup_days, 7);
await db.exec(await readFile(new URL('../../supabase/migrations/20261021135208_lost_feedback_personal_followup.sql',import.meta.url),'utf8'));
assert.equal((await db.query("select lost_review_followup_days from company_settings where organization_id='00000000-0000-0000-0000-000000000001'")).rows[0]?.lost_review_followup_days,14);
assert.equal(settings[0].auto_review_followup_enabled, false);
assert.equal(settings[0].auto_review_followup_days, 14);
assert.equal(settings[1].lost_review_followup_enabled, false);
async function as(n) {
  await db.exec(`RESET ROLE;SET test.uid='${id(n)}';SET ROLE authenticated;`);
}
const insert = (
  proposal = 30,
  org = 1,
  source = "phone",
  reasons = ["price_too_high"],
) =>
  db.query(
    "INSERT INTO proposal_loss_feedback(organization_id,proposal_id,source,reasons,notes)VALUES($1,$2,$3,$4,$5)",
    [id(org), id(proposal), source, reasons, "Customer call"],
  );
await as(11);
await insert();
assert.equal(
  (await db.query("select * from proposal_loss_feedback")).rows.length,
  1,
);
await db.exec('BEGIN');
await insert(30,1,'in_person');
assert.equal((await db.query("select count(*)::int as total from proposal_loss_feedback where source='in_person'")).rows[0].total,1);
await db.exec('ROLLBACK');
await assert.rejects(
  db.query(
    "INSERT INTO proposal_loss_feedback(organization_id,proposal_id,source,reasons,recorded_by)VALUES($1,$2,$3,$4,$5)",
    [id(1), id(30), "phone", ["price_too_high"], id(12)],
  ),
  "Cannot forge recorder",
);
await assert.rejects(insert(33, 2));
await assert.rejects(insert(31));
await assert.rejects(insert(32));
await assert.rejects(insert(30, 1, "phone", ["unknown"]));
await assert.rejects(
  db.exec("UPDATE proposal_loss_feedback SET notes='erased'"),
);
await assert.rejects(db.exec("DELETE FROM proposal_loss_feedback"));
await as(12);
assert.equal(
  (await db.query("select * from proposal_loss_feedback")).rows.length,
  0,
);
await assert.rejects(insert());
await assert.rejects(
  db.query("select record_proposal_decline($1,$2,$3,$4)", [
    id(40),
    "price_too_high",
    "Other rep",
    "phone",
  ]),
);
await as(10);
assert.equal(
  (await db.query("select * from proposal_loss_feedback")).rows.length,
  1,
);
await db.exec("SET test.access='false'");
assert.equal(
  (await db.query("select * from proposal_loss_feedback")).rows.length,
  0,
);
await assert.rejects(insert());
await db.exec("SET test.access='true'");
await as(20);
assert.equal(
  (await db.query("select * from proposal_loss_feedback")).rows.length,
  0,
);
await db.exec(
  `RESET ROLE;UPDATE proposals SET status='archived' WHERE id='${id(30)}'`,
);
assert.equal(
  (
    await db.query("select archived_loss_status from proposals where id=$1", [
      id(30),
    ])
  ).rows[0].archived_loss_status,
  "declined",
);
await db.exec(`UPDATE proposals SET status='sent' WHERE id='${id(30)}'`);
assert.equal(
  (
    await db.query("select archived_loss_status from proposals where id=$1", [
      id(30),
    ])
  ).rows[0].archived_loss_status,
  null,
);
await as(11);
await assert.rejects(
  db.query("select record_proposal_decline($1,$2,$3,$4)", [
    id(40),
    "invented",
    "Bad category",
    "phone",
  ]),
);
assert.equal(
  (await db.query("select status from proposals where id=$1", [id(40)])).rows[0]
    .status,
  "sent",
);
await db.query("select record_proposal_decline($1,$2,$3,$4)", [
  id(40),
  "price_too_high",
  "Confirmed customer answer",
  "phone",
]);
assert.equal(
  (await db.query("select status from proposals where id=$1", [id(40)])).rows[0]
    .status,
  "declined",
);
assert.equal(
  (
    await db.query(
      "select recorded_by from proposal_loss_feedback where proposal_id=$1",
      [id(40)],
    )
  ).rows[0].recorded_by,
  id(11),
);
assert.equal((await db.query('select declined_by from proposals where id=$1', [id(40)])).rows[0].declined_by, declineActorType === 'uuid' ? id(11) : 'rep');
await db.exec("RESET ROLE;SET ROLE anon");
await assert.rejects(db.query("select * from proposal_loss_feedback"));
await assert.rejects(
  db.query("select record_proposal_decline($1,$2,$3,$4)", [
    id(40),
    "price_too_high",
    "",
    "phone",
  ]),
);
await db.close();
}
console.log(
  "Loss reporting, source priority, deduplication, dates, immutable history, tenant/rep/module isolation, atomic declines and archived outcomes passed.",
);

const { needsPersonalFollowup } = await moduleFrom(await readFile(new URL('../../src/lib/lostOpportunityFollowup.ts',import.meta.url),'utf8'));
const clock=Date.parse('2026-10-21T12:00:00Z');
const waiting={sent_at:'2026-09-21T12:00:00Z',responded_at:null,delivery_status:'sent'};
assert.equal(needsPersonalFollowup(waiting,clock-1),false);
assert.equal(needsPersonalFollowup(waiting,clock),true);
assert.equal(needsPersonalFollowup({...waiting,responded_at:'2026-10-20'},clock),false);
assert.equal(needsPersonalFollowup({...waiting,delivery_status:'failed'},clock),false);
assert.equal(needsPersonalFollowup({...waiting,sent_at:'invalid'},clock),false);

console.log('Day-30 personal follow-up boundaries and in-person feedback passed.');
