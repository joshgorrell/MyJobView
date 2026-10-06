import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ReceivePOModal } from "./ReceivePOModal";
export function WarehouseReceive() {
  const [orders, setOrders] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    const r = await supabase
      .from("purchase_orders")
      .select("id,po_number,status,vendors(vendor_name)")
      .eq("document_type", "po")
      .in("status", ["submitted", "sent", "partial"])
      .order("order_date");
    if (r.error) setError(r.error.message);
    else setOrders(r.data || []);
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Warehouse Receiving</h2>
      <p className="text-sm text-gray-600">
        Select an issued PO, then receive quantities for each job line.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {!orders.length && <p>No purchase orders awaiting receiving.</p>}
      {orders.map((o) => (
        <button
          key={o.id}
          onClick={() => setSelected(o)}
          className="block w-full text-left border rounded p-3"
        >
          {o.po_number} · {o.vendors?.vendor_name} ·{" "}
          {o.status === "partial" ? "Partially received" : "Awaiting receipt"}
        </button>
      ))}
      {selected && (
        <ReceivePOModal
          poId={selected.id}
          poNumber={selected.po_number}
          onClose={() => setSelected(null)}
          onSuccess={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </section>
  );
}
