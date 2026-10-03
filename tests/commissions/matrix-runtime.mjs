import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const nodes = (tree) =>
  !tree || typeof tree !== "object"
    ? []
    : Array.isArray(tree)
      ? tree.flatMap(nodes)
      : [tree, ...nodes(tree.props?.children)];
const text = (tree) =>
  Array.isArray(tree)
    ? tree.map(text).join("")
    : !tree || typeof tree !== "object"
      ? tree == null
        ? ""
        : String(tree)
      : text(tree.props?.children);
function harness(file, exported, supabase, props = {}) {
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
        (v) => (values[i] = typeof v === "function" ? v(values[i]) : v),
      ];
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
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      console,
      require(name) {
        if (name === "react") return react;
        if (name === "react/jsx-runtime")
          return { jsx, jsxs: jsx, Fragment: "fragment" };
        if (name === "../../lib/supabase") return { supabase };
        if (name === "../../contexts/AuthContext")
          return {
            useAuth: () => ({
              profile: { organization_id: "org", role: "admin" },
            }),
          };
        throw Error(name);
      },
    },
  );
  return {
    render() {
      cursor = 0;
      return module.exports[exported](props);
    },
    async flush() {
      while (effects.length) effects.shift()();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}
const calls = [];
let loadFail = false;
const db = {
  from() {
    const q = {
      select() {
        return q;
      },
      eq() {
        return q;
      },
      async maybeSingle() {
        return loadFail
          ? { data: null, error: Error("Settings unavailable") }
          : { data: { active_matrix_policy_id: null }, error: null };
      },
    };
    return q;
  },
  async rpc(name, args) {
    calls.push({ name, args });
    return { data: "new-policy", error: null };
  },
};
const matrix = harness(
  "src/components/Commissions/DealerCommissionMatrix.tsx",
  "DealerCommissionMatrix",
  db,
);
let tree = matrix.render();
await matrix.flush();
tree = matrix.render();
assert.ok(text(tree).includes("Review these example rates"));
const method = nodes(tree).find(
  (n) => n.props?.["aria-label"] === "Proposal / project calculation method",
);
method.props.onChange({ target: { value: "sliding" } });
tree = matrix.render();
assert.ok(text(tree).includes("Below first tier"));
const pool = nodes(tree).find(
  (n) => n.props?.["aria-label"] === "Proposal / project tier 5 pool percent",
);
pool.props.onChange({ target: { value: "8" } });
tree = matrix.render();
const retailDesign = nodes(tree).find(
  (n) => n.props?.["aria-label"] === "Retail design percent",
);
assert.equal(retailDesign.props.disabled, true);
await nodes(tree)
  .find((n) => n.type === "button" && text(n) === "Activate reviewed matrix")
  .props.onClick();
tree = matrix.render();
assert.equal(calls[0].name, "save_commission_matrix");
assert.equal(calls[0].args.p_rules.proposal.method, "sliding");
assert.equal(calls[0].args.p_rules.proposal.tiers[5].pool, 8);
assert.equal(calls[0].args.p_rules.retail.design, 0);
assert.ok(text(tree).includes("Matrix version activated"));
loadFail = true;
const failed = harness(
  "src/components/Commissions/DealerCommissionMatrix.tsx",
  "DealerCommissionMatrix",
  db,
);
failed.render();
await failed.flush();
const failedTree = failed.render();
assert.ok(text(failedTree).includes("Settings unavailable"));
assert.equal(
  nodes(failedTree).find(
    (n) => n.type === "button" && text(n) === "Activate reviewed matrix",
  ).props.disabled,
  true,
);
let sale = {
  id: "sale",
  sale_type: "service",
  salesperson_id: "rep",
  designer_id: "designer",
  pm_id: null,
  revenue: 1000,
  total: 1100,
  approved_cost: null,
  state: "review",
  snapshot: null,
  source_kind: "invoice",
};
const sourceCalls = [];
const sourceDb = {
  async rpc(name, args) {
    sourceCalls.push({ name, args });
    if (name === "review_commission_sale") {
      sale = {
        ...sale,
        approved_cost: args.p_cost,
        state: "active",
        snapshot: { rule: {} },
      };
      return { data: "sale", error: null };
    }
    return {
      data: {
        enabled: true,
        sale,
        people: [
          { id: "rep", name: "Rep", eligible: true },
          { id: "designer", name: "Designer", eligible: true },
        ],
        calculation: { hold: true },
      },
      error: null,
    };
  },
};
const panel = harness(
  "src/components/Commissions/CommissionSalePanel.tsx",
  "CommissionSalePanel",
  sourceDb,
  { sourceKind: "invoice", sourceId: "invoice" },
);
panel.render();
await panel.flush();
tree = panel.render();
assert.ok(text(tree).includes("Commission sale review"));
const costInput = nodes(tree).find(
  (n) => n.props?.["aria-label"] === "Approved direct costs",
);
costInput.props.onChange({ target: { value: "600" } });
const note = nodes(tree).find(
  (n) =>
    n.props?.placeholder ===
    "Explain the revenue and complete direct-cost review",
);
note.props.onChange({
  target: { value: "Reviewed complete materials and labor" },
});
tree = panel.render();
const reviewButton = nodes(tree).find(
  (n) => n.type === "button" && text(n) === "Review finalized sale",
);
assert.equal(reviewButton.props.disabled, false);
await reviewButton.props.onClick();
tree = panel.render();
const saved = sourceCalls.find((c) => c.name === "review_commission_sale").args;
assert.equal(saved.p_cost, 600);
assert.equal(saved.p_designer, "designer");
assert.equal(saved.p_rep, "rep");
assert.equal(saved.p_finalize, true);
assert.equal(saved.p_revenue, 1000);
assert.equal(saved.p_total, 1100);
assert.ok(
  nodes(tree)
    .filter((n) => n.type === "select")
    .every((n) => n.props.disabled),
);
assert.ok(text(tree).includes("Commission entitlement reviewed"));
console.log(
  "Matrix UI runtime: tier editing, retail design prohibition, version activation, load failure, direct-cost review and locked attribution passed.",
);
