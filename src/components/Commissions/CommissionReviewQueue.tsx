import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { CommissionSalePanel } from "./CommissionSalePanel";
type PendingSale = {
  display_name: string;
  id: string;
  source_kind: "invoice" | "order" | "proposal";
  source_id: string;
  state: string;
  sale_type: string | null;
  revenue: number;
};
export function CommissionReviewQueue() {
  const { profile } = useAuth();
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PendingSale | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("commission_sales")
        .select("id,display_name,source_kind,source_id,state,sale_type,revenue")
        .eq("organization_id", profile?.organization_id)
        .in("state", ["review", "cost_review"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!cancelled) {
        setSales(data || []);
        setError("");
      }
    }
    if (profile?.organization_id)
      load().catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.organization_id, refresh]);
  if (!sales.length && !error) return null;
  return (
    <section className="p-4 border border-amber-700 rounded space-y-2">
      <div className="flex justify-between">
        <h3 className="text-white font-semibold">
          Matrix sales awaiting review
        </h3>
        <button
          type="button"
          className="text-blue-300"
          onClick={() => setRefresh((n) => n + 1)}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <p className="text-sm text-gray-300">
        Review the sale’s roles and amounts before its earnings enter payroll
        reports. Showing up to 50 recent sales.
      </p>
      <div className="flex flex-wrap gap-2">
        {sales.map((sale) => (
          <button
            type="button"
            key={sale.id}
            className="border border-gray-600 rounded px-3 py-2 text-left text-gray-200"
            onClick={() => setSelected(sale)}
          >
            {sale.display_name} · {sale.sale_type || "Unclassified"} · $
            {Number(sale.revenue).toFixed(2)}
          </button>
        ))}
      </div>
      {selected && (
        <CommissionSalePanel
          key={selected.id}
          sourceKind={selected.source_kind}
          sourceId={selected.source_id}
        />
      )}
    </section>
  );
}
