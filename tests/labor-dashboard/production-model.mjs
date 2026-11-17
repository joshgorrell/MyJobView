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

// Salaried production must use actual clock records rather than scheduled capacity.
const nativeBundle = {...bundle, configs:[{profile_id:'a',compensation_type:'salary',expected_weekly_hours:40,work_days:null,effective_from:'2026-01-01'}],
  sources:[{source:'ipoint',native_from:'2026-01-01'},{source:'quickbooks_time',native_from:'2026-01-01'}],
  native_jobs:[{profile_id:'a',day:'2026-10-20',hours:6,shop_hours:1,training_hours:0.5}],
  native_payroll:[{profile_id:'a',day:'2026-10-20',hours:10,leave_hours:2,needs_review:false}]};
const nativeRow=()=>model.productionReport(nativeBundle,'2026-10-20','2026-10-20','2026-10-22').rows[0];
assert.equal(nativeRow().payroll,10);assert.equal(nativeRow().utilization,60);
assert.equal(nativeRow().shop,1);assert.equal(nativeRow().training,0.5);assert.equal(nativeRow().unaccounted,2.5);
assert.equal(labor.laborHistory(nativeBundle,'a','2026-10-20','2026-10-20','2026-10-22')[0].payroll,6,'legacy payroll dashboard schedule behavior stays intact');
nativeBundle.configs=[];assert.equal(nativeRow().utilization,60,'actual clocks do not require salary configuration');
nativeBundle.native_payroll=[];assert.equal(nativeRow().payroll,null);assert.equal(nativeRow().unaccounted,null);
nativeBundle.native_payroll=[{profile_id:'a',day:'2026-10-20',hours:8,leave_hours:0,needs_review:false}];
nativeBundle.native_jobs[0].hours=0;assert.equal(nativeRow().utilization,0);assert.equal(nativeRow().unaccounted,6.5);
nativeBundle.native_jobs[0].hours=9;assert.equal(nativeRow().excess,2.5);assert.equal(nativeRow().unaccounted,0);assert.equal(nativeRow().utilization,null);
nativeBundle.native_jobs[0].hours=6;nativeBundle.native_jobs[0].review_flags=['Incomplete or unapproved time entries'];assert.equal(nativeRow().unaccounted,null);
delete nativeBundle.native_jobs[0].review_flags;delete nativeBundle.native_jobs[0].shop_hours;
assert.equal(nativeRow().shop,null);assert.equal(nativeRow().unaccounted,null,'missing categories never become invented shop time');
const historicalRow=model.productionReport({...bundle,configs:[{profile_id:'a',compensation_type:'salary',expected_weekly_hours:40,effective_from:'2026-01-01'}]},'2026-10-20','2026-10-20','2026-10-22').rows[0];
assert.equal(historicalRow.payroll,4,'imported actual worked hours apply to salaries');assert.equal(historicalRow.shop,null);assert.equal(historicalRow.unaccounted,null);
console.log('Actual clock breakdown: salary/hourly actuals, leave exclusion, missing clocks/categories, shop/training, zero job days and excess reconciliation passed.');

nativeBundle.native_jobs=[{profile_id:'a',day:'2026-10-20',hours:6,shop_hours:1,training_hours:0}, {profile_id:'a',day:'2026-10-21',hours:7,shop_hours:2,training_hours:0}];
nativeBundle.native_payroll=[{profile_id:'a',day:'2026-10-20',hours:8,leave_hours:0,needs_review:false},{profile_id:'a',day:'2026-10-21',hours:8,leave_hours:0,needs_review:false}];
const twoDays=model.productionReport(nativeBundle,'2026-10-20','2026-10-21','2026-10-22').rows[0];
assert.equal(twoDays.unaccounted,1);assert.equal(twoDays.excess,1,'excess on one date must not cancel an unaccounted gap on another');

// A verified imported salary row without punches uses the approved 40-hour model,
// while measured positive or native salary clocks remain actuals.
const salaryImported = {...bundle,configs:[{profile_id:'a',compensation_type:'salary',expected_weekly_hours:40,effective_from:'2026-01-01'}],
  snapshots:bundle.snapshots.map(s=>s.kind==='payroll'?{...s,payload:{records:s.payload.records.map(r=>({...r,salaried:true,worked_hours:0}))}}:s)};
let salaryResult=model.productionReport(salaryImported,'2026-10-20','2026-10-20','2026-10-22').rows[0];
assert.equal(salaryResult.payroll,8,'Imported salary capacity is not shown as zero payroll');
assert.equal(salaryResult.assumedDays,1);assert.equal(salaryResult.clockDays,0);
assert.equal(salaryResult.unaccounted,null,'Salary capacity must not create unaccounted clock time');
assert.equal(salaryResult.history[0].payrollSource,'Salary assumption');
salaryImported.holidays=['2026-10-20'];assert.equal(model.productionReport(salaryImported,'2026-10-20','2026-10-20','2026-10-22').rows[0].payroll,0);
// Employee records remain available through the cutoff; later job time is MJV-only.
const contractor={...bundle,roster:bundle.roster.map(r=>({...r,employment_classification:'non_employee',employee_until:'2026-10-19'})),native_jobs:[{profile_id:'a',day:'2026-10-20',hours:2,shop_hours:0,training_hours:0}]};
const contractorResult=model.productionReport(contractor,'2026-10-20','2026-10-20','2026-10-22').rows[0];
assert.equal(contractorResult.job,2);assert.equal(contractorResult.payroll,null);assert.equal(contractorResult.utilization,null);
assert.equal(contractorResult.history[0].jobSource,'MJV');assert.equal(contractorResult.history[0].flags.some(f=>f.includes('Payroll/leave')),false);
const legacyContractor=model.productionReport({...contractor,native_jobs:[]},'2026-10-20','2026-10-20','2026-10-22').rows[0];
assert.equal(legacyContractor.job,bundle.snapshots.find(s=>s.kind==='technician').payload.records[0].job_hours,'Preserved iPoint history is not erased by subcontractor classification');
assert.equal(legacyContractor.payroll,null);
contractor.roster=contractor.roster.map(r=>({...r,employee_until:'2026-10-20'}));
assert.equal(model.productionReport(contractor,'2026-10-20','2026-10-20','2026-10-22').rows[0].payroll,4,'Cutoff day retains employee payroll');
console.log('Imported salary model and employee/subcontractor cutover passed.');
