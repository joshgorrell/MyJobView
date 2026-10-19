import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import ProjectTasksList from "../Projects/ProjectTasksList";
interface Project {
  id: string;
  name: string;
  project_number: string;
  contact_id: string;
}
export function ProjectPunchlistWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<
    Record<string, { open: number; customer: number }>
  >({});
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void (async () => {
      const [projectResult, taskResult] = await Promise.all([
        supabase
          .from("projects")
          .select("id,name,project_number,contact_id")
          .order("created_at", { ascending: false }),
        supabase
          .from("project_tasks")
          .select("project_id,source")
          .eq("status", "open"),
      ]);
      if (!active) return;
      if (projectResult.error || taskResult.error)
        setError((projectResult.error || taskResult.error)!.message);
      else {
        setProjects(projectResult.data || []);
        const next: Record<string, { open: number; customer: number }> = {};
        for (const row of taskResult.data || []) {
          const count = next[row.project_id] || { open: 0, customer: 0 };
          count.open++;
          if (row.source === "customer") count.customer++;
          next[row.project_id] = count;
        }
        setCounts(next);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="space-y-4">
      <label className="block text-sm text-primary">
        Project
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="block w-full mt-1 border border-subtle bg-surface text-primary rounded-xl min-h-11 p-2"
        >
          <option value="">Choose a project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.project_number} · {p.name}
              {counts[p.id] ? ` · ${counts[p.id].open} open` : ``}
            </option>
          ))}
        </select>
      </label>
      {!projectId && (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects
            .filter((p) => counts[p.id]?.open)
            .slice(0, 12)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => setProjectId(p.id)}
                className="min-h-20 text-left border border-subtle rounded-xl bg-surface p-3 text-primary"
              >
                <span className="block font-medium">
                  {p.project_number} · {p.name}
                </span>
                <span className="block text-sm text-secondary">
                  {counts[p.id].open} open · {counts[p.id].customer}{" "}
                  customer-submitted
                </span>
              </button>
            ))}
        </div>
      )}
      {loading && <p className="text-sm text-muted">Loading projects…</p>}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {projectId && (
        <ProjectTasksList key={projectId} projectId={projectId} canEdit />
      )}
    </div>
  );
}
export function PlaceLegacyPunchlist({
  taskId,
  contactId,
  onSaved,
}: {
  taskId: string;
  contactId: string;
  onSaved: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: failure } = await supabase
        .from("projects")
        .select("id,name,project_number,contact_id")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (failure) setError(failure.message);
      else setProjects(data || []);
    })();
    return () => {
      active = false;
    };
  }, [contactId]);
  async function place() {
    if (!projectId || busy) return;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.rpc(
      "assign_legacy_punchlist_project",
      { p_task_id: taskId, p_project_id: projectId },
    );
    setBusy(false);
    if (failure) setError(failure.message);
    else onSaved();
  }
  return (
    <div className="p-3 border-t border-subtle space-y-2">
      <p className="text-sm text-secondary">
        Earlier customer item — choose its project to include it in the project
        punchlist.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Project for earlier item"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="min-h-11 bg-surface text-primary border border-subtle rounded-lg p-2 max-w-full"
        >
          <option value="">Choose project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.project_number} · {p.name}
            </option>
          ))}
        </select>
        <button
          disabled={!projectId || busy}
          onClick={() => void place()}
          className="min-h-11 px-3 text-info disabled:opacity-50"
        >
          Move to Project Punchlist
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-600 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
