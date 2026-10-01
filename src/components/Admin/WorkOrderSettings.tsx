import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { WorkOrderOption } from "../../lib/workOrderOptions";
const behaviors = {
  type: {
    project: "Project — project and phase required",
    service: "Service — billing selected separately",
    warranty: "Warranty — original job reference required",
    site_survey: "Site Survey — assessment",
    vip_program: "VIP Maintenance — subscription required",
  },
  status: {
    pending: "Pending",
    assigned: "Scheduled/assigned",
    in_progress: "In progress",
    completed: "Complete",
    on_hold: "On hold",
    cancelled: "Cancelled",
  },
};
export function WorkOrderSettings() {
  const { profile } = useAuth();
  const [options, setOptions] = useState<WorkOrderOption[]>([]);
  const [kind, setKind] = useState<"type" | "status">("type");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<WorkOrderOption | null>(null);
  const [form, setForm] = useState({
    label: "",
    behavior: "service",
    color: "#2563eb",
    sort_order: 0,
    is_active: true,
  });
  const organizationId = profile?.organization_id;
  const load = useCallback(async () => {
    if (!organizationId) return;
    const { data, error } = await supabase
      .from("work_order_options")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sort_order");
    if (error) throw error;
    setOptions(data || []);
  }, [organizationId]);
  useEffect(() => {
    if (profile?.role === "admin") {
      supabase
        .rpc("seed_work_order_options", { p_org: profile.organization_id })
        .then(async ({ error }) => {
          try {
            if (error) throw error;
            await load();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not load settings",
            );
          }
        });
    }
  }, [profile?.organization_id, profile?.role, load]);
  async function save() {
    if (!form.label.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = editing
        ? await supabase
            .from("work_order_options")
            .update({
              label: form.label.trim(),
              color: form.color,
              sort_order: form.sort_order,
              is_active: form.is_active,
            })
            .eq("id", editing.id)
        : await supabase
            .from("work_order_options")
            .insert({
              ...form,
              label: form.label.trim(),
              kind,
              organization_id: profile!.organization_id,
            });
      if (result.error) throw result.error;
      await load();
      setEditing(null);
      setForm({ ...form, label: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  async function remove(option: WorkOrderOption) {
    if (
      !confirm(
        `Delete unused ${option.label}? Used options must be deactivated instead.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_options")
        .delete()
        .eq("id", option.id);
      if (error) throw error;
      await load();
    } catch {
      setError(
        "This option could not be deleted. If it is used on a work order, deactivate it to preserve history.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (profile?.role !== "admin") return <p>Administrator access required.</p>;
  return (
    <div className="space-y-5 text-primary">
      <h2 className="text-xl font-semibold">Work Order Settings</h2>
      <p className="text-sm text-secondary">
        Customize dealer labels and colors. Each option follows a fixed workflow
        behavior. Deactivate used options to retain history. Archiving remains a
        separate action.
      </p>
      <div className="rounded-lg border border-subtle p-4 text-sm text-secondary">
        Test &amp; Tune covers 90 days from substantial completion. Punchlist is
        the customer reporting tool. VIP trials are separate promotional offers;
        VIP maintenance follows the customer's plan.
      </div>
      <div className="flex gap-2">
        {(["type", "status"] as const).map((value) => (
          <button
            key={value}
            className={`min-h-11 px-4 rounded-lg ${kind === value ? "bg-blue-600 text-white" : "bg-surface"}`}
            onClick={() => {
              setKind(value);
              setEditing(null);
              setForm({
                label: "",
                behavior: value === "type" ? "service" : "pending",
                color: "#2563eb",
                sort_order: 0,
                is_active: true,
              });
            }}
          >
            {value === "type" ? "Types" : "Statuses"}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {options
          .filter((o) => o.kind === kind)
          .map((option) => (
            <li
              key={option.id}
              className="flex flex-wrap items-center gap-3 p-3 border border-subtle rounded-lg"
            >
              <span
                style={{ backgroundColor: option.color }}
                className="w-3 h-3 rounded-full"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium break-words">
                  {option.label}
                  {!option.is_active ? " · Inactive" : ""}
                </p>
                <p className="text-xs text-muted">
                  {option.behavior.replace(/_/g, " ")}
                </p>
              </div>
              <button
                disabled={busy}
                className="min-h-11 px-3 text-info"
                onClick={() => {
                  setEditing(option);
                  setForm({
                    label: option.label,
                    behavior: option.behavior,
                    color: option.color,
                    sort_order: option.sort_order,
                    is_active: option.is_active,
                  });
                }}
              >
                Edit
              </button>
              {!option.system_key && (
                <button
                  disabled={busy}
                  className="min-h-11 px-3 text-red-500"
                  onClick={() => remove(option)}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="p-4 bg-surface rounded-lg space-y-4"
      >
        <h3 className="font-medium">
          {editing ? "Edit" : "Add"} {kind}
        </h3>
        <label className="block text-sm">
          Name
          <input
            required
            maxLength={80}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="block w-full min-h-11 p-2 mt-1 rounded-lg bg-canvas border border-strong"
          />
        </label>
        <label className="block text-sm">
          Workflow behavior
          <select
            aria-label="Workflow behavior"
            disabled={!!editing}
            value={form.behavior}
            onChange={(e) => setForm({ ...form, behavior: e.target.value })}
            className="block w-full min-h-11 p-2 mt-1 rounded-lg bg-canvas border border-strong"
          >
            {Object.entries(behaviors[kind]).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            {editing?.behavior === "punchlist" && (
              <option value="punchlist">Punchlist — legacy records</option>
            )}
          </select>
        </label>
        <div className="flex flex-wrap gap-4">
          <label>
            Color
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="block h-11"
            />
          </label>
          <label>
            Display order
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) =>
                setForm({ ...form, sort_order: Number(e.target.value) })
              }
              className="block min-h-11 w-24 p-2 bg-canvas border border-strong rounded-lg"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
            />
            Active
          </label>
        </div>
        <button
          disabled={busy}
          className="min-h-11 px-5 rounded-lg bg-blue-600 text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {editing && (
          <button
            type="button"
            className="min-h-11 px-4"
            onClick={() => setEditing(null)}
          >
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
