import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const values = [],
  dependencies = [],
  effects = [];
let cursor = 0;
const react = {
  useState(initial) {
    const i = cursor++;
    if (!(i in values)) values[i] = initial;
    return [
      values[i],
      (v) => {
        values[i] = typeof v === "function" ? v(values[i]) : v;
      },
    ];
  },
  useRef(initial) {
    const i = cursor++;
    return (values[i] ||= { current: initial });
  },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!dependencies[i] || deps.some((v, j) => v !== dependencies[i][j])) {
      dependencies[i] = deps;
      effects.push(fn);
    }
  },
};
const jsx = (type, props) => ({ type, props });
let fail = false;
const calls = [];
const base = {
  commissionRecordId: "sales",
  collectionId: "receipt",
  invoiceId: "invoice",
  invoiceNumber: "INV-1",
  customerName: "Customer",
  paymentDate: "2026-10-02",
  paymentMethod: "ach",
  employeeId: "rep",
  employeeName: "Rep",
  roleType: "sales_projects",
  effectiveRate: 5,
  grossSale: 500,
  ccFeeDeducted: 0,
  netCommissionable: 500,
  commissionAmount: 25.01,
  approvalStatus: "pending_approval",
};
const fixture = [
  base,
  {
    ...base,
    commissionRecordId: "pm",
    employeeId: "pm",
    employeeName: "PM",
    roleType: "pm",
    effectiveRate: 1,
    commissionAmount: 5,
  },
];
const supabase = {
  from(table) {
    const q = {
      select() {
        return q;
      },
      eq() {
        return q;
      },
      async maybeSingle() {
        return {
          data: {
            payroll_frequency: "bi-weekly",
            payroll_start_date: "2026-07-03",
          },
          error: null,
        };
      },
      async single() {
        return { data: { timezone: "America/Chicago" }, error: null };
      },
    };
    return q;
  },
  async rpc(name, args) {
    calls.push({ name, args });
    return fail
      ? { data: null, error: Error("Report unavailable") }
      : {
          data: { lines: fixture, legacyCount: 2, adjustmentCount: 1 },
          error: null,
        };
  },
};
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      "src/components/Commissions/CommissionReportPage.tsx",
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText,
  {
    module,
    exports: module.exports,
    console,
    Intl,
    Date,
    Error,
    Map,
    window: { print() {} },
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime")
        return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "lucide-react")
        return new Proxy({}, { get: (_, key) => key });
      if (name === "../../lib/supabase") return { supabase };
      if (name === "../../contexts/AuthContext")
        return { useAuth: () => ({ profile: { organization_id: "org" } }) };
      if (name === "../../lib/commissionPeriods")
        return {
          organizationToday: () => "2026-10-02",
          commissionPeriods: () => [
            { start: "2026-09-25", end: "2026-10-08", label: "Current period" },
          ],
        };
      throw Error(name);
    },
  },
);
const render = () => {
  cursor = 0;
  return module.exports.CommissionReportPage();
};
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (!tree || typeof tree !== "object")
    return tree == null ? "" : String(tree);
  return text(tree.props?.children);
}
render();
for (const effect of effects.splice(0)) effect();
for (let i = 0; i < 8; i++) await new Promise(setImmediate);
let tree = render();
await nodes(tree)
  .find((n) => n.type === "button" && text(n).includes("Run Report"))
  .props.onClick();
tree = render();
assert.equal(calls[0].name, "get_commission_period_report");
assert.equal(calls[0].args.p_start, "2026-09-25");
assert.ok(
  text(tree).includes("$30.01"),
  "preserves server-rounded commission amounts without recalculation",
);
assert.ok(
  text(tree).includes("Commissionable collections$500.00"),
  "receipt revenue not doubled across recipients",
);
assert.ok(
  text(tree).includes("historical commission record(s)"),
  "legacy reconciliation warning visible",
);
assert.ok(
  text(tree).includes("Saved report overrides or deductions"),
  "saved adjustments not silently lost",
);
assert.ok(
  !nodes(tree).some(
    (n) => n.type === "button" && text(n).includes("Add Deduction"),
  ),
  "report-only mutation removed",
);
fail = true;
await nodes(tree)
  .find((n) => n.type === "button" && text(n).includes("Run Report"))
  .props.onClick();
tree = render();
assert.ok(
  text(tree).includes("Report unavailable"),
  "query failure is visible, not an empty report",
);
console.log(
  "Commission report runtime: payment period RPC, server rounding, receipt deduplication, legacy/adjustment warnings and visible errors passed.",
);
