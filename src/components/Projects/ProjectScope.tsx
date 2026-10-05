import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
type Room = { id: string; name: string; description: string | null };
type Equipment = {
  id: string;
  room_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  task_notes?: string | null;
  programming_notes?: string | null;
};
type Scope = {
  overall_scope: string | null;
  rooms: Room[];
  equipment: Equipment[];
  captured_at?: string;
};
export default function ProjectScope({
  project,
}: {
  project: { id: string; sales_orders?: { proposal_id: string | null } };
}) {
  const [versions, setVersions] = useState<
    { id: string; label: string; scope: Scope }[]
  >([]);
  const [version, setVersion] = useState("");
  const [scope, setScope] = useState<Scope | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setScope(null);
    setVersions([]);
    setVersion("");
    setLoading(true);
    setError("");
    (async () => {
      try {
        const { data: record, error: failure } = await supabase
          .from("projects")
          .select("sold_handoff,sales_orders(proposal_id)")
          .eq("id", project.id)
          .maybeSingle();
        if (failure) throw failure;
        const [changes, retained] = await Promise.all([
          supabase
            .from("project_scope_changes")
            .select("id,scope,created_at")
            .eq("project_id", project.id)
            .order("created_at"),
          supabase
            .from("project_retained_handoffs")
            .select("scope")
            .eq("project_id", project.id)
            .maybeSingle(),
        ]);
        if (changes.error) throw changes.error;
        if (retained.error) throw retained.error;
        const available: { id: string; label: string; scope: Scope }[] = [];
        if (record?.sold_handoff)
          available.push({
            id: "sold",
            label: "Original sold scope",
            scope: record.sold_handoff,
          });
        if (retained.data?.scope)
          available.push({
            id: "reviewed",
            label: "Earliest reviewed scope",
            scope: retained.data.scope,
          });
        for (const change of changes.data || [])
          available.push({
            id: change.id,
            label: `Approved change · ${new Date(change.created_at).toLocaleDateString()}`,
            scope: change.scope,
          });
        if (available.length) {
          if (active) {
            const latest = available[available.length - 1];
            setVersions(available);
            setVersion(latest.id);
            setScope(latest.scope);
            setVerified(true);
          }
          return;
        }

        const proposalId =
          (record?.sales_orders as unknown as { proposal_id: string } | null)
            ?.proposal_id || project.sales_orders?.proposal_id;
        if (!proposalId) return;
        const [settings, rooms, items] = await Promise.all([
          supabase
            .from("proposal_settings")
            .select("scope_of_work")
            .eq("proposal_id", proposalId)
            .maybeSingle(),
          supabase
            .from("proposal_rooms")
            .select("id,name,description")
            .eq("proposal_id", proposalId)
            .order("sort_order"),
          supabase
            .from("proposal_line_items")
            .select(
              "id,room_id,description,quantity,unit,task_notes,programming_notes,is_hidden",
            )
            .eq("proposal_id", proposalId)
            .order("sort_order"),
        ]);
        for (const result of [settings, rooms, items])
          if (result.error) throw result.error;
        if (active) {
          setScope({
            overall_scope: settings.data?.scope_of_work || null,
            rooms: rooms.data || [],
            equipment: (items.data || []).filter((item) => !item.is_hidden),
          });
          setVerified(false);
        }
      } catch (failure) {
        if (active)
          setError(
            (failure as { message?: string }).message ||
              "Scope could not be loaded.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [project.id]);
  if (loading) return <p className="text-muted p-4">Loading scope...</p>;
  if (error)
    return (
      <p role="alert" className="text-red-600 p-4">
        {error}
      </p>
    );
  if (!scope)
    return <p className="text-muted p-4">No linked proposal scope.</p>;
  const equipment = (roomId: string | null) => (
    <ul className="space-y-3 mt-3">
      {scope.equipment
        .filter((item) => item.room_id === roomId)
        .map((item) => (
          <li key={item.id} className="text-sm text-primary">
            <p>
              {item.quantity} {item.unit} · {item.description}
            </p>
            {item.task_notes && (
              <p className="text-secondary whitespace-pre-wrap mt-1">
                {item.task_notes}
              </p>
            )}
            {item.programming_notes && (
              <p className="text-secondary whitespace-pre-wrap mt-1">
                {item.programming_notes}
              </p>
            )}
          </li>
        ))}
    </ul>
  );
  return (
    <section className="space-y-4 p-4 text-primary">
      <h2 className="font-semibold text-lg">
        {versions.find((v) => v.id === version)?.label ||
          "Current proposal scope"}
      </h2>
      {versions.length > 1 && (
        <label className="block text-sm">
          Scope version
          <select
            className="block mt-1 w-full max-w-md bg-surface border border-subtle rounded p-2"
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              setScope(versions.find((v) => v.id === e.target.value)!.scope);
            }}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {version === "reviewed" && (
        <p className="text-sm text-muted">
          This is the earliest reviewed snapshot for this older job; the
          original sold scope was not recorded.
        </p>
      )}
      {!verified && (
        <p className="text-sm text-muted">
          No verified original handoff is stored for this older project. This is
          the current proposal text; it may include later edits.
        </p>
      )}
      {scope.captured_at && (
        <p className="text-xs text-muted">
          Captured {new Date(scope.captured_at).toLocaleString()}
        </p>
      )}
      <article className="border border-subtle rounded-lg bg-surface p-4">
        <h3 className="font-medium mb-2">Overall scope</h3>
        <p className="whitespace-pre-wrap text-sm text-secondary">
          {scope.overall_scope || "No overall scope recorded."}
        </p>
      </article>
      {scope.rooms.map((room) => (
        <article
          key={room.id}
          className="border border-subtle rounded-lg bg-surface p-4"
        >
          <h3 className="font-medium mb-2">{room.name}</h3>
          <p className="whitespace-pre-wrap text-sm text-secondary">
            {room.description || "No room scope recorded."}
          </p>
          {equipment(room.id)}
        </article>
      ))}
      {scope.equipment.some((item) => !item.room_id) && (
        <article className="border border-subtle rounded-lg bg-surface p-4">
          <h3 className="font-medium">General equipment</h3>
          {equipment(null)}
        </article>
      )}
    </section>
  );
}
