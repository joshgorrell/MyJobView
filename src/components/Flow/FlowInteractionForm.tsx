import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { FlowScope, FlowTarget, targetScope } from "../../lib/flow/types";
import { FlowTargetPicker } from "./FlowTargetPicker";

export function FlowInteractionForm({
  scope,
  followup,
  onSaved,
}: {
  scope: FlowScope;
  followup?: {
    id: string;
    kind: "reminder" | "schedule";
    contactId: string;
    label: string;
  };
  onSaved: () => void;
}) {
  const [target, setTarget] = useState<FlowTarget | null>(
    followup
      ? { id: followup.contactId, kind: "contact", label: followup.label }
      : null,
  );
  const [type, setType] = useState("call");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [due, setDue] = useState("");
  const [reason, setReason] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const context = target ? targetScope(target) : scope;
  const hasContext = !!(
    context.contactId ||
    context.projectId ||
    context.workOrderId
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const { error: failure } = followup
        ? await supabase.rpc("complete_flow_followup", {
            p_id: followup.id,
            p_kind: followup.kind,
            p_notes: notes.trim(),
          })
        : await supabase.rpc("save_flow_interaction", {
            p_scope: {
              contact_id: context.contactId || null,
              project_id: context.projectId || null,
              work_order_id: context.workOrderId || null,
            },
            p_type: type,
            p_notes: notes.trim(),
            p_date: new Date(date + "T12:00:00").toISOString(),
            p_due: due ? new Date(due + "T12:00:00").toISOString() : null,
            p_followup_notes: reason.trim(),
            p_repeat: repeat,
          });
      if (failure) throw failure;
      onSaved();
    } catch (failure: any) {
      setError(failure.message || "Could not save. Your notes are still here.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="flow-interaction-form" onSubmit={submit}>
      {!hasContext && (
        <div>
          <label>Customer or job</label>
          <FlowTargetPicker onSelect={setTarget} />
        </div>
      )}
      {target && (
        <p className="flow-target-label">
          {target.label}
          {!followup && (
            <button type="button" onClick={() => setTarget(null)}>
              Change
            </button>
          )}
        </p>
      )}
      {!followup && (
        <div className="flow-form-grid">
          <label>
            Interaction
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {[
                ["call", "Phone call"],
                ["email", "Email"],
                ["meeting", "Meeting"],
                ["site_visit", "Site visit"],
                ["demo", "Demo"],
                ["casual_conversation", "Conversation"],
                ["proposal_sent", "Proposal sent"],
                ["follow_up", "Follow-up"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
      )}
      <label>
        {followup ? "Completion notes" : "What happened?"}
        <textarea
          aria-label="Interaction notes"
          required
          maxLength={4000}
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Record the useful details for this customer or job."
        />
      </label>
      {!followup && (
        <>
          <label>
            Follow-up date (optional)
            <input
              type="date"
              value={due}
              onChange={(e) => {
                setDue(e.target.value);
                if (!e.target.value) setRepeat("");
              }}
            />
          </label>
          {due && (
            <>
              <label>
                Follow-up reason
                <input
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="What needs to happen next?"
                />
              </label>
              <label>
                Repeat
                <select
                  aria-label="Repeat"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                >
                  <option value="">Once</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every two weeks</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </label>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="flow-error">
          {error}
        </p>
      )}
      <button
        className="flow-primary"
        disabled={saving || !notes.trim() || !hasContext}
      >
        {saving
          ? "Saving…"
          : followup
            ? "Complete follow-up"
            : "Save interaction"}
      </button>
    </form>
  );
}
