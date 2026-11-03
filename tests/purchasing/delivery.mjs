import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
const source = (
  await readFile(
    "supabase/functions/send-purchase-order-email/index.ts",
    "utf8",
  )
).replace(/^import .*;$/gm, "");
const js = (
  await build({
    stdin: { contents: source, loader: "ts" },
    write: false,
    format: "iife",
  })
).outputFiles[0].text;
async function execute({
  permission = true,
  type = "po",
  provider = true,
  foreign = false,
  bid = true,
  authorization = true,
} = {}) {
  let handler;
  const sent = [],
    updates = [];
  const doc = {
    id: "po",
    organization_id: "org",
    vendor_id: "vendor",
    document_type: type,
    status: "draft",
    po_number: "PO-100",
    po_items: [],
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "staff" } } }) },
    from(table) {
      const filters = {};
      let patch;
      const q = {
        select: () => q,
        eq: (k, v) => {
          filters[k] = v;
          return q;
        },
        update: (p) => {
          patch = p;
          return q;
        },
        single: async () => ({
          data:
            table === "profiles"
              ? {
                  organization_id: "org",
                  role: "technician",
                  can_create_purchase_orders: permission,
                }
              : table === "purchase_orders"
                ? foreign
                  ? null
                  : doc
                : table === "purchase_quote_vendors"
                  ? bid
                    ? { id: "bid", vendor_id: "vendor2" }
                    : null
                  : table === "vendors"
                    ? { vendor_name: "Vendor", email: "vendor@example.com" }
                    : table === "company_settings"
                      ? {
                          company_name: "Company",
                          from_email: "orders@example.com",
                        }
                      : null,
          error: null,
        }),
        then: (resolve) => {
          updates.push({ table, patch, filters });
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  vm.runInNewContext(js, {
    Deno: {
      env: { get: () => "" },
      serve: (fn) => {
        handler = fn;
      },
    },
    createClient: () => db,
    sendSystemEmail: async (payload) => {
      sent.push(payload);
      return { ok: provider };
    },
    renderPurchaseDocument: () => ({
      subject: "Document",
      html: "<p>Document</p>",
    }),
    Response,
    TextEncoder,
    crypto: webcrypto,
    Uint8Array,
  });
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: authorization ? { Authorization: "Bearer token" } : {},
      body: JSON.stringify({ poId: "po", vendorId: "vendor2" }),
    }),
  );
  return { status: response.status, sent, updates };
}
for (const args of [
  { permission: false },
  { foreign: true },
  { authorization: false },
  { type: "rfq", bid: false },
]) {
  const result = await execute(args);
  assert.ok(result.status >= 400);
  assert.equal(result.sent.length, 0);
  assert.equal(result.updates.length, 0);
}
const failure = await execute({ provider: false });
assert.equal(failure.status, 500);
assert.equal(failure.updates.length, 0);
const po = await execute();
assert.equal(po.status, 200);
assert.equal(po.updates[0].patch.status, "submitted");
assert.equal(JSON.parse(po.sent[0].body).to[0], "vendor@example.com");
assert.ok(po.sent[0].headers["Idempotency-Key"]);
const rfq = await execute({ type: "rfq" });
assert.equal(rfq.status, 200);
assert.equal(rfq.updates[0].table, "purchase_quote_vendors");
assert.ok(rfq.updates[0].patch.sent_at);
assert.equal(rfq.updates[0].patch.status, undefined);
console.log(
  "Purchasing delivery passed: authorization, tenant and vendor checks, provider failure, PO issue and RFQ-only delivery tracking.",
);
