import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
const load = (file, dependencies = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => dependencies[name],
      Date,
      Intl,
      Math,
      Number,
      Map,
      Set,
    },
  );
  return module.exports;
};
const labor = load("src/lib/laborDashboard.ts");
const model = load("src/lib/techProduction.ts", { "./laborDashboard": labor });
assert.equal(model.duration(7.4166666667), "7h 25m");
assert.equal(model.duration(1.99999999), "2h 00m");
assert.equal(model.duration(null), "—");
assert.equal(model.duration(-1.25), "−1h 15m", "corrections retain their sign");
assert.equal(model.percentage(92.44444), "92.4%");
assert.equal(model.reportPeriod("week", "2026-10-19")[0], "2026-10-12");
assert.equal(model.reportPeriod("month", "2026-11-01")[0], "2026-10-01");
assert.equal(model.priorPeriod("2026-10-19", "2026-10-22")[0], "2026-10-15");
const roster = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Ben" },
  { id: "c", name: "Cora" },
];
const bundle = {
  timezone: "America/Chicago",
  roster,
  configs: roster.map((person) => ({
    profile_id: person.id,
    compensation_type: "hourly",
    effective_from: "2026-01-01",
  })),
  mappings: roster.flatMap((person, index) => [
    {
      source: "ipoint",
      profile_id: person.id,
      external_employee_id: person.name,
    },
    {
      source: "quickbooks_time",
      profile_id: person.id,
      external_employee_id: String(index + 1),
    },
  ]),
  sources: [],
  holidays: [],
  native_jobs: [],
  native_payroll: [],
  snapshots: [
    {
      kind: "technician",
      day: "2026-10-20",
      payload: {
        records: [
          { technician: "Ada", job_hours: 4 },
          { technician: "Ben", job_hours: 9 },
        ],
      },
    },
    {
      kind: "payroll",
      day: "2026-10-20",
      payload: {
        records: [
          { user_id: 1, worked_hours: 4, leave_hours: 0, flags: [] },
          { user_id: 2, worked_hours: 12, leave_hours: 0, flags: [] },
        ],
      },
    },
  ],
};
const report = model.productionReport(
  bundle,
  "2026-10-20",
  "2026-10-20",
  "2026-10-22",
);
assert.equal(
  report.utilization,
  81.25,
  "team utilization is weighted by available time",
);
assert.equal(model.rankProduction(report.rows, "utilization")[0].name, "Ada");
assert.equal(model.rankProduction(report.rows, "job")[0].name, "Ben");
assert.equal(
  model.rankProduction(report.rows, "job")[2].rank,
  null,
  "unknown is not ranked as zero",
);
assert.equal(
  report.rows[0].previous.job,
  null,
  "missing prior period is not manufactured as zero",
);
const tied = model.rankProduction(
  [
    { ...report.rows[0], utilization: 75.04 },
    { ...report.rows[1], utilization: 75.03 },
  ],
  "utilization",
);
assert.equal(
  tied[0].rank,
  tied[1].rank,
  "ties use the same displayed precision",
);
bundle.snapshots[0].payload.records[0].review_flags = ["unmatched"];
assert.equal(
  model.productionReport(bundle, "2026-10-20", "2026-10-20", "2026-10-22")
    .utilization,
  75,
  "unmatched records retain totals but do not inflate utilization",
);
console.log(
  "Production model: weighted utilization, rankings, ties, unknowns, prior dates and duration formatting passed.",
);
