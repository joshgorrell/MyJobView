import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { PurchasingDocumentModal } from "./PurchasingDocumentModal";
export function QuoteRequests() {
  const [quotes, setQuotes] = useState<any[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState("");
  async function load() {
    const r = await supabase
      .from("purchase_orders")
      .select(
        "id,po_number,created_at,po_items(id),purchase_quote_vendors(id,quoted_at),converted:purchase_orders!purchase_orders_source_quote_id_fkey(id,po_number)",
      )
      .eq("document_type", "rfq")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    if (r.error) setError(r.error.message);
    else setQuotes(r.data || []);
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Quote Requests</h3>
      <p className="text-sm text-gray-600">
        Create from selected product requests. Compare several vendors before
        choosing one PO.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {!quotes.length && (
        <p className="text-sm text-gray-500">No quote requests yet.</p>
      )}
      {quotes.map((q) => (
        <button
          key={q.id}
          onClick={() => setSelected(q.id)}
          className="w-full border rounded p-3 text-left flex flex-wrap justify-between gap-2"
        >
          <strong>{q.po_number.replace(/^PO/, "RFQ")}</strong>
          <span>
            {q.po_items.length} job lines ·{" "}
            {q.purchase_quote_vendors.filter((b: any) => b.quoted_at).length}/
            {q.purchase_quote_vendors.length} quotes ·{" "}
            {q.converted?.[0] ? "PO " + q.converted[0].po_number : "Open"}
          </span>
        </button>
      ))}
      {selected && (
        <PurchasingDocumentModal
          documentId={selected}
          onClose={() => setSelected(null)}
          onSuccess={load}
        />
      )}
    </section>
  );
}
