import { useState } from "react";
import { lostReviewAction, responseReasons } from "./lostReview";
export function RecordLostFeedback({
  requestId,
  onSaved,
}: {
  requestId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [source, setSource] = useState("phone"),
    [reasons, setReasons] = useState<string[]>([]),
    [message, setMessage] = useState(""),
    [chance, setChance] = useState(""),
    [recoveryMessage, setRecoveryMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await lostReviewAction({
        action: "record_feedback",
        request_id: requestId,
        source,
        reasons,
        message,
        recoverable: chance,
        recovery_message: recoveryMessage,
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record feedback.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!open ? (
        <button
          type="button"
          className="min-h-11 rounded bg-cyan-700 px-4 text-white"
          onClick={() => setOpen(true)}
        >
          Record customer feedback
        </button>
      ) : (
        <form
          onSubmit={save}
          className="space-y-3 rounded-xl border border-gray-600 p-4 text-white"
        >
          <h3 className="font-semibold">Record customer feedback</h3>
          <p className="text-sm text-gray-400">
            Record the customer’s confirmed answer. This completes the request
            and stops its reminder.
          </p>
          <label className="block text-sm">
            Source
            <select
              aria-label="Customer feedback source"
              className="block w-full rounded bg-gray-900 p-3"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="phone">Customer by phone</option>
              <option value="email">Customer by email</option>
              <option value="in_person">Customer in person</option>
            </select>
          </label>
          <fieldset>
            <legend className="text-sm">Reasons</legend>
            {responseReasons.map(([k, l]) => (
              <label
                key={k}
                className="flex min-h-10 items-center gap-2 text-sm"
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
          </fieldset>
          <label className="block text-sm">
            Customer comments
            <textarea
              aria-label="Customer feedback comments"
              rows={3}
              maxLength={10000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="block w-full rounded bg-gray-900 p-3"
            />
          </label>
          <label className="block text-sm">
            Do we have another chance?
            <select
              aria-label="Recovery opportunity"
              required
              value={chance}
              onChange={(e) => setChance(e.target.value)}
              className="block w-full rounded bg-gray-900 p-3"
            >
              <option value="">Choose…</option>
              <option value="yes">Yes</option>
              <option value="maybe">Maybe</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="block text-sm">
            What could we do to earn the business?
            <textarea
              aria-label="Recovery comments"
              rows={3}
              maxLength={10000}
              value={recoveryMessage}
              onChange={(e) => setRecoveryMessage(e.target.value)}
              className="block w-full rounded bg-gray-900 p-3"
            />
          </label>
          {error && (
            <p role="alert" className="text-red-300">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="min-h-11 px-4"
            >
              Cancel
            </button>
            <button
              disabled={busy || !reasons.length || !chance}
              className="min-h-11 rounded bg-cyan-700 px-4 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save customer feedback"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
