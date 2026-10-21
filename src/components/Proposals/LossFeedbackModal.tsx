import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { LOSS_REASONS } from "../../lib/proposalLoss";
export function LossFeedbackModal({
  proposalId,
  onClose,
  onSaved,
}: {
  proposalId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [source, setSource] = useState("phone"),
    [reasons, setReasons] = useState<string[]>([]),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!reasons.length || !profile) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.from("proposal_loss_feedback").insert({
        proposal_id: proposalId,
        organization_id: profile.organization_id,
        source,
        reasons,
        notes: notes.trim(),
      });
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save feedback.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loss-feedback-title"
    >
      <form
        onSubmit={save}
        className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-xl border border-gray-600 bg-gray-800 p-5 text-white space-y-4"
      >
        <h2 id="loss-feedback-title" className="text-lg font-semibold">
          Record loss feedback
        </h2>
        <p className="text-sm text-gray-300">
          Save what the customer told you. Earlier feedback stays in the
          history. Staff assessments are shown separately from confirmed
          customer answers.
        </p>
        <label className="block text-sm">
          Feedback source
          <select
            aria-label="Feedback source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setReasons([]);
            }}
            className="mt-1 w-full rounded bg-gray-900 p-3"
          >
            <option value="phone">Customer told us by phone</option>
            <option value="email">Customer told us by email</option>
            <option value="staff_assessment">
              Staff assessment / unconfirmed
            </option>
          </select>
        </label>
        <fieldset>
          <legend className="text-sm mb-2">
            Reasons (choose all that apply)
          </legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {Object.entries(LOSS_REASONS)
              .filter(
                ([k]) =>
                  ![
                    "duplicate",
                    "error",
                    "customer_request",
                    "replaced_by_revision",
                  ].includes(k) &&
                  (source === "staff_assessment" ||
                    !["unknown", "no_response"].includes(k)),
              )
              .map(([k, l]) => (
                <label
                  key={k}
                  className="flex items-center gap-2 min-h-10 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={reasons.includes(k)}
                    onChange={(e) =>
                      setReasons(
                        e.target.checked
                          ? [...reasons, k]
                          : reasons.filter((r) => r !== k),
                      )
                    }
                  />
                  {l}
                </label>
              ))}
          </div>
        </fieldset>
        <label className="block text-sm">
          Customer comments / notes
          <textarea
            aria-label="Customer comments / notes"
            rows={3}
            maxLength={10000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded bg-gray-900 p-3"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 px-4"
          >
            Cancel
          </button>
          <button
            disabled={busy || !reasons.length}
            className="min-h-11 rounded bg-cyan-700 px-4 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save feedback"}
          </button>
        </div>
      </form>
    </div>
  );
}
