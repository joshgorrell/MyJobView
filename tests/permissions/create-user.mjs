import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
const bundled = await build({
  entryPoints: ["supabase/functions/create-user/index.ts"],
  bundle: true,
  write: false,
  format: "iife",
  plugins: [
    {
      name: "fixture",
      setup(b) {
        b.onResolve({ filter: /^https:/ }, (a) => ({
          path: a.path,
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
          contents: a.path.includes("/http/")
            ? "export const serve=handler=>globalThis.handler=handler"
            : "export const createClient=()=>globalThis.client",
        }));
      },
    },
  ],
});
async function scenario({
  active = true,
  role = "sales",
  wrongTenant = false,
  payload = {},
} = {}) {
  const calls = [];
  let updated;
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "admin" } } }),
      admin: {
        createUser: async (input) => {
          calls.push(input);
          return {
            data: { user: { id: "new", email: "fixture@example.com" } },
          };
        },
        deleteUser: async () => {},
      },
    },
    rpc: async () => ({ error: null }),
    from(table) {
      const filters = {};
      let update;
      const result = () =>
        table === "roles"
          ? {
              data: wrongTenant ? null : { id: "role", role_key: role },
              error: null,
            }
          : update
            ? ((updated = update), { error: null })
            : filters.id === "admin"
              ? {
                  data: {
                    role: "admin",
                    organization_id: "org",
                    is_active: active,
                  },
                  error: null,
                }
              : { data: { id: "new", username: "fixture" }, error: null };
      const q = new Proxy(
        {},
        {
          get(_, key) {
            if (key === "then")
              return (resolve, reject) =>
                Promise.resolve(result()).then(resolve, reject);
            if (key === "eq")
              return (k, v) => {
                filters[k] = v;
                return q;
              };
            if (key === "update")
              return (v) => {
                update = v;
                return q;
              };
            if (key === "single" || key === "maybeSingle")
              return () => Promise.resolve(result());
            return () => q;
          },
        },
      );
      return q;
    },
  };
  const context = {
    client,
    Request,
    Response,
    Deno: { env: { get: () => "" } },
    console: { log() {}, error() {} },
    setTimeout: (fn) => fn(),
  };
  runInNewContext(bundled.outputFiles[0].text, context);
  const response = await context.handler(
    new Request("https://fixture/create-user", {
      method: "POST",
      headers: {
        Authorization: "Bearer fixture",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "fixture@example.com",
        password: "fixture",
        full_name: "Fixture",
        role,
        role_id: "role",
        ...payload,
      }),
    }),
  );
  return { response, calls, updated, body: await response.json() };
}
for (const input of [
  { active: false },
  { wrongTenant: true },
  { payload: { role: "finance" } },
]) {
  const result = await scenario(input);
  assert.equal(result.calls.length, 0);
  assert.ok(result.body.error);
}
const sales = await scenario();
assert.equal(sales.body.success, true);
assert.equal(sales.updated.can_create_proposals, true);
assert.equal(sales.updated.can_create_work_orders, false);
assert.equal(sales.updated.can_edit_products, false);
assert.equal(sales.updated.can_view_all_tasks, false);
assert.equal(sales.updated.can_view_all_pipeline, false);
assert.equal(sales.updated.proposal_visibility_scope, "own");
assert.equal(sales.calls[0].user_metadata.organization_id, "org");
const finance = await scenario({ role: "finance" });
assert.equal(finance.updated.can_create_proposals, false);
assert.equal(finance.updated.can_edit_products, true);
const explicit = await scenario({
  payload: {
    can_create_proposals: false,
    can_create_work_orders: true,
    can_create_purchase_orders: true,
    can_view_all_tasks: true,
  },
});
assert.equal(explicit.updated.can_create_proposals, false);
assert.equal(explicit.updated.can_create_work_orders, true);
assert.equal(explicit.updated.can_create_purchase_orders, true);
assert.equal(explicit.updated.can_view_all_tasks, true);
console.log(
  "New-user role validation, disabled-admin denial, tenant metadata, conservative defaults and explicitly selected permissions passed.",
);
