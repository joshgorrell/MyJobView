import { supabase } from "../../lib/supabase";
export type RemovalScope = "parts_only" | "parts_and_labor";
export async function itemHasLabor(item: any) {
  if (
    Number(item.labor_hours || 0) > 0 ||
    Number(item.programming_labor_hours || 0) > 0 ||
    Number(item.labor_total || 0) > 0
  )
    return true;
  const result = await supabase
    .from("proposal_line_item_labor_phases")
    .select("hours")
    .eq("line_item_id", item.id);
  if (result.error) throw result.error;
  return (result.data || []).some((p) => Number(p.hours) > 0);
}
export default function LaborRemovalChoice({
  onChoose,
  onCancel,
}: {
  onChoose: (scope: RemovalScope) => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Associated labor"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-subtle bg-surface p-5 text-primary">
        <h2 className="font-semibold text-lg">
          Keep or remove the associated labor?
        </h2>
        <p className="mt-3 text-sm text-secondary">
          Keeping labor leaves a visible labor-only line on the approved order
          and keeps its installation tasks.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => onChoose("parts_only")}
            className="min-h-11 rounded-lg bg-blue-600 px-4 text-white"
          >
            Keep labor
          </button>
          <button
            onClick={() => onChoose("parts_and_labor")}
            className="min-h-11 rounded-lg border border-subtle px-4 text-red-600"
          >
            Remove labor too
          </button>
          <button onClick={onCancel} className="min-h-11 px-3 text-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
