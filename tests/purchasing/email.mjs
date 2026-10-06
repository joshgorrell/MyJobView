import assert from "node:assert/strict";
import { build } from "esbuild";
const bundled = await build({
  entryPoints: ["supabase/functions/_shared/purchase-document.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { renderPurchaseDocument } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
const doc = {
  po_number: "PO-123",
  document_type: "po",
  order_date: "2026-10-06",
  internal_note: "SECRET INTERNAL",
  external_note: "Ship <carefully>",
  bill_to_name: "HQ",
  ship_to_name: "Warehouse",
  subtotal: 90,
  shipping_cost: 5,
  tax_amount: 2,
  total: 97,
  po_items: ["Jones", "Weller", "Wilson"].map((job_reference, n) => ({
    job_reference,
    product_name: "Same product",
    model_number: "MODEL",
    quantity: [3, 5, 1][n],
    unit_price: 10,
    total_price: [30, 50, 10][n],
  })),
};
const vendor = { vendor_name: "Vendor <A>" };
const po = renderPurchaseDocument(doc, vendor, "Company");
for (const job of ["Jones", "Weller", "Wilson"])
  assert.ok(po.html.includes(job));
assert.equal((po.html.match(/Same product/g) || []).length, 3);
assert.ok(po.html.includes("$97.00"));
assert.ok(po.html.includes("Vendor &lt;A&gt;"));
assert.ok(po.html.includes("Ship &lt;carefully&gt;"));
assert.ok(!po.html.includes("SECRET INTERNAL"));
const rfq = renderPurchaseDocument(
  { ...doc, document_type: "rfq" },
  vendor,
  "Company",
);
assert.ok(rfq.subject.includes("RFQ-123"));
assert.ok(rfq.html.includes("not authorization to place an order"));
assert.ok(rfq.html.includes("Please quote"));
assert.ok(!rfq.html.includes("$97.00"));
assert.ok(!rfq.html.includes("$10.00"));
assert.ok(!rfq.html.includes("SECRET INTERNAL"));
console.log(
  "Purchasing email templates passed: three job lines, pricing only on POs, escaped vendor instructions, no internal notes.",
);
