import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { formatTimeInTimezone, getOrganizationTimezone } from '../../../lib/timezoneUtils';
export function ManualJobTimeRequests() {
  const [requests,setRequests] = useState<any[]>([]);
  const [timezone,setTimezone] = useState('America/Chicago');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState<string|null>(null);
  async function load() {
    const {data,error} = await supabase.from('manual_job_time_requests')
      .select('*,employee:profiles!technician_id(full_name),project:projects(name,project_number)')
      .eq('status','pending').order('created_at');
    if(error) setError(error.message); else setRequests(data || []);
  }
  useEffect(()=>{ void load(); void getOrganizationTimezone().then(setTimezone); },[]);
  async function review(id:string,action:string) {
    setBusy(id);setError('');
    const {error} = await supabase.rpc('review_manual_job_time_request',{p_request_id:id,p_action:action});
    if(error) setError(error.message); else await load();
    setBusy(null);
  }
  return <section className="rounded-xl border border-subtle bg-surface p-4 space-y-3">
    <h4 className="font-semibold text-primary">Manual Job Time Requests</h4>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!requests.length && !error && <p className="text-sm text-secondary">No requests awaiting review.</p>}
    {requests.map(r=><div key={r.id} className="rounded-lg border border-subtle p-3 space-y-2">
      <p className="text-sm font-semibold text-primary">{r.employee?.full_name} · {r.project?.project_number} · {r.project?.name}</p>
      <p className="text-sm text-secondary">{r.entry_date} · {formatTimeInTimezone(r.clock_in,timezone)}–{formatTimeInTimezone(r.clock_out,timezone)} · {((Date.parse(r.clock_out)-Date.parse(r.clock_in))/3600000-r.break_minutes/60).toFixed(2)} hours</p>
      <p className="text-sm text-primary">{r.reason}</p>
      <div className="flex gap-2"><button disabled={!!busy} onClick={()=>review(r.id,'approve')} className="rounded-lg bg-green-600 text-white px-3 py-2">Approve</button><button disabled={!!busy} onClick={()=>review(r.id,'deny')} className="rounded-lg border border-subtle text-primary px-3 py-2">Deny</button></div>
    </div>)}
  </section>;
}
