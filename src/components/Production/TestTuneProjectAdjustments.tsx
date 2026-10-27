import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { SupportPhotos } from '../Shared/SupportPhotos';

type Adjustment = { id: string; title: string; customer_description: string | null; visibility: string; status: string; request_id: string | null; source?: string; created_at?: string; updated_at?: string; service_status?: string | null; photos?: string[] };
type Project = { id: string; contact_id: string; name: string; number: string | null; customer: string; can_submit: boolean; end_date: string; tasks: Adjustment[] };
export function TestTuneProjectAdjustments({ canViewServiceRequests = false }: { canViewServiceRequests?: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ id: string; top: number; left: number } | null>(null);
  const previewCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelPreviewClose() {
    if (previewCloseTimer.current !== null) { clearTimeout(previewCloseTimer.current); previewCloseTimer.current = null; }
  }
  function closePreviewSoon() {
    cancelPreviewClose();
    previewCloseTimer.current = setTimeout(() => setPreview(null), 220);
  }
  function showPreview(id: string, element: HTMLElement) {
    cancelPreviewClose();
    const rect = element.getBoundingClientRect();
    setPreview({ id, top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 320)), left: Math.max(8, Math.min(rect.left, window.innerWidth - 380)) });
  }
  useEffect(() => {
    if (!preview) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [preview]);
  useEffect(() => () => cancelPreviewClose(), []);

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
    } catch (failure) { if (revision === generation.current) setError((failure as Error).message || 'Could not load punchlist.'); }
    finally { if (revision === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const route = () => { const params = new URLSearchParams(window.location.search); setContext(params); setSelected([]); };
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
      setNotice('Selected punchlist items linked to Service Requests.');
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
  const projectId = context.get('projectId'), contactId = context.get('contactId'), taskId = context.get('taskId'), requestId = context.get('serviceRequestId'), taskStatus = context.get('tuneStatus');
  const scoped = projects.filter(p => (!projectId || p.id === projectId) && (!contactId || p.contact_id === contactId) && (customerFilter === 'all' || p.contact_id === customerFilter) && (projectFilter === 'all' || p.id === projectFilter));
  const dateCutoff = dateFilter === 'all' ? 0 : Date.now() - Number(dateFilter) * 86400000;
  const visible = scoped.map(p => ({ ...p, tasks: p.tasks.filter(t => (sourceFilter === 'all' || t.source === sourceFilter) && (!dateCutoff || (Date.parse(t.updated_at || t.created_at || '') || 0) >= dateCutoff) && (!taskId || t.id === taskId) && (!requestId || t.request_id === requestId) && (visibilityFilter === 'all' || t.visibility === visibilityFilter) && (statusFilter === 'all' || (statusFilter === 'requested' ? Boolean(t.request_id) : statusFilter === 'unsubmitted' ? !t.request_id && t.status === 'open' : statusFilter === 'completed' ? t.status === 'completed' || (Boolean(t.request_id) && ['closed', 'completed'].includes(t.service_status || '')) : t.status === statusFilter)) && (!taskStatus || taskStatus === 'all' || (taskStatus === 'requested' ? Boolean(t.request_id) : t.status === taskStatus))) }))
    .filter(p => p.tasks.length > 0 && p.tasks.some(t => [p.customer, p.name, p.number, t.customer_description, t.title].some(v => v?.toLowerCase().includes(search.toLowerCase()))));
  const rows = visible.flatMap(p => p.tasks.filter(t => [p.customer, p.name, p.number, t.customer_description, t.title].some(v => v?.toLowerCase().includes(search.toLowerCase()))).map(t => ({ p, t }))).sort((a, b) => (Date.parse(b.t.updated_at || b.t.created_at || '') || 0) - (Date.parse(a.t.updated_at || a.t.created_at || '') || 0));
  const summary = scoped.flatMap(p => p.tasks).filter(t => (sourceFilter === 'all' || t.source === sourceFilter) && (visibilityFilter === 'all' || t.visibility === visibilityFilter) && (!dateCutoff || (Date.parse(t.updated_at || t.created_at || '') || 0) >= dateCutoff) && (!taskId || t.id === taskId) && (!requestId || t.request_id === requestId) && [search.toLowerCase()].every(q => !q || [t.title, t.customer_description, ...scoped.filter(p => p.tasks.some(item => item.id === t.id)).flatMap(p => [p.customer, p.name, p.number])].some(v => v?.toLowerCase().includes(q))));
  const summaryCounts = { all: summary.length, unsubmitted: summary.filter(t => !t.request_id && t.status === 'open').length, requested: summary.filter(t => Boolean(t.request_id)).length, completed: summary.filter(t => t.status === 'completed' || (Boolean(t.request_id) && ['closed', 'completed'].includes(t.service_status || ''))).length };
  return <section className="min-w-0 space-y-3" aria-label="Test and Tune punchlist feed">
    <div data-testid="punchlist-toolbar" className="flex flex-wrap items-center gap-2">
      <input aria-label="Search Test and Tune punchlist" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search punchlist descriptions, customers or projects" className="min-h-11 min-w-0 flex-1 rounded-lg border border-subtle bg-surface px-3 text-primary" />
      <select aria-label="Filter punchlist status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="min-h-11 rounded-lg border border-subtle bg-surface px-2 text-primary"><option value="all">All statuses</option><option value="unsubmitted">Not submitted</option><option value="requested">Service requested</option><option value="completed">Completed</option></select><select aria-label="Filter punchlist visibility" value={visibilityFilter} onChange={e => setVisibilityFilter(e.target.value)} className="min-h-11 rounded-lg border border-subtle bg-surface px-2 text-primary"><option value="all">All visibility</option><option value="customer_visible">Public</option><option value="internal">Private</option></select>
      <select aria-label="Filter punchlist customer" value={customerFilter} onChange={e => { setCustomerFilter(e.target.value); setProjectFilter('all'); }}><option value="all">All customers</option>{Array.from(new Map(projects.map(p => [p.contact_id, p.customer])).entries()).sort((a,b) => a[1].localeCompare(b[1])).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select aria-label="Filter punchlist project" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}><option value="all">All projects</option>{projects.filter(p => customerFilter === 'all' || p.contact_id === customerFilter).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select aria-label="Filter punchlist source" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="all">All sources</option><option value="customer">Customer</option><option value="manual">Employee</option><option value="proposal">Project</option></select>
      <select aria-label="Filter punchlist date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}><option value="all">Any update date</option><option value="1">Past 24 hours</option><option value="7">Past 7 days</option><option value="30">Past 30 days</option><option value="90">Past 90 days</option></select>
      <button disabled={busy} onClick={() => void load()} className="min-h-11 px-3 text-info">Refresh</button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Punchlist summary filters">{([{ key: 'all', label: 'All items' }, { key: 'unsubmitted', label: 'Not submitted' }, { key: 'requested', label: 'Service requested' }, { key: 'completed', label: 'Completed' }] as const).map(item => <button key={item.key} type="button" aria-pressed={statusFilter === item.key} onClick={() => setStatusFilter(item.key)} className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${statusFilter === item.key ? 'border-blue-500 bg-blue-500/10 text-primary' : 'border-subtle text-secondary'}`}><strong>{summaryCounts[item.key]}</strong> {item.label}</button>)}</div>
    {loading && <p role="status">Loading punchlist…</p>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {notice && <p role="status" className="break-words text-sm text-secondary">{notice}</p>}
    {(projectId || contactId) && !loading && !error && scoped.length === 0 && <p role="alert">This customer or project is unavailable or you no longer have access.</p>}
    {(taskId || requestId) && !loading && !error && !visible.some(p => p.tasks.length) && <p role="alert">This punchlist item or request is unavailable in the selected project.</p>}
    {lastRequestId && canViewServiceRequests && <a href={`/service-requests?serviceRequestId=${encodeURIComponent(lastRequestId)}`} className="inline-flex min-h-11 items-center text-sm text-info">View service request →</a>}
    {selected.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm"><span>{selected.length} selected · {selectedProject?.customer}</span><button disabled={busy || !selectedProject?.can_submit} onClick={() => void submit()} className="min-h-11 rounded-lg bg-blue-600 px-3 text-white disabled:opacity-50">{busy ? 'Submitting…' : 'Request service'}</button><button disabled={busy} onClick={() => setSelected([])} className="min-h-11 px-3 text-info">Clear selection</button></div>}
    {!loading && !error && !visible.length && <p className="text-sm text-muted">No matching Test &amp; Tune projects.</p>}
    <div className="overflow-x-auto rounded-lg border border-subtle">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-surface text-xs text-muted"><tr><th className="p-3">Select</th><th className="p-3">Updated</th><th className="p-3">Customer / Project</th><th className="p-3">Punchlist item</th><th className="p-3" title="Source">Source</th><th className="p-3" title="Visibility">👁</th><th className="p-3" title="Service status">Status</th><th className="p-3">Details</th></tr></thead>
        <tbody className="divide-y divide-subtle">
          {rows.map(({ p, t }) => {
            const description = t.customer_description || t.title;
            const requested = Boolean(t.request_id);
            const status = requested ? (t.service_status === 'closed' || t.service_status === 'completed' ? 'Completed' : t.service_status === 'scheduled' ? 'Scheduled' : 'Service requested') : t.status === 'open' ? 'Not submitted' : t.status;
            return <tr key={t.id} className="group relative hover:bg-surface/70 focus-within:bg-surface/70">
              <td className="p-3 align-top">{!requested && t.status === 'open' && <input className="h-5 w-5" type="checkbox" aria-label={`Select ${description}`} checked={selected.includes(t.id)} disabled={busy || !p.can_submit || Boolean(selectedProject && selectedProject.id !== p.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id))} />}</td>
              <td className="whitespace-nowrap p-3 align-top text-xs text-muted">{t.updated_at || t.created_at ? new Date(t.updated_at || t.created_at!).toLocaleString() : "—"}</td><td className="p-3 align-top"><a className="font-medium text-primary hover:underline" href={`/projects?projectId=${encodeURIComponent(p.id)}`}>{p.customer}</a><div className="text-xs text-muted">{p.name}</div></td>
              <td className="max-w-[520px] p-3 align-top">
                <div className="relative">
                  <button type="button" aria-label={`Preview ${description}`}
                    aria-expanded={preview?.id === t.id}
                    onMouseEnter={event => showPreview(t.id, event.currentTarget)}
                    onMouseLeave={closePreviewSoon}
                    onFocus={event => showPreview(t.id, event.currentTarget)}
                    onClick={event => showPreview(t.id, event.currentTarget)}
                    className="w-full break-words text-left text-primary hover:underline focus:underline">{description}</button>
                </div>
              </td>
              <td className="p-3 align-top"><span role="img" aria-label={t.source === 'customer' ? 'Customer' : t.source === 'manual' ? 'Employee' : 'Project'} title={t.source === 'customer' ? 'Customer' : t.source === 'manual' ? 'Employee' : 'Project'}>{t.source === 'customer' ? '👤' : t.source === 'manual' ? '🛠️' : '📋'}</span></td><td className="p-3 align-top"><span role="img" aria-label={t.visibility === 'internal' ? 'Private' : 'Public'} title={t.visibility === 'internal' ? 'Private' : 'Public'}>{t.visibility === 'internal' ? '🔒' : '👁️'}</span></td>
              <td className="p-3 align-top"><span title={status} aria-label={status} className="whitespace-nowrap">{status === 'Completed' ? '✅' : status === 'Scheduled' ? '📅' : requested ? '📤' : '🕒'} <span className="sr-only">{status}</span></span></td>
              <td className="p-3 align-top">{requested && canViewServiceRequests ? <a className="whitespace-nowrap text-info hover:underline" href={`/service-requests?serviceRequestId=${encodeURIComponent(t.request_id!)}`}>View request →</a> : <a className="whitespace-nowrap text-info hover:underline" href={`/projects?projectId=${encodeURIComponent(p.id)}`}>View project →</a>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {preview && (() => {
      const match = rows.find(({ t }) => t.id === preview.id);
      if (!match) return null;
      const { p, t } = match;
      const requested = Boolean(t.request_id);
      const status = requested ? (['closed', 'completed'].includes(t.service_status || '') ? 'Completed' : t.service_status === 'scheduled' ? 'Scheduled' : 'Service requested') : t.status === 'open' ? 'Not submitted' : t.status;
      return <div role="dialog" aria-label={`Punchlist preview: ${t.title}`}
        style={{ top: preview.top, left: preview.left }}
        onMouseEnter={cancelPreviewClose} onMouseLeave={closePreviewSoon}
        className="fixed z-[100] max-h-[70vh] w-[min(360px,calc(100vw-16px))] overflow-y-auto rounded-lg border border-subtle bg-surface p-4 text-sm text-primary shadow-2xl">
        <div className="flex items-start justify-between gap-3"><p className="font-semibold">{t.title}</p>
          <button type="button" aria-label="Close punchlist preview" onClick={() => setPreview(null)} className="min-h-9 min-w-9 rounded border border-subtle">×</button></div>
        <p className="mt-1 whitespace-pre-wrap break-words">{t.customer_description || t.title}</p>
        {Boolean(t.photos?.length) && <div className="mt-2"><SupportPhotos paths={t.photos || []} /></div>}
        <p className="mt-2 text-xs text-muted">{p.customer} · {p.name}</p>
        <p className="mt-1 text-xs text-muted">{t.visibility === 'internal' ? 'Private' : 'Public'} · {status}</p>
        {requested && canViewServiceRequests && <a className="mt-2 block text-info underline" href={`/service-requests?serviceRequestId=${encodeURIComponent(t.request_id!)}`}>View service request →</a>}
      </div>;
    })()}
    <details className="rounded-lg border border-subtle p-3"><summary className="min-h-11 cursor-pointer text-sm text-info">Add punchlist item</summary>
      <div className="grid gap-2 pt-2">
        <select aria-label="Punchlist project" value={draft.project} onChange={e => setDraft({ ...draft, project: e.target.value })} className="min-h-11 min-w-0 rounded-lg border border-subtle bg-surface p-2 text-primary"><option value="">Choose customer and project</option>{scoped.filter(p => p.can_submit).map(p => <option key={p.id} value={p.id}>{p.customer} · {p.name}</option>)}</select>
        <input aria-label="Punchlist item title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Internal title" className="min-h-11 min-w-0 rounded-lg border border-subtle bg-surface p-2 text-primary" />
        <label className="text-sm"><input type="checkbox" checked={draft.visible} onChange={e => setDraft({ ...draft, visible: e.target.checked })} /> Customer visible</label>
        {draft.visible && <textarea aria-label="Customer-visible description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Description the customer can see" className="min-h-20 min-w-0 rounded-lg border border-subtle bg-surface p-2 text-primary" />}
        <button disabled={busy || !draft.project || !draft.title.trim() || (draft.visible && !draft.description.trim())} onClick={() => void add()} className="min-h-11 rounded-lg bg-blue-600 px-3 text-white disabled:opacity-50">Save punchlist item</button>
      </div>
    </details>
  </section>;
}
