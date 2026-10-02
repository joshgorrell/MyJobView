import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { createTimestampInTimezone, formatDateInTimezone, formatTimeInTimezone, getOrganizationTimezone } from '../../../lib/timezoneUtils';
export function ManualJobTimeRequests() {
  const [requests,setRequests] = useState<any[]>([]);
  const [timezone,setTimezone] = useState('America/Chicago');
  const [error,setError] = useState('');
  const [editing,setEditing]=useState<{id:string;start:string;end:string;breakMinutes:number;notes:string}|null>(null);
  const [busy,setBusy] = useState<string|null>(null);
  async function load() {
    const {data,error} = await supabase.from('manual_job_time_requests')
      .select('*,employee:profiles!technician_id(full_name),project:projects(name,project_number)')
      .eq('status','pending').order('created_at');
    if(error) setError(error.message); else setRequests(data || []);
  }
  useEffect(()=>{ void load(); void getOrganizationTimezone().then(setTimezone); },[]);
  function beginEdit(r:any) {
    setEditing({id:r.id,start:formatDateInTimezone(r.clock_in,timezone,"yyyy-MM-dd'T'HH:mm"),
      end:formatDateInTimezone(r.clock_out,timezone,"yyyy-MM-dd'T'HH:mm"),breakMinutes:r.break_minutes,notes:''});
  }
  async function review(id:string,action:string) {
    setBusy(id);setError('');
    try {
      const edits=editing?.id===id && action==='approve' ? {
        p_clock_in:createTimestampInTimezone(editing.start.slice(0,10),editing.start.slice(11),timezone),
        p_clock_out:createTimestampInTimezone(editing.end.slice(0,10),editing.end.slice(11),timezone),
        p_entry_date:editing.start.slice(0,10),p_break_minutes:editing.breakMinutes,p_notes:editing.notes.trim(),
      }:{};
      const {error}=await supabase.rpc('review_manual_job_time_request',{p_request_id:id,p_action:action,...edits});
      if(error) throw error;
      setEditing(null);await load();
    } catch(error:any){setError(error.message||'Unable to review request');}
    finally{setBusy(null);}
  }
  return <section className="rounded-xl border border-subtle bg-surface p-4 space-y-3">
    <h4 className="font-semibold text-primary">Manual Job Time Requests</h4>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!requests.length && !error && <p className="text-sm text-secondary">No requests awaiting review.</p>}
    {requests.map(r=><div key={r.id} className="rounded-lg border border-subtle p-3 space-y-2">
      <p className="text-sm font-semibold text-primary">{r.employee?.full_name} · {r.project?.project_number} · {r.project?.name}</p>
      <p className="text-sm text-secondary">{r.entry_date} · {formatTimeInTimezone(r.clock_in,timezone)}–{formatTimeInTimezone(r.clock_out,timezone)} · {((Date.parse(r.clock_out)-Date.parse(r.clock_in))/3600000-r.break_minutes/60).toFixed(2)} hours</p>
      <p className="text-sm text-primary">{r.reason}</p>
      {editing && editing.id===r.id ? <form className="space-y-3" onSubmit={e=>{e.preventDefault();void review(r.id,'approve');}}>
        <p className="text-xs text-secondary">Adjust worked times in {timezone}. The original request is retained for the audit trail.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Start<input required type="datetime-local" value={editing.start} onChange={e=>setEditing(current=>current?{...current,start:e.target.value}:null)} className="block w-full border rounded-lg p-2 bg-white text-gray-900" /></label>
          <label className="text-sm">End<input required type="datetime-local" value={editing.end} onChange={e=>setEditing(current=>current?{...current,end:e.target.value}:null)} className="block w-full border rounded-lg p-2 bg-white text-gray-900" /></label>
        </div>
        <label className="block text-sm">Unpaid break minutes<input required type="number" min="0" step="1" value={editing.breakMinutes} onChange={e=>setEditing(current=>current?{...current,breakMinutes:Number(e.target.value)}:null)} className="block w-full border rounded-lg p-2 bg-white text-gray-900" /></label>
        <label className="block text-sm">Reason for adjustment<textarea required minLength={3} value={editing.notes} onChange={e=>setEditing(current=>current?{...current,notes:e.target.value}:null)} className="block w-full border rounded-lg p-2 bg-white text-gray-900" /></label>
        <div className="flex gap-2"><button disabled={!!busy} type="submit" className="rounded-lg bg-green-600 text-white px-3 py-2">Save & Approve</button><button type="button" disabled={!!busy} onClick={()=>setEditing(null)} className="rounded-lg border border-subtle px-3 py-2">Cancel</button></div>
      </form>:<div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={()=>review(r.id,'approve')} className="rounded-lg bg-green-600 text-white px-3 py-2">Approve</button><button disabled={!!busy} onClick={()=>review(r.id,'deny')} className="rounded-lg border border-subtle text-primary px-3 py-2">Deny</button><button disabled={!!busy} onClick={()=>beginEdit(r)} className="rounded-lg border border-subtle px-3 py-2">Edit & Approve</button></div>}
    </div>)}
  </section>;
}
