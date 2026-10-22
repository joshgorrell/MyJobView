import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Adjustment = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  source: string | null;
  visibility: string | null;
  customer_description: string | null;
  legacy_punchlist_id: string | null;
};
type Project = { id: string; name: string; project_number: string | null };

export function TestTuneProjectAdjustments() {
  const [items, setItems] = useState<Adjustment[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [submittedThisSession, setSubmittedThisSession] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    async function load() {
      const [tasks, projectRows, requestLinks] = await Promise.all([
        supabase.from('project_tasks')
          .select('id,project_id,title,status,source,visibility,customer_description,legacy_punchlist_id')
          .eq('visibility', 'customer_visible'),
        supabase.from('projects').select('id,name,project_number'),
        supabase.from('project_punchlist_requests').select('task_id'),
      ]);
      if (!active) return;
      if (tasks.error || projectRows.error || requestLinks.error) {
        setError((tasks.error || projectRows.error || requestLinks.error)!.message);
        return;
      }
      const requestedIds = new Set((requestLinks.data || []).map(link => link.task_id));
      setItems((tasks.data || []).filter(task => !task.legacy_punchlist_id && task.status === 'open' && !requestedIds.has(task.id) && !submittedThisSession.has(task.id)));
      setProjects(Object.fromEntries((projectRows.data || []).map(project => [project.id, project])));
      setError('');
    }
    void load();
    const subscription = supabase.channel('test_tune_project_adjustments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_punchlist_requests' }, () => void load())
      .subscribe();
    return () => { active = false; void supabase.removeChannel(subscription); };
  }, []);

  const selectedItems = items.filter(item => selected.includes(item.id) && item.status === 'open' && !submittedThisSession.has(item.id));
  const selectedProject = selectedItems[0]?.project_id;
  async function submitSelected() {
    if (!selectedProject || submitting || selectedItems.length !== selected.length || selectedItems.some(item => item.project_id !== selectedProject)) return;
    if (!window.confirm(`Submit ${selectedItems.length} adjustment(s) to Service Requests for scheduling? Unsubmitted items remain only in Test & Tune.`)) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const { error: failure } = await supabase.rpc('request_project_punchlist_visit', {
        p_project_id: selectedProject,
        p_task_ids: selectedItems.map(item => item.id),
        p_submission_id: crypto.randomUUID(),
      });
      if (failure) throw failure;
      const submittedIds = new Set(selectedItems.map(item => item.id));
      setSubmittedThisSession(previous => new Set([...previous, ...submittedIds]));
      setItems(previous => previous.filter(item => !submittedIds.has(item.id)));
      setSelected([]);
      setNotice('Submitted adjustments moved to Service Requests. Remaining adjustments stay here.');
    } catch (failure) {
      const message = (failure as { message?: string }).message || 'Could not submit adjustments.';
      setError(/already requested/i.test(message) ? 'One or more adjustments have already been requested. No new request was created; refresh the project to review the existing request.' : message);
    } finally { setSubmitting(false); }
  }
  const visible = items.filter(item => !submittedThisSession.has(item.id) && item.status === 'open' && (() => {
    const project = projects[item.project_id];
    return [item.title, item.customer_description, project?.name, project?.project_number]
      .some(value => value?.toLowerCase().includes(search.toLowerCase()));
  })());
  return (
    <section className="rounded-lg border border-subtle bg-surface p-3 space-y-3" aria-label="Project Test and Tune adjustments">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-primary">Project adjustments</h2>
          <p className="text-xs text-muted">Customer-visible project items not already in the earlier adjustment list. Select adjustments from the same project to request service, or open the project for full task history. Only unsubmitted adjustments appear here. Requested adjustments move to Service Requests.</p>
        </div>
        <input aria-label="Search project adjustments" className="min-h-10 rounded-md border border-subtle bg-canvas px-3 text-sm text-primary" placeholder="Find an adjustment" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      {selected.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm"><span>{selected.length} selected from one project</span><button type="button" disabled={submitting} onClick={() => void submitSelected()} className="min-h-10 rounded-md bg-blue-600 px-3 font-semibold text-white disabled:opacity-50">{submitting ? 'Submitting…' : 'Request service'}</button><button type="button" onClick={() => setSelected([])} className="min-h-10 px-2 text-muted">Clear</button></div>}
      {notice && <p role="status" className="text-sm text-emerald-400">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-400">Could not load project adjustments: {error}</p>}
      {!error && visible.length === 0 && <p className="text-sm text-muted">No matching project adjustments.</p>}
      <div className="divide-y divide-subtle">
        {visible.map(item => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.includes(item.id)} disabled={submitting || item.status !== 'open' || submittedThisSession.has(item.id) || Boolean(selectedProject && selectedProject !== item.project_id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />
            <div className="min-w-0">
              <div className="font-medium text-primary">{item.customer_description || item.title}</div>
              <div className="text-xs text-muted">{projects[item.project_id]?.name || 'Project'} · {submittedThisSession.has(item.id) ? 'Submitted this session' : item.status}</div>
            </div>
            <a className="text-info hover:underline" href={`/projects?projectId=${encodeURIComponent(item.project_id)}`}>Open project →</a>
          </div>
        ))}
      </div>
    </section>
  );
}
