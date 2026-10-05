import { cacheVisitPacket, readVisitPacket, queueVisitEvent, syncVisitEvents, pendingVisitEvents, discardVisitEvent, PendingVisitEvent } from '../../lib/jobOffline';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, ClipboardList } from 'lucide-react';

type MasterTask = { id: string; title: string; description: string | null; status: string; progress_status: string; estimated_hours: number | null; room_name: string | null; phase_name: string | null; covered_items?: Array<{id:string;description:string;quantity:number}> };
type Assignment = { id: string; title: string; description: string | null; status: string; project_task_id: string | null; visit_instructions: string | null; estimated_hours: number | null; progress_version: number };
type Update = { id: string; project_task_id: string | null; work_order_task_id: string; work_order_id: string; disposition: string; notes: string | null; created_at: string; technician_name?: string; completes_project_task: boolean; is_legacy?: boolean; actual_hours?: number | null };
type Handoff = { captured_at: string; overall_scope: string | null; rooms: Array<{ id: string; name: string; description: string | null }>; equipment: Array<{ id: string; room_id: string | null; description: string; quantity: number; unit: string; task_notes: string | null; programming_notes: string | null;equipment_removed?:boolean;phase_notes?:Array<{name:string;notes:string}> }> };
type Context = { id: string; name: string; sold_handoff: Handoff | null;retained_handoff?:Handoff|null;approved_scopes?:Array<{id:string;scope:Handoff;created_at:string}>; tasks: MasterTask[]; history: Update[] };
const labels: Record<string, string> = { pending: 'Not started', in_progress: 'In progress', partial: 'Partial', blocked: 'Blocked', completed: 'Complete', cancelled: 'Cancelled', reopened: 'Reopened' };
const estimate = (value: number | null) => value == null || value === 0 ? 'Not estimated' : `${value}h estimated`;

