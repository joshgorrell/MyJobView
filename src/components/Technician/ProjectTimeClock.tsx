import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type Project = { id: string; name: string; status: string };
type ActiveEntry = { id: string; project_id: string | null; clock_in: string; notes: string | null };

export function ProjectTimeClock({ onChanged }: { onChanged: () => void }) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [active, setActive] = useState<ActiveEntry | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  async function refresh() {
    if (!profile?.id) return;
    setLoading(true);
    const [projectsResult, activeResult] = await Promise.all([
      supabase.from('projects').select('id,name,status').not('status', 'in', '("completed","cancelled","archived")').order('name').limit(500),
      supabase.from('time_entries').select('id,project_id,clock_in,notes').eq('technician_id', profile.id).is('clock_out', null).in('status', ['draft', 'submitted']).order('clock_in', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (projectsResult.error || activeResult.error) setError(projectsResult.error?.message || activeResult.error?.message || 'Unable to load job time.');
    else {
      setProjects(projectsResult.data ?? []);
      setActive(activeResult.data ?? null);
      if (activeResult.data?.project_id) setProjectId(activeResult.data.project_id);
      setError('');
    }
    setLoading(false);
  }
  useEffect(() => { void refresh(); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [profile?.id]);

  async function start() {
    if (!profile?.id || !projectId || busy || active) return;
    setBusy(true); setError('');
    try {
      const { data: existing, error: checkError } = await supabase.from('time_entries').select('id').eq('technician_id', profile.id).is('clock_out', null).in('status', ['draft', 'submitted']).limit(1);
      if (checkError) throw checkError;
      if (existing?.length) throw new Error('Stop your running job time before starting another.');
      const startTime = new Date();
      const { error: insertError } = await supabase.from('time_entries').insert({
        technician_id: profile.id, project_id: projectId, work_order_id: null, entry_type: 'project',
        entry_date: startTime.toLocaleDateString('en-CA'), clock_in: startTime.toISOString(), status: 'draft', notes: notes.trim() || null,
      });
      if (insertError) throw insertError;
      setNotes(''); await refresh(); onChanged();
    } catch (e: any) { setError(e.message || 'Unable to start project time.'); }
    finally { setBusy(false); }
  }

  async function stop() {
    if (!active || busy) return;
    setBusy(true); setError('');
    try {
      const endTime = new Date();
      const hours = Math.max(0, (endTime.getTime() - new Date(active.clock_in).getTime()) / 3600000);
      const { data, error: updateError } = await supabase.from('time_entries')
        .update({ clock_out: endTime.toISOString(), total_hours: Number(hours.toFixed(4)), notes: notes.trim() || active.notes || null, status: 'submitted' })
        .eq('id', active.id).eq('technician_id', profile?.id).is('clock_out', null).select('id');
      if (updateError) throw updateError;
      if (!data?.length) throw new Error('The active time entry could not be updated.');
      setNotes(''); await refresh(); onChanged();
    } catch (e: any) { setError(e.message || 'Unable to stop project time.'); }
    finally { setBusy(false); }
  }

  const filtered = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const elapsed = active ? Math.max(0, Math.floor((now - new Date(active.clock_in).getTime()) / 60000)) : 0;
  return <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
    <h3 className="font-semibold text-gray-900">Project Time</h3>
    {loading && <p className="text-sm text-gray-500">Loading projects and active time…</p>}
    {active ? <p className="text-sm font-medium text-green-700">Time running · {Math.floor(elapsed / 60)}h {elapsed % 60}m</p> : <>
      <label className="block text-sm font-medium text-gray-700">Find an open project
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects" className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
      </label>
      <select aria-label="Open project" value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full rounded-lg border border-gray-300 p-2">
        <option value="">Select project</option>
        {filtered.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </>}
    <label className="block text-sm font-medium text-gray-700">Notes
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={active ? 'What did you work on?' : 'Optional notes'} rows={2} className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
    </label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {active ? <button type="button" disabled={busy || loading} onClick={stop} className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Stop Time</button>
      : <button type="button" disabled={busy || loading || !projectId} onClick={start} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Start Time</button>}
  </div>;
}
