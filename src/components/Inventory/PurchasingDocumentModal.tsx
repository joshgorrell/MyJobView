import { useAuth } from "../../contexts/AuthContext";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { formatCurrency } from "../../lib/utils";
import { X } from "lucide-react";

type Line = {
  id: string;
  product_name: string;
  model_number?: string;
  quantity: number;
  unit_price: number;
  job_reference: string;
  vendor?: string;
};
export function PurchasingDocumentModal({
  requestItems,
  documentId,
  onClose,
  onSuccess,
}: {
  requestItems?: Array<{ id: string; job_reference: string }>;
  documentId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [doc, setDoc] = useState<any>(null),
    [lines, setLines] = useState<Line[]>([]),
    [vendors, setVendors] = useState<any[]>([]),
    [warehouses, setWarehouses] = useState<any[]>([]),
    [offices, setOffices] = useState<any[]>([]),
    [bids, setBids] = useState<any[]>([]);
  const [quote, setQuote] = useState(false),
    [vendorIds, setVendorIds] = useState<string[]>([]),
    [warehouse, setWarehouse] = useState(""),
    [office, setOffice] = useState(""),
    [expected, setExpected] = useState(""),
    [external, setExternal] = useState(""),
    [internal, setInternal] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const { profile } = useAuth();
  const [activeDocumentId, setActiveDocumentId] = useState(documentId);
  const retry = useRef(crypto.randomUUID());
  useEffect(() => {
    void load();
  }, [activeDocumentId]);
  async function load() {
    setLoading(true);
    try {
      const [v, w, o] = await Promise.all([
        supabase
          .from("vendors")
          .select("id,vendor_name,email")
          .eq("organization_id", profile?.organization_id)
          .order("vendor_name"),
        supabase
          .from("warehouses")
          .select("id,name")
          .eq("organization_id", profile?.organization_id),
        supabase
          .from("company_offices")
          .select("id,office_name,is_headquarters")
          .eq("organization_id", profile?.organization_id),
      ]);
      for (const r of [v, w, o]) if (r.error) throw r.error;
      setVendors(v.data || []);
      setWarehouses(w.data || []);
      setOffices(o.data || []);
      setWarehouse(w.data?.[0]?.id || "");
      setOffice(
        o.data?.find((x) => x.is_headquarters)?.id || o.data?.[0]?.id || "",
      );
      if (activeDocumentId) {
        const r = await supabase
          .from("purchase_orders")
          .select(
            "*,po_items(*),purchase_quote_vendors(*),converted:purchase_orders!purchase_orders_source_quote_id_fkey(id),vendors(vendor_name),warehouses(name)",
          )
          .eq("id", activeDocumentId)
          .single();
        if (r.error) throw r.error;
        setDoc(r.data);
        setQuote(r.data.document_type === "rfq");
        setLines(r.data.po_items || []);
        setBids(r.data.purchase_quote_vendors || []);
      } else {
        const r = await supabase
          .from("product_request_items")
          .select("*")
          .in(
            "id",
            (requestItems || []).map((x) => x.id),
          );
        if (r.error) throw r.error;
        const ls = (r.data || []).map((x) => ({
          id: x.id,
          product_name: x.product_name,
          model_number: x.model_number,
          quantity: Number(x.quantity_requested),
          unit_price:
            Number(x.estimated_cost || 0) / Number(x.quantity_requested),
          job_reference:
            requestItems?.find((i) => i.id === x.id)?.job_reference || "Stock",
          vendor: x.vendor,
        }));
        setLines(ls);
        const names = [...new Set(ls.map((x) => x.vendor))];
        if (names.length === 1) {
          const match = v.data?.find(
            (x) => x.vendor_name.toLowerCase() === names[0]?.toLowerCase(),
          );
          if (match) setVendorIds([match.id]);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    await perform(async () => {
      if (!vendorIds.length || !warehouse || !office)
        throw Error("Select vendors, a warehouse and an office.");
      const r = await supabase.rpc("create_request_purchase_document", {
        p_items: lines.map((l) => ({
          id: l.id,
          unit_price: l.unit_price,
          job_reference: l.job_reference,
        })),
        p_vendor_ids: vendorIds,
        p_warehouse_id: warehouse,
        p_quote: quote,
        p_header: {
          office_id: office,
          expected_date: expected,
          external_note: external,
          internal_note: internal,
        },
        p_retry: retry.current,
      });
      if (r.error) throw r.error;
      onSuccess();
      setActiveDocumentId(r.data);
    });
  }
  async function email(vendorId?: string) {
    await perform(async () => {
      const r = await supabase.functions.invoke("send-purchase-order-email", {
        body: { poId: doc.id, vendorId },
      });
      if (r.error || r.data?.error)
        throw Error(r.data?.error || r.error?.message);
      await load();
      onSuccess();
    });
  }
  async function saveBid(bid: any) {
    await perform(async () => {
      if (
        lines.some(
          (l) =>
            bid.unit_prices[l.id] === undefined ||
            bid.unit_prices[l.id] === "" ||
            Number(bid.unit_prices[l.id]) < 0,
        )
      )
        throw Error(
          "Enter a price for every job line, including zero if free.",
        );
      const r = await supabase
        .from("purchase_quote_vendors")
        .update({
          unit_prices: bid.unit_prices,
          shipping_cost: Number(bid.shipping_cost),
          tax_amount: Number(bid.tax_amount),
          lead_time: bid.lead_time,
          availability: bid.availability,
          notes: bid.notes,
          quoted_at: new Date().toISOString(),
        })
        .eq("id", bid.id);
      if (r.error) throw r.error;
      await load();
    });
  }
  async function convert(bid: any) {
    await perform(async () => {
      const r = await supabase.rpc("convert_purchase_quote", {
        p_quote_id: doc.id,
        p_vendor_id: bid.vendor_id,
      });
      if (r.error) throw r.error;
      onSuccess();
      setActiveDocumentId(r.data);
    });
  }
  const converted = doc?.document_type === "rfq" && doc?.converted?.length > 0;
  async function emailAll() {
    await perform(async () => {
      for (const b of bids.filter((b) => !b.sent_at)) {
        const r = await supabase.functions.invoke("send-purchase-order-email", {
          body: { poId: doc.id, vendorId: b.vendor_id },
        });
        if (r.error || r.data?.error) {
          await load();
          throw Error(r.data?.error || r.error?.message);
        }
      }
      await load();
      onSuccess();
    });
  }
  const total = (bid: any) =>
    lines.reduce(
      (s, l) =>
        s +
        Math.round(Number(bid.unit_prices[l.id] || 0) * l.quantity * 100) / 100,
      0,
    ) +
    Number(bid.shipping_cost || 0) +
    Number(bid.tax_amount || 0);
  const updateBid = (id: string, patch: any) =>
    setBids((bs) =>
      bs.map((b) => (b.id === id ? { ...b, ...patch, quoted_at: null } : b)),
    );
  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto p-3 sm:p-6">
      <div className="bg-white rounded-xl max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <header className="flex justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {quote ? "Request for Quote" : "Purchase Order"}
              {doc
                ? " · " +
                  (quote ? doc.po_number.replace(/^PO/, "RFQ") : doc.po_number)
                : ""}
            </h2>
            <p className="text-sm text-gray-600">
              Each job stays on its own line. Quote requests do not place an
              order.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2">
            <X />
          </button>
        </header>
        {error && (
          <p role="alert" className="text-red-700 bg-red-50 p-3 rounded">
            {error}
          </p>
        )}
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            {!doc && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setQuote(false);
                      setVendorIds((ids) => ids.slice(0, 1));
                    }}
                    className={`p-2 rounded border ${!quote ? "bg-blue-100" : ""}`}
                  >
                    Create PO
                  </button>
                  <button
                    onClick={() => setQuote(true)}
                    className={`p-2 rounded border ${quote ? "bg-blue-100" : ""}`}
                  >
                    Request Quotes
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="text-sm">
                    Warehouse
                    <select
                      aria-label="Warehouse"
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                      className="w-full border rounded p-2"
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Bill / Ship to office
                    <select
                      aria-label="Office"
                      value={office}
                      onChange={(e) => setOffice(e.target.value)}
                      className="w-full border rounded p-2"
                    >
                      {offices.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.office_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Needed by
                    <input
                      type="date"
                      value={expected}
                      onChange={(e) => setExpected(e.target.value)}
                      className="w-full border rounded p-2"
                    />
                  </label>
                </div>
                <fieldset>
                  <legend className="text-sm font-medium">
                    {quote
                      ? "Vendors to quote (select several)"
                      : "Order from vendor"}
                  </legend>
                  <div className="flex flex-wrap gap-3">
                    {vendors.map((v) => (
                      <label key={v.id} className="text-sm border p-2 rounded">
                        <input
                          type={quote ? "checkbox" : "radio"}
                          name="vendor"
                          checked={vendorIds.includes(v.id)}
                          onChange={() =>
                            setVendorIds((ids) =>
                              quote
                                ? ids.includes(v.id)
                                  ? ids.filter((id) => id !== v.id)
                                  : [...ids, v.id]
                                : [v.id],
                            )
                          }
                        />{" "}
                        {v.vendor_name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {doc && (
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <strong>Bill To</strong>
                  <p>{doc.bill_to_name}</p>
                  <p>{doc.bill_to_address}</p>
                  <p>
                    {[doc.bill_to_city, doc.bill_to_state, doc.bill_to_zip]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
                <div>
                  <strong>Ship To</strong>
                  <p>{doc.ship_to_name}</p>
                  <p>{doc.ship_to_address}</p>
                  <p>
                    {[doc.ship_to_city, doc.ship_to_state, doc.ship_to_zip]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            )}
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "Job",
                      "Item / Model",
                      "Quantity",
                      ...(!quote ? ["Unit Price", "Amount"] : []),
                    ].map((h) => (
                      <th key={h} className="p-2 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">{l.job_reference}</td>
                      <td className="p-2">
                        {l.product_name}
                        <span className="block text-xs text-gray-500">
                          {l.model_number}
                        </span>
                      </td>
                      <td className="p-2">{l.quantity}</td>
                      {!quote && (
                        <>
                          <td className="p-2">
                            {doc ? (
                              formatCurrency(l.unit_price)
                            ) : (
                              <input
                                aria-label={`Price for ${l.job_reference}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={l.unit_price}
                                onChange={(e) =>
                                  setLines((ls) =>
                                    ls.map((x) =>
                                      x.id === l.id
                                        ? {
                                            ...x,
                                            unit_price: Number(e.target.value),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                                className="w-24 border rounded p-1"
                              />
                            )}
                          </td>
                          <td className="p-2">
                            {formatCurrency(l.quantity * l.unit_price)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!doc && (
              <>
                <label className="block text-sm">
                  Vendor instructions
                  <textarea
                    value={external}
                    onChange={(e) => setExternal(e.target.value)}
                    className="w-full border rounded p-2"
                  />
                </label>
                <label className="block text-sm">
                  Internal notes
                  <textarea
                    value={internal}
                    onChange={(e) => setInternal(e.target.value)}
                    className="w-full border rounded p-2"
                  />
                </label>
                <button
                  disabled={busy || !lines.length}
                  onClick={create}
                  className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                >
                  {busy
                    ? "Saving…"
                    : quote
                      ? "Save Quote Request"
                      : "Create PO"}
                </button>
              </>
            )}
            {doc && quote && (
              <>
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">Vendor quotes</h3>
                  <button
                    disabled={busy || bids.every((b) => b.sent_at)}
                    onClick={emailAll}
                    className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50"
                  >
                    Email All Unsent Vendors
                  </button>
                </div>
                <p className="text-sm text-gray-600">
                  Send the same request to each vendor. Record prices and
                  compare the delivered total, availability and lead time.
                </p>
                <div className="grid lg:grid-cols-2 gap-4">
                  {bids.map((b) => (
                    <section
                      key={b.id}
                      className="border rounded-lg p-3 space-y-3"
                    >
                      <h4 className="font-semibold">
                        {vendors.find((v) => v.id === b.vendor_id)?.vendor_name}
                      </h4>
                      <button
                        disabled={busy}
                        onClick={() => email(b.vendor_id)}
                        className="border rounded px-3 py-2"
                      >
                        {b.sent_at
                          ? "Resend Quote Request"
                          : "Email Quote Request"}
                      </button>
                      {lines.map((l) => (
                        <label
                          key={l.id}
                          className="flex justify-between gap-2 text-sm items-center"
                        >
                          <span>
                            {l.job_reference} ·{" "}
                            {l.model_number || l.product_name} × {l.quantity}
                          </span>
                          <input
                            aria-label={`Quote price ${b.vendor_id} ${l.job_reference}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={b.unit_prices[l.id] ?? ""}
                            onChange={(e) =>
                              updateBid(b.id, {
                                unit_prices: {
                                  ...b.unit_prices,
                                  [l.id]: e.target.value,
                                },
                              })
                            }
                            className="w-24 border rounded p-1"
                          />
                        </label>
                      ))}
                      {[
                        "shipping_cost",
                        "tax_amount",
                        "lead_time",
                        "availability",
                        "notes",
                      ].map((key) => (
                        <label key={key} className="block text-sm capitalize">
                          {key.replace(/_/g, " ")}
                          <input
                            type={
                              key.endsWith("cost") || key === "tax_amount"
                                ? "number"
                                : "text"
                            }
                            min="0"
                            value={b[key] ?? ""}
                            onChange={(e) =>
                              updateBid(b.id, { [key]: e.target.value })
                            }
                            className="block w-full border rounded p-2"
                          />
                        </label>
                      ))}
                      <p className="font-semibold">
                        Delivered total: {formatCurrency(total(b))}
                        {!b.quoted_at && " (not saved)"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={busy}
                          onClick={() => saveBid(b)}
                          className="border px-3 py-2 rounded"
                        >
                          Save Vendor Quote
                        </button>
                        <button
                          disabled={busy || !b.quoted_at || converted}
                          onClick={() => convert(b)}
                          className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-50"
                        >
                          Select Vendor & Create PO
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
            {doc && !quote && (
              <div className="flex flex-wrap justify-between gap-3">
                <strong>Total: {formatCurrency(doc.total)}</strong>
                <button
                  disabled={
                    busy || !["draft", "submitted", "sent"].includes(doc.status)
                  }
                  onClick={() => email()}
                  className="bg-blue-600 text-white rounded px-3 py-2"
                >
                  Email PO to {doc.vendors?.vendor_name}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
