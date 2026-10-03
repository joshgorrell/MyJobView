import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
type Sale = {
  display_name?: string;
  id: string;
  sale_type: string | null;
  salesperson_id: string | null;
  designer_id: string | null;
  pm_id: string | null;
  revenue: number;
  total: number;
  approved_cost: number | null;
  state: string;
  snapshot: unknown;
  source_kind: string;
};
type Person = { id: string; name: string; eligible: boolean };
export function CommissionSalePanel({
  sourceKind,
  sourceId,
}: {
  sourceKind: "invoice" | "proposal" | "order";
  sourceId: string;
}) {
  const { profile } = useAuth();
  const manager = ["admin", "finance", "manager", "sales_manager"].includes(
    profile?.role || "",
  );
  const [enabled, setEnabled] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [calculation, setCalculation] = useState<{
    hold?: boolean;
    base?: number;
    shares?: { pool: number; design: number; pm: number; department: number };
  } | null>(null);
  const [type, setType] = useState("retail");
  const [rep, setRep] = useState("");
  const [designer, setDesigner] = useState("");
  const [pm, setPm] = useState("");
  const [revenue, setRevenue] = useState("");
  const [total, setTotal] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setEnabled(false);
    setSale(null);
    setError("");
    setMessage("");
    async function load() {
      const { data, error } = await supabase.rpc(
        "get_commission_sale_context",
        { p_kind: sourceKind, p_source: sourceId },
      );
      if (error) throw error;
      if (cancelled) return;
      setEnabled(data.enabled);
      setPeople(data.people || []);
      setSale(data.sale);
      setCalculation(data.calculation || null);
      const s = data.sale as Sale | null;
      if (s) {
        setType(s.sale_type || "retail");
        setRep(s.salesperson_id || "");
        setDesigner(s.designer_id || "");
        setPm(s.pm_id || "");
        setRevenue(String(s.revenue));
        setTotal(String(s.total));
        setCost(s.approved_cost == null ? "" : String(s.approved_cost));
      }
    }
    if (manager && sourceId)
      load().catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceKind, sourceId, profile?.organization_id, manager]);
  async function save(finalize: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error } = await supabase.rpc("review_commission_sale", {
        p_kind: sourceKind,
        p_source: sourceId,
        p_type: type,
        p_rep: rep || null,
        p_designer: designer || null,
        p_pm: pm || null,
        p_cost: cost === "" ? null : Number(cost),
        p_revenue: Number(revenue),
        p_total: Number(total),
        p_finalize: finalize,
        p_reason: reason,
      });
      if (error) throw error;
      const { data, error: loadError } = await supabase.rpc(
        "get_commission_sale_context",
        { p_kind: sourceKind, p_source: sourceId },
      );
      if (loadError) throw loadError;
      setSale(data.sale);
      setCalculation(data.calculation || null);
      setMessage(
        finalize
          ? "Commission entitlement reviewed. Earnings now follow its saved policy."
          : "Commission attribution saved. Review the finalized sale before releasing earnings.",
      );
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          "Could not save commission review.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!manager || (!enabled && !error)) return null;
  const locked = !!sale?.snapshot;
  const directInvoice = sale?.source_kind === "invoice";
  const margin =
    Number(revenue) > 0 && cost !== ""
      ? (((Number(revenue) - Number(cost)) / Number(revenue)) * 100).toFixed(2)
      : null;
  const selectPerson = (
    label: string,
    value: string,
    change: (value: string) => void,
  ) => (
    <label className="text-sm">
      {label}
      <select
        disabled={locked || busy}
        className="block border rounded p-2 w-full bg-white text-black"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Unassigned</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.eligible ? "" : " — not eligible"}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <details className="border border-gray-400 bg-gray-50 text-gray-900 rounded-lg p-4 my-3">
      <summary className="font-semibold cursor-pointer">
        Commission sale review {sale ? `— ${sale.state.replace("_", " ")}` : ""}
      </summary>
      {error && (
        <p role="alert" className="text-red-700 my-2">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-green-700 my-2">
          {message}
        </p>
      )}
      {enabled && !sale && (
        <p className="text-sm mt-2">
          This sale predates matrix activation or has existing commission
          records. Its original rules remain in effect.
        </p>
      )}
      {sale && (
        <div className="space-y-3 mt-3">
          <p className="text-sm">
            Review the entire sale, including its direct costs. Deposits and
            progress invoices share this entitlement. Role allocations lock when
            reviewed; future dealer policy edits do not change this sale.
          </p>
          <label className="text-sm">
            Sale type
            <select
              disabled={
                locked ||
                sourceKind !== "invoice" ||
                sale.source_kind !== "invoice"
              }
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                if (e.target.value === "retail") setDesigner("");
              }}
              className="block border rounded p-2 bg-white text-black"
            >
              <option value="proposal">Proposal / project</option>
              <option value="service">Service without proposal</option>
              <option value="retail">Retail</option>
            </select>
          </label>
          <div className="grid sm:grid-cols-3 gap-3">
            {selectPerson("Salesperson", rep, setRep)}
            {type !== "retail" &&
              selectPerson("Designer", designer, setDesigner)}
            {selectPerson("Project manager", pm, setPm)}
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              ["Pretax revenue", revenue, setRevenue],
              ["Sale total including tax", total, setTotal],
              ["Approved direct costs", cost, setCost],
            ].map(([label, value, change], i) => (
              <label key={label as string} className="text-sm">
                {label as string}
                <input
                  aria-label={label as string}
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={busy || (directInvoice && i < 2)}
                  value={value as string}
                  onChange={(e) =>
                    (change as (v: string) => void)(e.target.value)
                  }
                  className="block border rounded p-2 w-full bg-white text-black"
                />
              </label>
            ))}
          </div>
          <p className="text-sm">
            {margin === null
              ? "Cost review pending. Include applicable materials, labor and other direct costs."
              : `Gross profit margin: ${margin}% (tier selection uses the unrounded value).`}{" "}
            Missing costs stay pending; a known zero cost must be explicitly
            entered.
          </p>
          {calculation && (
            <p className="text-sm">
              Saved calculation:{" "}
              {calculation.hold
                ? "awaiting cost review"
                : `commission base $${Number(calculation.base).toFixed(2)}, pool ${calculation.shares?.pool ?? 0}%. Designer ${calculation.shares?.design ?? 0}% and other assigned role shares are inside this pool.`}
            </p>
          )}
          <label className="text-sm">
            Review note
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="block border rounded p-2 w-full bg-white text-black"
              placeholder="Explain the revenue and complete direct-cost review"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {!locked && (
              <button
                type="button"
                disabled={busy}
                onClick={() => save(false)}
                className="border px-3 py-2 rounded"
              >
                Save attribution
              </button>
            )}
            <button
              type="button"
              disabled={busy || reason.trim().length < 5}
              onClick={() => save(true)}
              className="bg-blue-600 text-white px-3 py-2 rounded"
            >
              {busy
                ? "Saving…"
                : locked
                  ? "Approve cost / sale correction"
                  : "Review finalized sale"}
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
