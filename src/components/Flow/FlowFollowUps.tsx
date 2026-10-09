import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { FlowCreateModal } from "./FlowCreateModal";
import { FlowScope } from "../../lib/flow/types";

export function FlowFollowUps({
  scope,
  onChanged,
}: {
  scope: FlowScope;
  onChanged: () => void;
}) {
  const { profile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [completing, setCompleting] = useState<any>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const { data, error: failure } = await supabase.rpc(
          "get_flow_followups",
          {
            p_contact: scope.contactId || null,
            p_project: scope.projectId || null,
            p_work_order: scope.workOrderId || null,
          },
        );
        if (failure) throw failure;
        if (!cancelled) {
          setItems(data?.items || []);
          setSchedules(data?.schedules || []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Could not load follow-ups.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    profile?.id,
    scope.contactId,
    scope.projectId,
    scope.workOrderId,
    version,
  ]);
  function refresh() {
    setVersion((v) => v + 1);
    onChanged();
  }
  async function toggle(schedule: any) {
    setBusy(schedule.id);
    setError("");
    try {
      const { error: failure } = await supabase.rpc(
        "set_flow_schedule_active",
        { p_id: schedule.id, p_active: !schedule.is_active },
      );
      if (failure) throw failure;
      refresh();
    } catch (e: any) {
      setError(e.message || "Could not update schedule.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flow-followups">
      <p className="flow-secondary">
        Your customer follow-ups. Log an interaction with a follow-up date to
        add a reminder or recurring outreach.
      </p>
      {error && (
        <p role="alert" className="flow-error">
          {error}
          <button onClick={refresh}>Retry</button>
        </p>
      )}
      {loading ? (
        <p role="status">Loading follow-ups…</p>
      ) : (
        <>
          <div className="flow-followup-items">
            {!items.length ? (
              <p>No pending follow-ups.</p>
            ) : (
              items.map((item) => (
                <article key={item.kind + item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.reason || item.type.replaceAll("_", " ")}</p>
                    <time>
                      {item.due
                        ? new Date(item.due).toLocaleDateString()
                        : "No date"}{" "}
                      ·{" "}
                      {item.kind === "schedule"
                        ? "Recurring outreach"
                        : "Reminder"}
                    </time>
                  </div>
                  <button
                    className="flow-primary"
                    onClick={() => setCompleting(item)}
                  >
                    Complete
                  </button>
                </article>
              ))
            )}
          </div>
          {!!schedules.length && (
            <section>
              <h3>Recurring outreach</h3>
              {schedules.map((schedule) => (
                <article key={schedule.id}>
                  <div>
                    <strong>{schedule.label}</strong>
                    <p>
                      {schedule.recurrence_pattern.replaceAll("_", " ")} ·{" "}
                      {schedule.is_active ? "Active" : "Paused"}
                    </p>
                  </div>
                  <button
                    disabled={busy === schedule.id}
                    onClick={() => void toggle(schedule)}
                  >
                    {schedule.is_active ? "Pause" : "Resume"}
                  </button>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {completing && (
        <FlowCreateModal
          scope={scope}
          initial="interaction"
          followup={{
            id: completing.id,
            kind: completing.kind,
            contactId: completing.contact_id,
            label: completing.label,
          }}
          canInteract
          onClose={() => setCompleting(null)}
          onSaved={() => {
            setCompleting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
