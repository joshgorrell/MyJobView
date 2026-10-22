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
  useEffect(() => {
    let active = true;
    async function load() {
      const [tasks, projectRows] = await Promise.all([
        supabase.from('project_tasks')
          .select('id,project_id,title,status,source,visibility,customer_description,legacy_punchlist_id')
          .eq('visibility', 'customer_visible'),
        supabase.from('projects').select('id,name,project_number'),
      ]);
      if (!active) return;
      if (tasks.error || projectRows.error) {
        setError((tasks.error || projectRows.error)!.message);
        return;
      }
      setItems((tasks.data || []).filter(task => !task.legacy_punchlist_id));
      setProjects(Object.fromEntries((projectRows.data || []).map(project => [project.id, project])));
      setError('');
    }
    void load();
    const subscription = supabase.channel('test_tune_project_adjustments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, () => void load())
      .subscribe();
    return () => { active = false; void supabase.removeChannel(subscription); };
  }, []);

  const visible = items.filter(item => {
    const project = projects[item.project_id];
    return [item.title, item.customer_description, project?.name, project?.project_number]
      .some(value => value?.toLowerCase().includes(search.toLowerCase()));
  });
  return (
    <section className="rounded-lg border border-subtle bg-surface p-3 space-y-3" aria-label="Project Test and Tune adjustments">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-primary">Project adjustments</h2>
          <p className="text-xs text-muted">Customer-visible project items not already in the earlier adjustment list. Manage and submit these from their project until unified request status is available here.</p>
        </div>
        <input aria-label="Search project adjustments" className="min-h-10 rounded-md border border-subtle bg-canvas px-3 text-sm text-primary" placeholder="Find an adjustment" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">Could not load project adjustments: {error}</p>}
      {!error && visible.length === 0 && <p className="text-sm text-muted">No matching project adjustments.</p>}
      <div className="divide-y divide-subtle">
        {visible.map(item => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-primary">{item.customer_description || item.title}</div>
              <div className="text-xs text-muted">{projects[item.project_id]?.name || 'Project'} · {item.status}</div>
            </div>
            <a className="text-info hover:underline" href={`/projects?projectId=${encodeURIComponent(item.project_id)}`}>Open project →</a>
          </div>
        ))}
      </div>
    </section>
  );
}
