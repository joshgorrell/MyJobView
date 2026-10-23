import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Adjustment = { id: string; title: string; customer_description: string | null; visibility: string; status: string; request_id: string | null };
type Project = { id: string; contact_id: string; name: string; number: string | null; customer: string; can_submit: boolean; end_date: string; tasks: Adjustment[] };
export function TestTuneProjectAdjustments({ canViewServiceRequests = false }: { canViewServiceRequests?: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ project: '', title: '', description: '', visible: true });
  const submission = useRef<{ key: string; id: string } | null>(null);
  const saving = useRef(false);
  const generation = useRef(0);
  const [context, setContext] = useState(() => new URLSearchParams(window.location.search));
  const load = useCallback(async () => {
    const revision = ++generation.current;
    try {
      const { data, error: failure } = await supabase.rpc('get_test_tune_workspace');
      if (failure) throw failure;
      if (revision !== generation.current) return;
      setProjects(data || []);
      setSelected(previous => previous.filter(id => (data || []).some((p: Project) => p.tasks.some(t => t.id === id && !t.request_id && t.status === 'open'))));
      setError('');
    } catch (failure) { if (revision === generation.current) setError((failure as Error).message || 'Could not load adjustments.'); }
    finally { if (revision === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const route = () => { const params = new URLSearchParams(window.location.search); setContext(params); setHistory(params.get('history') === '1'); setSelected([]); };
    route();
    const channel = supabase.channel('test-tune-workspace')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_punchlist_requests' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => void load()).subscribe();
    // Polling also covers deployments where these tables are not in the realtime publication.
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh); window.addEventListener('popstate', route);
    document.addEventListener('visibilitychange', refresh);
    return () => { generation.current++; window.clearInterval(timer); void supabase.removeChannel(channel); window.removeEventListener('focus', refresh); window.removeEventListener('popstate', route); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  const selectedProject = projects.find(p => p.tasks.some(t => selected.includes(t.id)));
  async function submit() {
    if (!selectedProject || saving.current || !selected.length) return;
    saving.current = true; setBusy(true); setError(''); setNotice('');
    const key = `${selectedProject.id}:${[...selected].sort().join(',')}`;
    if (submission.current?.key !== key) submission.current = { key, id: crypto.randomUUID() };
    try {
      const { data, error: failure } = await supabase.rpc('request_project_punchlist_visit', { p_project_id: selectedProject.id, p_task_ids: selected, p_submission_id: submission.current.id });
      if (failure) throw failure;
      setSelected([]); submission.current = null;
      setNotice('Selected adjustments moved to Service Requests.');
      await load();
      // The persisted request remains reachable without navigating away from unselected items.
      setLastRequestId(data);
      setNotice('Submitted. Your service request is ready for scheduling.');
    } catch (failure) { setError((failure as Error).message || 'Submission failed. Retry uses the same submission reference.'); }
    finally { saving.current = false; setBusy(false); }
  }
  async function add() {
    if (saving.current || !draft.project || !draft.title.trim()) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.rpc('add_test_tune_adjustment', { p_project_id: draft.project, p_title: draft.title, p_customer_description: draft.visible ? draft.description : null });
      if (failure) throw failure;
      setDraft({ project: '', title: '', description: '', visible: true }); await load();
    } catch (failure) { setError((failure as Error).message); }
    finally { saving.current = false; setBusy(false); }
  }
  const projectId = context.get('projectId'), contactId = context.get('contactId'), taskId = context.get('taskId'), requestId = context.get('serviceRequestId');
  const scoped = projects.filter(p => (!projectId || p.id === projectId) && (!contactId || p.contact_id === contactId));
  const visible = scoped.map(p => ({ ...p, tasks: p.tasks.filter(t => (history || (!t.request_id && t.status === 'open')) && (!taskId || t.id === taskId) && (!requestId || t.request_id === requestId)) }))
    .filter(p => (p.can_submit || p.tasks.length > 0 || history) && [p.customer, p.name, p.number, ...p.tasks.map(t => t.customer_description || t.title)].some(v => v?.toLowerCase().includes(search.toLowerCase())));
  return <section className="min-w-0 space-y-3" aria-label="Test and Tune adjustments">
    <div data-testid="punchlist-toolbar" className="flex flex-wrap items-center gap-2">
      <input aria-label="Search Test and Tune adjustments" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find customer, project or adjustment" className="min-h-11 min-w-0 flex-1 rounded-lg border border-subtle bg-surface px-3 text-primary" />
      <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={history} onChange={e => { setHistory(e.target.checked); const url = new URL(window.location.href); if (e.target.checked) url.searchParams.set('history', '1'); else url.searchParams.delete('history'); window.history.pushState(null, '', url); }} />Show history</label>
      <button disabled={busy} onClick={() => void load()} className="min-h-11 px-3 text-info">Refresh</button>
    </div>
    {loading && <p role="status">Loading adjustments…</p>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {notice && <p role="status" className="break-words text-sm text-secondary">{notice}</p>}
    {(projectId || contactId) && !loading && !error && scoped.length === 0 && <p role="alert">This customer or project is unavailable or you no longer have access.</p>}
    {(taskId || requestId) && !loading && !error && !visible.some(p => p.tasks.length) && <p role="alert">This adjustment or request is unavailable in the selected project.</p>}
    {lastRequestId && canViewServiceRequests && <a href={`/service-requests?serviceRequestId=${encodeURIComponent(lastRequestId)}`} className="inline-flex min-h-11 items-center text-sm text-info">View service request →</a>}
    {selected.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm"><span>{selected.length} selected · {selectedProject?.customer}</span><button disabled={busy || !selectedProject?.can_submit} onClick={() => void submit()} className="min-h-11 rounded-lg bg-blue-600 px-3 text-white disabled:opacity-50">{busy ? 'Submitting…' : 'Request service'}</button><button disabled={busy} onClick={() => setSelected([])} className="min-h-11 px-3 text-info">Clear selection</button></div>}
    {!loading && !error && !visible.length && <p className="text-sm text-muted">No matching Test &amp; Tune projects.</p>}
    <div className="divide-y divide-subtle rounded-lg border border-subtle">
      {visible.map(p => <article key={p.id} className="min-w-0 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h2 className="break-words font-medium text-primary">{p.customer} · {p.name}</h2><p className="text-xs text-muted">{p.number} · {p.can_submit ? `Test & Tune through ${p.end_date}` : 'Expired or suspended · exception review required'}</p></div><a href={`/projects?projectId=${encodeURIComponent(p.id)}`} className="min-h-11 inline-flex items-center text-sm text-info">Open project →</a></div>
        {!p.tasks.length && <p className="text-sm text-muted">No unsubmitted adjustments.</p>}
        {p.tasks.map(t => <div key={t.id} className="flex items-start gap-3 py-2 text-sm">
          {!t.request_id && t.status === 'open' && <input className="mt-1 h-5 w-5 shrink-0" type="checkbox" aria-label={`Select ${t.customer_description || t.title}`} checked={selected.includes(t.id)} disabled={busy || !p.can_submit || Boolean(selectedProject && selectedProject.id !== p.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id))} />}
          <div className="min-w-0 flex-1 break-words"><p className="text-primary">{t.customer_description || t.title}</p><span className="text-xs text-muted">{t.visibility === 'internal' ? 'Internal' : 'Customer visible'} · {t.request_id ? 'Requested' : t.status}</span></div>
          {t.request_id && canViewServiceRequests && <a className="text-info" href={`/service-requests?serviceRequestId=${encodeURIComponent(t.request_id)}`}>View request →</a>}
        </div>)}
      </article>)}
    </div>
    <details className="rounded-lg border border-subtle p-3"><summary className="min-h-11 cursor-pointer text-sm text-info">Add an adjustment</summary>
      <div className="grid gap-2 pt-2">
        <select aria-label="Adjustment project" value={draft.project} onChange={e => setDraft({ ...draft, project: e.target.value })} className="min-h-11 min-w-0 rounded-lg border border-subtle bg-surface p-2 text-primary"><option value="">Choose customer and project</option>{scoped.filter(p => p.can_submit).map(p => <option key={p.id} value={p.id}>{p.customer} · {p.name}</option>)}</select>
        <input aria-label="Internal adjustment title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Internal title" className="min-h-11 min-w-0 rounded-lg border border-subtle bg-surface p-2 text-primary" />
        <label className="text-sm"><input type="checkbox" checked={draft.visible} onChange={e => setDraft({ ...draft, visible: e.target.checked })} /> Customer visible</label>
        {draft.visible && <textarea aria-label="Customer-safe adjustment description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Description the customer can see" className="min-h-20 min-w-0 rounded-lg border border-subtle bg-surface p-2 text-primary" />}
        <button disabled={busy || !draft.project || !draft.title.trim() || (draft.visible && !draft.description.trim())} onClick={() => void add()} className="min-h-11 rounded-lg bg-blue-600 px-3 text-white disabled:opacity-50">Save adjustment</button>
      </div>
    </details>
  </section>;
}
