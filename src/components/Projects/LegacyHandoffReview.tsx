import { useState } from "react";
import { supabase } from "../../lib/supabase";
export default function LegacyHandoffReview({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved: () => void;
}) {
  const [preview, setPreview] = useState<any>(null),
    [chosen, setChosen] = useState<string[]>([]),
    [capture, setCapture] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(save = false) {
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("review_legacy_job_handoff", {
        p_project: projectId,
        p_items: save ? chosen : null,
        p_capture: save && capture,
      });
      if (result.error) throw result.error;
      setPreview(result.data);
      if (save) {
        setChosen([]);
        setCapture(false);
        onSaved();
      }
    } catch (e) {
      setError((e as { message: string }).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border border-subtle bg-surface p-3 text-primary">
      <summary className="cursor-pointer min-h-11">
        Review older job handoff
      </summary>
      <p className="text-sm text-secondary">
        Review labor items without tasks before adding them. Tasks deliberately
        deleted or combined are excluded. A saved scope is labelled “Earliest
        reviewed scope,” because the original sold scope may not be recoverable.
      </p>
      <button
        onClick={() => run()}
        disabled={busy}
        className="min-h-11 px-3 text-info"
      >
        Load review
      </button>
      {error && (
        <p role="alert" className="text-red-600 text-sm">
          {error}
        </p>
      )}
      {preview && (
        <>
          <details>
            <summary className="min-h-11 cursor-pointer">
              Scope to retain
            </summary>
            <p className="whitespace-pre-wrap text-sm">
              {preview.scope.overall_scope}
            </p>
            {preview.scope.rooms.map((r: any) => (
              <p key={r.id} className="mt-2 whitespace-pre-wrap text-sm">
                <strong>{r.name}</strong>
                <br />
                {r.description}
              </p>
            ))}
          </details>
          {preview.candidates.map((i: any) => (
            <label
              key={i.id}
              className="min-h-11 flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={chosen.includes(i.id)}
                onChange={(e) =>
                  setChosen((v) =>
                    e.target.checked
                      ? [...v, i.id]
                      : v.filter((x) => x !== i.id),
                  )
                }
              />
              {i.room_name || "General"} · {i.description}
            </label>
          ))}
          <label className="min-h-11 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={capture}
              onChange={(e) => setCapture(e.target.checked)}
            />
            I reviewed this scope; retain it for technicians.
          </label>
          <button
            onClick={() => run(true)}
            disabled={busy || (!capture && !chosen.length)}
            className="rounded-lg bg-blue-600 px-4 min-h-11 text-white disabled:opacity-50"
          >
            Save reviewed handoff
          </button>
        </>
      )}
    </details>
  );
}
