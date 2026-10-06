export const escapePurchaseText = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function renderPurchaseDocument(
  doc: any,
  vendor: any,
  companyName: string,
) {
  const e = escapePurchaseText,
    quote = doc.document_type === "rfq",
    number = quote ? doc.po_number.replace(/^PO/, "RFQ") : doc.po_number;
  const address = (prefix: string) =>
    [
      doc[prefix + "_name"],
      doc[prefix + "_address"],
      [doc[prefix + "_city"], doc[prefix + "_state"], doc[prefix + "_zip"]]
        .filter(Boolean)
        .join(", "),
    ]
      .filter(Boolean)
      .map((x) => e(x))
      .join("<br>");
  const rows = (doc.po_items || [])
    .map(
      (l: any) =>
        `<tr><td>${e(l.job_reference || "Stock")}</td><td>${e(l.product_name)}<br>${e(l.model_number)}</td><td>${e(l.quantity)}</td>${quote ? "<td>Please quote</td><td>Please quote</td>" : `<td>$${Number(l.unit_price || 0).toFixed(2)}</td><td>$${Number(l.total_price || 0).toFixed(2)}</td>`}</tr>`,
    )
    .join("");
  const title = quote ? "Request for Quote" : "Purchase Order";
  return {
    subject: `${title} ${number} — ${companyName}`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111"><h1>${e(companyName)}</h1><h2>${title} ${e(number)}</h2><p>Vendor: ${e(vendor.vendor_name)}<br>Date: ${e(doc.order_date)}${doc.expected_date ? "<br>Needed by: " + e(doc.expected_date) : ""}</p><table style="width:100%"><tr><td><strong>Bill To</strong><p>${address("bill_to")}</p></td><td><strong>Ship To</strong><p>${address("ship_to")}</p></td></tr></table><p>${quote ? "Please provide unit prices for each job line, availability, lead time, shipping and tax. This is a quote request, not authorization to place an order." : "Please process the following purchase order. Keep each job line identified on the packing slip."}</p><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Job</th><th>Item / Model</th><th>Quantity</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>${quote ? "" : `<p>Subtotal: $${Number(doc.subtotal || 0).toFixed(2)}<br>Shipping: $${Number(doc.shipping_cost || 0).toFixed(2)}<br>Tax: $${Number(doc.tax_amount || 0).toFixed(2)}<br><strong>Total: $${Number(doc.total || 0).toFixed(2)}</strong></p>`}${doc.external_note ? "<p><strong>Vendor instructions</strong><br>" + e(doc.external_note).replaceAll("\n", "<br>") + "</p>" : ""}</body></html>`,
  };
}
