import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

type Shares = { pool: number; design: number; pm: number; department: number };
type Tier = Shares & { min: number | null };
type Rule = Shares & {
  method: "gross" | "profit" | "sliding";
  base: "gross" | "profit";
  timing: "cash" | "sale";
  tiers: Tier[];
};
type Kind = "proposal" | "service" | "retail";
const kinds: Kind[] = ["proposal", "service", "retail"];
const names = {
  proposal: "Proposal / project",
  service: "Service without proposal",
  retail: "Retail",
};
const example = (kind: Kind): Rule => ({
  method: "gross",
  base: "gross",
  timing: "cash",
  pool: 7,
  design: kind === "retail" ? 0 : 1,
  pm: 0,
  department: 0,
  tiers: [
    { min: null, pool: 0, design: 0, pm: 0, department: 0 },
    ...[10, 20, 30, 40, 50].map((min, i) => ({
      min,
      pool: i + 3,
      design: kind === "retail" ? 0 : 1,
      pm: 0,
      department: 0,
    })),
  ],
});
const inputClass =
  "w-24 rounded border border-gray-500 bg-white text-black p-2";

export function DealerCommissionMatrix() {
  const { profile } = useAuth();
  const org = profile?.organization_id;
  const [rules, setRules] = useState<Record<Kind, Rule>>({
    proposal: example("proposal"),
    service: example("service"),
    retail: example("retail"),
  });
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setLoadFailed(false);
    setActive(false);
    setRules({
      proposal: example("proposal"),
      service: example("service"),
      retail: example("retail"),
    });
    async function load() {
      const { data: settings, error: e } = await supabase
        .from("company_commission_settings")
        .select("active_matrix_policy_id")
        .eq("organization_id", org)
        .maybeSingle();
      if (e) throw e;
      if (settings?.active_matrix_policy_id) {
        const { data, error: pe } = await supabase
          .from("commission_matrix_policies")
          .select("rules")
          .eq("id", settings.active_matrix_policy_id)
          .single();
        if (pe) throw pe;
        if (!cancelled) {
          setRules(
            Object.fromEntries(
              kinds.map((kind) => [
                kind,
                {
                  ...example(kind),
                  ...data.rules[kind],
                  tiers: data.rules[kind].tiers || example(kind).tiers,
                },
              ]),
            ) as Record<Kind, Rule>,
          );
          setActive(true);
        }
      } else if (!cancelled) setActive(false);
    }
    if (org)
      load()
        .catch((e) => {
          if (!cancelled) {
            setError(e.message);
            setLoadFailed(true);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    return () => {
      cancelled = true;
    };
  }, [org]);
  function change(kind: Kind, fields: Partial<Rule>) {
    setMessage("");
    setRules((prev) => ({ ...prev, [kind]: { ...prev[kind], ...fields } }));
  }
  function tierChange(kind: Kind, index: number, fields: Partial<Tier>) {
    change(kind, {
      tiers: rules[kind].tiers.map((tier, i) =>
        i === index ? { ...tier, ...fields } : tier,
      ),
    });
  }
  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error } = await supabase.rpc("save_commission_matrix", {
        p_rules: rules,
      });
      if (error) throw error;
      setActive(true);
      setMessage(
        "Matrix version activated for new sales. Existing sales retain their original policy.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : (e as { message?: string }).message || "Could not save matrix.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <p className="text-gray-400">Loading dealer matrix…</p>;
  return (
    <section className="p-5 rounded-xl border border-gray-600 space-y-4">
      <h3 className="text-lg font-semibold text-white">
        Dealer commission matrix
      </h3>
      <p className="text-sm text-gray-300">
        {active
          ? "Active matrix. Saving creates a new policy version."
          : "Review these example rates before activating. Legacy rules remain active until you save."}{" "}
        Eligible assigned roles share one pool. A separate designer’s share
        comes out of the salesperson’s allocation.
      </p>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-green-300">
          {message}
        </p>
      )}
      {kinds.map((kind) => {
        const rule = rules[kind];
        return (
          <fieldset
            key={kind}
            className="border border-gray-700 rounded p-4 space-y-3"
          >
            <legend className="px-2 text-white font-semibold">
              {names[kind]}
            </legend>
            <div className="flex flex-wrap gap-4 text-gray-300 text-sm">
              <label>
                Calculation method
                <select
                  aria-label={`${names[kind]} calculation method`}
                  className="block p-2 mt-1 rounded bg-white text-black"
                  value={rule.method}
                  onChange={(e) =>
                    change(kind, { method: e.target.value as Rule["method"] })
                  }
                >
                  <option value="gross">Fixed % of pretax sales</option>
                  <option value="profit">Fixed % of gross profit</option>
                  <option value="sliding">Margin-tier sliding scale</option>
                </select>
              </label>
              {rule.method === "sliding" && (
                <label>
                  Apply tier rate to
                  <select
                    className="block p-2 mt-1 rounded bg-white text-black"
                    value={rule.base}
                    onChange={(e) =>
                      change(kind, { base: e.target.value as Rule["base"] })
                    }
                  >
                    <option value="gross">Pretax sales</option>
                    <option value="profit">Gross profit dollars</option>
                  </select>
                </label>
              )}
              <label>
                Earn commission
                <select
                  className="block p-2 mt-1 rounded bg-white text-black"
                  value={rule.timing}
                  onChange={(e) =>
                    change(kind, { timing: e.target.value as Rule["timing"] })
                  }
                >
                  <option value="cash">As cash is collected</option>
                  <option value="sale">At time of sale</option>
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead>
                  <tr>
                    <th className="p-2">Minimum GPM</th>
                    <th className="p-2">Total pool %</th>
                    <th className="p-2">Designer %</th>
                    <th className="p-2">PM %</th>
                    <th className="p-2">Department %</th>
                    <th>Rep % with all roles</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(rule.method === "sliding" ? rule.tiers : [rule]).map(
                    (row, i) => (
                      <tr key={i}>
                        <td className="p-2">
                          {rule.method !== "sliding" ? (
                            "Fixed rate"
                          ) : i === 0 ? (
                            "Below first tier"
                          ) : (
                            <input
                              aria-label={`${names[kind]} tier ${i} minimum margin`}
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={(row as Tier).min ?? ""}
                              className={inputClass}
                              onChange={(e) =>
                                tierChange(kind, i, {
                                  min: Number(e.target.value),
                                })
                              }
                            />
                          )}
                        </td>
                        {(["pool", "design", "pm", "department"] as const).map(
                          (field) => (
                            <td key={field} className="p-2">
                              <input
                                aria-label={`${names[kind]} ${rule.method === "sliding" ? `tier ${i} ` : ""}${field} percent`}
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                disabled={
                                  (kind === "retail" && field === "design") ||
                                  (kind !== "service" && field === "department")
                                }
                                value={row[field]}
                                className={inputClass}
                                onChange={(e) =>
                                  rule.method === "sliding"
                                    ? tierChange(kind, i, {
                                        [field]: Number(e.target.value),
                                      })
                                    : change(kind, {
                                        [field]: Number(e.target.value),
                                      })
                                }
                              />
                            </td>
                          ),
                        )}
                        <td>
                          {(
                            row.pool -
                            row.design -
                            row.pm -
                            row.department
                          ).toFixed(2)}
                          %
                        </td>
                        <td>
                          {rule.method === "sliding" && i > 0 && (
                            <button
                              type="button"
                              className="p-2 text-red-300"
                              onClick={() =>
                                change(kind, {
                                  tiers: rule.tiers.filter((_, n) => n !== i),
                                })
                              }
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {rule.method === "sliding" && (
              <button
                type="button"
                className="text-blue-300 text-sm"
                onClick={() => {
                  const min = rule.tiers[rule.tiers.length - 1]?.min ?? 0;
                  change(kind, {
                    tiers: [
                      ...rule.tiers,
                      {
                        min: Math.min(100, min + 5),
                        pool: 7,
                        design: kind === "retail" ? 0 : 1,
                        pm: 0,
                        department: 0,
                      },
                    ],
                  });
                }}
              >
                Add tier
              </button>
            )}
            <p className="text-xs text-gray-400">
              Without a separate eligible designer, their slice stays with the
              eligible rep. Profit and margin tiers require approved complete
              direct costs. Rate thresholds use exact margin; the top tier has
              no upper limit.
            </p>
          </fieldset>
        );
      })}
      <button
        type="button"
        disabled={saving || loadFailed}
        onClick={save}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {saving
          ? "Saving…"
          : active
            ? "Save new matrix version"
            : "Activate reviewed matrix"}
      </button>
    </section>
  );
}