export default function WorkOrderTasksChecklist({ workOrderId, projectId, currentUserId }: {
  workOrderId: string; projectId?: string | null; laborPhaseId?: string | null;
  workOrderGroupId?: string | null; isGroupWorkOrder?: boolean; currentUserId: string;
}) {
  const [offline,setOffline]=useState(false),[pending,setPending]=useState<PendingVisitEvent[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [context, setContext] = useState<Context | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [view, setView] = useState<'today' | 'project'>('today');
  const [scopeVersion,setScopeVersion]=useState('current');
  const [filter, setFilter] = useState('all');
  const [roomFilter,setRoomFilter] = useState('all');
  const [phaseFilter,setPhaseFilter] = useState('all');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const request = useRef(0);
  const writeInFlight = useRef(false);
  const eventKeys = useRef<Record<string, string>>({});

  async function load() {
    const current = ++request.current;
    setLoading(true);
    try {
      if(!navigator.onLine){const saved=readVisitPacket(currentUserId,workOrderId);if(!saved)throw new Error('Open this visit online once to save its full instructions.');setAssignments(saved.packet.assignments);setContext(saved.packet.context);setUpdates(saved.packet.updates);setPending(pendingVisitEvents(currentUserId));setOffline(true);setError('');return;}
      try{await syncVisitEvents(currentUserId);}catch(failure){setError((failure as {message?:string}).message||'Saved progress needs review.');}
      const [tasksResult, contextResult, updatesResult] = await Promise.all([
        supabase.from('work_order_tasks').select('*').eq('work_order_id', workOrderId).order('sort_order'),
        projectId ? supabase.rpc('get_work_order_project_context', { p_work_order_id: workOrderId }) : Promise.resolve({ data: null, error: null }),
        supabase.from('project_task_activity').select('*').eq('work_order_id', workOrderId).order('created_at', { ascending: false }),
      ]);
      for (const result of [tasksResult, contextResult, updatesResult]) if (result.error) throw result.error;
      if (current !== request.current) return;
      setAssignments(tasksResult.data || []); setContext(contextResult.data); setUpdates(updatesResult.data || []); setOffline(false);setPending(pendingVisitEvents(currentUserId));if(!pendingVisitEvents(currentUserId).length)setError('');
      try{cacheVisitPacket(currentUserId,workOrderId,{assignments:tasksResult.data||[],context:contextResult.data,updates:updatesResult.data||[]});}catch{/* Online reading remains available if storage is full. */}
    } catch (failure) {
      if (current === request.current) setError(failure instanceof Error ? failure.message : 'Tasks could not be loaded.');
    } finally { if (current === request.current) setLoading(false); }
  }
  useEffect(() => {
    setView('today'); setNotes({}); load();
    const channel = supabase.channel(`visit-tasks-${workOrderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_tasks', filter: `work_order_id=eq.${workOrderId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_task_updates', filter: `work_order_id=eq.${workOrderId}` }, load);
    if (projectId) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks', filter: `project_id=eq.${projectId}` }, load);
    channel.subscribe();
    const refresh = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', refresh);window.addEventListener('online',load);window.addEventListener('offline',load);
    return () => { request.current++; channel.unsubscribe(); document.removeEventListener('visibilitychange', refresh);window.removeEventListener('online',load);window.removeEventListener('offline',load); };
  }, [workOrderId, projectId, currentUserId]);

  async function report(task: Assignment, disposition: string, completeProject = false) {
    if (writeInFlight.current) return;
    writeInFlight.current = true; setSaving(task.id); setError('');
    const action = JSON.stringify([task.id, disposition, notes[task.id] || null, completeProject, task.progress_version]);
    const eventId = eventKeys.current[action] ||= crypto.randomUUID();
    try {
      queueVisitEvent(currentUserId,{p_event_id:eventId,p_expected_version:task.progress_version,p_assignment_id:task.id,p_disposition:disposition,p_notes:notes[task.id]||null,p_complete_project:completeProject});
      await syncVisitEvents(currentUserId);
      delete eventKeys.current[action];
      setNotes(previous => ({ ...previous, [task.id]: '' })); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : (failure as { message?: string })?.message || 'Progress could not be saved.'); }
    finally { setPending(pendingVisitEvents(currentUserId));writeInFlight.current = false; setSaving(null); }
  }
  function history(rows: Update[]) {
    return <details className="mt-3"><summary className="cursor-pointer text-sm text-info min-h-11">Visit history ({rows.length})</summary>
      <ul className="space-y-2">{rows.map(row => <li key={row.id} className="border-l-2 border-subtle pl-3 text-sm text-secondary">
        <p>{row.technician_name || 'Technician'} · {new Date(row.created_at).toLocaleString()} · {labels[row.disposition]}{row.completes_project_task ? ' · Entire project task completed' : ''}{row.is_legacy ? ' · Earlier completion record' : ''}{row.actual_hours ? ` · ${row.actual_hours}h recorded` : ''}</p>
        {row.notes && <p className="whitespace-pre-wrap mt-1">{row.notes}</p>}
      </li>)}</ul>
    </details>;
  }
  const handoff = scopeVersion==='sold'?context?.sold_handoff:scopeVersion==='retained'?context?.retained_handoff:scopeVersion==='current'?(context?.approved_scopes?.[context.approved_scopes.length-1]?.scope||context?.sold_handoff||context?.retained_handoff):context?.approved_scopes?.find(s=>s.id===scopeVersion)?.scope;
  const scopeLabel=scopeVersion==='sold'?'Original sold scope':scopeVersion==='retained'?'Earliest reviewed scope':'Approved scope';
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setView('today')} className={`min-h-11 px-4 rounded-lg border border-subtle ${view === 'today' ? 'bg-blue-600 text-white' : 'bg-surface text-primary'}`}>Today's Work ({assignments.length})</button>
      {projectId && <button type="button" onClick={() => setView('project')} className={`min-h-11 px-4 rounded-lg border border-subtle ${view === 'project' ? 'bg-blue-600 text-white' : 'bg-surface text-primary'}`}>Full Project</button>}
      <button type="button" onClick={load} className="min-h-11 px-3 text-info">Refresh</button>
    </div>
    {offline&&<p className="text-sm text-secondary">Viewing saved instructions offline. Progress is saved on this device until it can sync.</p>}
    {pending.filter(p=>assignments.some(a=>a.id===p.event.p_assignment_id)).map(p=><div key={p.event.p_event_id} className="border border-subtle rounded-lg p-3 bg-surface text-sm text-primary"><strong>Update awaiting sync</strong><p>{p.event.p_disposition} · {p.event.p_notes}</p>{p.error&&<p role="alert" className="text-red-600">{p.error} Refresh and review the current task before reporting again.</p>}<button className="min-h-11 px-3 text-info" onClick={()=>{setNotes(n=>({...n,[p.event.p_assignment_id]:p.event.p_notes||''}));discardVisitEvent(currentUserId,p.event.p_event_id);load();}}>Use notes to report again</button><button className="min-h-11 px-3 text-secondary" onClick={()=>{if(window.confirm('Discard this saved update?')){discardVisitEvent(currentUserId,p.event.p_event_id);load();}}}>Discard update</button></div>)}
    {error && <p role="alert" className="text-sm text-red-600">{error} <button type="button" onClick={load} className="underline min-h-11">Retry</button></p>}
    {loading && !assignments.length && <p className="text-muted">Loading task instructions...</p>}
    {view === 'today' && <>
      <p className="text-sm text-secondary">Assigned work for this visit. Completing your portion leaves the project task open until the entire task is explicitly completed.</p>
      {!loading && !assignments.length && <p className="text-muted">No checklist tasks assigned. Follow the work order instructions.</p>}
      {assignments.map(task => {
        const master = context?.tasks.find(value => value.id === task.project_task_id);
        const rows = task.project_task_id ? context?.history.filter(row => row.project_task_id === task.project_task_id) || [] : updates.filter(row => row.work_order_task_id === task.id);
        const disabled = saving !== null || pending.some(p=>p.event.p_assignment_id===task.id) || master?.status === 'cancelled';
        return <article key={task.id} className="bg-surface border border-subtle rounded-lg p-3 space-y-2">
          <div className="flex gap-2 items-start"><ClipboardList className="w-5 h-5 text-info shrink-0" /><h3 className="font-semibold text-primary">{master?.title || task.title}</h3></div>
          <p className="text-xs text-muted">{master?.room_name || 'General'} · {master?.phase_name || 'No phase'} · {estimate(master?.estimated_hours ?? task.estimated_hours)}</p>
          <p className="text-sm text-primary">Visit: {labels[task.status] || task.status}{master && ` · Project task: ${master.status === 'open' ? labels[master.progress_status] || 'Open' : labels[master.status] || master.status}`}</p>
          {(master?.description || task.description) && <p className="text-sm text-secondary whitespace-pre-wrap">{master?.description || task.description}</p>}
          {master && master.description !== task.description && <details><summary className="text-xs text-info cursor-pointer min-h-11">Instructions when assigned</summary><p className="text-sm text-secondary whitespace-pre-wrap">{task.description || 'No instructions recorded.'}</p></details>}
          {task.visit_instructions && <p className="text-sm text-primary whitespace-pre-wrap border-l-2 border-blue-500 pl-3">This visit: {task.visit_instructions}</p>}
          {!!master?.covered_items?.length && <details><summary className="min-h-11 text-sm text-info cursor-pointer">Covered equipment ({master.covered_items.length})</summary><ul>{master.covered_items.map(item=><li key={item.id} className="text-sm text-secondary">{item.quantity} · {item.description}</li>)}</ul></details>}
          {history(rows)}
          <label className="block text-sm text-secondary">Progress / remaining work<textarea value={notes[task.id] || ''} onChange={event => setNotes(previous => ({ ...previous, [task.id]: event.target.value }))} className="block w-full mt-1 rounded-lg border border-subtle bg-surface text-primary p-2" rows={2} /></label>
          <div className="flex flex-wrap gap-2">
            {['in_progress','partial','blocked','completed'].map(disposition => <button key={disposition} type="button" disabled={disabled} onClick={() => report(task, disposition)} className="min-h-11 px-3 rounded-lg border border-subtle text-primary disabled:opacity-50">{disposition === 'completed' ? 'Finish my portion' : labels[disposition]}</button>)}
            {master && master.status !== 'completed' && master.status !== 'cancelled' && <button type="button" disabled={disabled} onClick={() => report(task, 'completed', true)} className="min-h-11 px-3 rounded-lg bg-green-600 text-white disabled:opacity-50">Complete entire project task</button>}
            {(task.status === 'completed' || master?.status === 'completed') && <button type="button" disabled={disabled} onClick={() => report(task, 'reopened')} className="min-h-11 px-3 text-info disabled:opacity-50">Reopen with note</button>}
          </div>
        </article>;
      })}
    </>}
    {view === 'project' && context && <>
      <h3 className="font-semibold text-primary">{context.name}</h3>
      <label className="block text-sm text-secondary">Scope version <select className="p-2 bg-surface text-primary border border-subtle rounded-lg" value={scopeVersion} onChange={e=>setScopeVersion(e.target.value)}><option value="current">Current approved scope</option>{context.sold_handoff&&<option value="sold">Original sold scope</option>}{context.retained_handoff&&<option value="retained">Earliest reviewed scope</option>}{context.approved_scopes?.map(v=><option key={v.id} value={v.id}>Approved change · {new Date(v.created_at).toLocaleDateString()}</option>)}</select></label>
      {handoff ? <details open className="bg-surface border border-subtle rounded-lg p-3"><summary className="font-semibold text-primary cursor-pointer min-h-11">{scopeLabel} · {new Date(handoff.captured_at).toLocaleDateString()}</summary>
        <p className="text-secondary text-sm whitespace-pre-wrap my-3">{handoff.overall_scope || 'No overall scope recorded.'}</p>
        {handoff.rooms.map(room => <details key={room.id} className="border-t border-subtle py-3"><summary className="font-medium text-primary cursor-pointer min-h-11">{room.name}</summary><p className="whitespace-pre-wrap text-sm text-secondary">{room.description || 'No room scope recorded.'}</p>
          <ul className="space-y-2 mt-3">{handoff.equipment.filter(item => item.room_id === room.id).map(item => <li key={item.id} className="text-sm text-primary">{item.quantity} {item.unit} · {item.description}{item.equipment_removed&&<span> · Labor only; equipment removed</span>}{item.task_notes && <p className="text-secondary whitespace-pre-wrap">{item.task_notes}</p>}{item.programming_notes && <p className="text-secondary whitespace-pre-wrap">{item.programming_notes}</p>}{item.phase_notes?.map((ph,index)=>ph.notes&&<p key={index} className="text-secondary whitespace-pre-wrap">{ph.name}: {ph.notes}</p>)}</li>)}</ul>
        </details>)}
        <ul className="space-y-2">{handoff.equipment.filter(item => !item.room_id).map(item => <li key={item.id} className="text-sm text-primary">{item.quantity} {item.unit} · {item.description}{item.equipment_removed&&<span> · Labor only; equipment removed</span>}</li>)}</ul>
      </details> : <p className="text-sm text-muted">This older project has no verified original sold scope snapshot. Scope recovery requires review.</p>}
      <label className="block text-sm text-secondary">Task status<select value={filter} onChange={event => setFilter(event.target.value)} className="ml-2 p-2 bg-surface text-primary border border-subtle rounded-lg"><option value="all">All tasks</option><option value="open">Remaining</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      <div className="flex flex-wrap gap-3"><label className="text-sm text-secondary">Room / Area<select value={roomFilter} onChange={event=>setRoomFilter(event.target.value)} className="ml-2 p-2 bg-surface text-primary border border-subtle rounded-lg"><option value="all">All rooms</option>{[...new Set(context.tasks.map(task=>task.room_name||'General'))].map(room=><option key={room} value={room}>{room}</option>)}</select></label><label className="text-sm text-secondary">Labor phase<select value={phaseFilter} onChange={event=>setPhaseFilter(event.target.value)} className="ml-2 p-2 bg-surface text-primary border border-subtle rounded-lg"><option value="all">All phases</option>{[...new Set(context.tasks.map(task=>task.phase_name||'No phase'))].map(phase=><option key={phase} value={phase}>{phase}</option>)}</select></label></div>
      <p className="text-xs text-muted">{context.tasks.length} tasks · {context.tasks.reduce((sum, task) => sum + (task.estimated_hours || 0), 0).toFixed(1)}h estimated</p>
      {context.tasks.filter(task => (filter === 'all' || task.status === filter) && (roomFilter === 'all' || (task.room_name || 'General') === roomFilter) && (phaseFilter === 'all' || (task.phase_name || 'No phase') === phaseFilter)).map(task => <article key={task.id} className="border border-subtle rounded-lg p-3 bg-surface">
        <h4 className="font-medium text-primary flex gap-2">{task.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-600" />}{task.title}</h4>
        <p className="text-xs text-muted mt-1">{task.room_name || 'General'} · {task.phase_name || 'No phase'} · {estimate(task.estimated_hours)} · {task.status === 'open' ? labels[task.progress_status] || 'Open' : labels[task.status]}</p>
        {task.description && <p className="text-sm text-secondary whitespace-pre-wrap mt-2">{task.description}</p>}
        {history(context.history.filter(row => row.project_task_id === task.id))}
      </article>)}
    </>}
  </section>;
}
