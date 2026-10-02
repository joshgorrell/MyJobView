import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { createTimestampInTimezone, formatDateInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';

export function ManualJobTimeRequestModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<{ id: string; name: string; project_number: string }[]>([]);
  const [project, setProject] = useState('');
  const [date, setDate] = useState('');
  const [timezone, setTimezone] = useState('');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('09:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const tz = await getOrganizationTimezone();
        const { data, error } = await supabase.from('projects').select('id,name,project_number')
          .eq('organization_id', profile!.organization_id).order('name');
        if (error) throw error;
        if (!disposed) { setTimezone(tz); setDate(formatDateInTimezone(new Date().toISOString(), tz)); setProjects(data || []); }
      } catch { if (!disposed) setError('Unable to load projects. Close and try again.'); }
    }
    if (profile) void load();
    return () => { disposed = true; };
  }, [profile?.id]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || !timezone || saving) return;
    setError('');
    try {
      const clockIn = createTimestampInTimezone(date,start,timezone);
      const clockOut = createTimestampInTimezone(date,end,timezone);
      if (clockOut <= clockIn) throw new Error('End time must be after start time.');
      if (new Date(clockOut) > new Date()) throw new Error('Request time that has already been worked.');
      setSaving(true);
      const { error } = await supabase.from('manual_job_time_requests').insert({
        organization_id: profile.organization_id, technician_id: profile.id, project_id: project,
        entry_date: date, clock_in: clockIn, clock_out: clockOut, reason: reason.trim(), status: 'pending',
      });
      if (error) throw error;
      onSubmitted(); onClose();
    } catch (error: any) { setError(error.message || 'Unable to submit request.'); }
    finally { setSaving(false); }
  }
  return <QuickActionModal title="Request Manual Job Time" subtitle="Work performed on a project outside a Work Order" icon={<Clock className="w-5 h-5" />} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-secondary">A manager must approve this request before it becomes payable job time. Use the normal Work Order for work recorded there.</p>
      {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
      <label className="block text-sm text-primary">Project<select required value={project} onChange={e=>setProject(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-gray-900 bg-white"><option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_number} — {p.name}</option>)}</select></label>
      <label className="block text-sm text-primary">Work date<input type="date" required value={date} max={timezone ? formatDateInTimezone(new Date().toISOString(),timezone) : undefined} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-gray-900 bg-white" /></label>
      <div className="grid grid-cols-2 gap-3">{[['Start time',start,setStart],['End time',end,setEnd]].map(([label,value,setter])=><label key={label as string} className="text-sm text-primary">{label as string}<input type="time" required value={value as string} onChange={e=>(setter as (v:string)=>void)(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-gray-900 bg-white" /></label>)}</div>
      <p className="text-xs text-secondary">Times are in {timezone || 'your organization timezone'}.</p>
      <label className="block text-sm text-primary">Why wasn’t this recorded through a Work Order?<textarea required minLength={3} value={reason} onChange={e=>setReason(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border p-2 text-gray-900 bg-white" /></label>
      <button type="submit" disabled={saving || !timezone} className="w-full rounded-lg bg-blue-600 text-white p-2 disabled:opacity-50">{saving ? 'Submitting…' : 'Submit for approval'}</button>
    </form>
  </QuickActionModal>;
}
