import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatDateInTimezone, formatTimeInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';

export function MyJobTimeView({salary=false}:{salary?:boolean}) {
  const {profile}=useAuth();
  const [entries,setEntries]=useState<any[]>([]);
  const [pending,setPending]=useState<any[]>([]);
  const [timezone,setTimezone]=useState('America/Chicago');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  async function load() {
    if(!profile) return;
    setLoading(true);setError('');
    try {
      const tz=await getOrganizationTimezone();setTimezone(tz);
      const today=formatDateInTimezone(new Date().toISOString(),tz);
      const anchor=new Date(today+'T12:00:00Z');anchor.setUTCDate(anchor.getUTCDate()-6);
      const from=anchor.toISOString().slice(0,10);
      const [time,manual,internal]=await Promise.all([
        supabase.from('time_entries').select('id,entry_date,clock_in,clock_out,total_hours,entry_type,status,notes,work_order:work_orders(work_order_number),project:projects(project_number,name)')
          .eq('technician_id',profile.id).in('entry_type',['work_order','project','shop_time','training']).gte('entry_date',from).lte('entry_date',today).order('clock_in',{ascending:false}),
        supabase.from('manual_job_time_requests').select('id,entry_date,clock_in,clock_out,break_minutes,status,reason').eq('technician_id',profile.id).eq('status','pending'),
        supabase.from('internal_time_sessions').select('id,session_date,predetermined_hours,status,title').eq('assigned_to',profile.id).eq('status','pending_approval'),
      ]);
      if(time.error) throw time.error;if(manual.error) throw manual.error;if(internal.error) throw internal.error;
      setEntries(time.data||[]);setPending([...(manual.data||[]).map(r=>({...r,hours:(Date.parse(r.clock_out)-Date.parse(r.clock_in))/3600000-r.break_minutes/60,title:r.reason})),...(internal.data||[]).map(r=>({...r,hours:r.predetermined_hours||0}))]);
    } catch(error:any) {setError(error.message||'Unable to load time.');}
    finally {setLoading(false);}
  }
  useEffect(()=>{void load();},[profile?.id]);
  const approved=entries.filter(e=>e.status==='approved' && e.clock_out).reduce((sum,e)=>sum+Number(e.total_hours||0),0);
  const recorded=entries.reduce((sum,e)=>sum+Number(e.total_hours||0),0);
  return <section className="space-y-3">
    <div className="flex justify-between items-center"><h3 className="font-semibold text-primary">{salary?'Recorded Job Time':'My Job Time'}</h3><button onClick={load} className="text-sm text-blue-600">Refresh</button></div>
    <p className="text-xs text-secondary">Recorded hours cover the last seven work dates. Pending requests are shown separately.</p>
    {loading?<p>Loading time…</p>:error?<p role="alert" className="text-red-600">{error}</p>:<>
      <div className="rounded-lg border border-subtle bg-elevated p-3"><p className="text-sm text-primary">{salary ? `${recorded.toFixed(2)} recorded hours` : `${approved.toFixed(2)} approved payable hours`}</p><p className="text-xs text-secondary">{salary?'Recorded time is for job costing; salary determines pay.':'Work Order time and approved manual/internal time determine pay. Pending and unapproved hours are excluded.'}</p></div>
      {entries.length===0 && <p className="text-sm text-secondary">No recorded job time in the last seven days.</p>}
      {entries.map(e=><div key={e.id} className="rounded-lg border border-subtle p-3 text-sm"><div className="flex justify-between gap-2"><span className="text-primary">{e.entry_date} · {e.work_order?.work_order_number || e.project?.project_number || e.entry_type.replaceAll('_',' ')}</span><span className="text-secondary">{Number(e.total_hours||0).toFixed(2)}h · {e.status}</span></div><p className="text-xs text-secondary">{formatTimeInTimezone(e.clock_in,timezone)}–{e.clock_out?formatTimeInTimezone(e.clock_out,timezone):'Running'}</p></div>)}
      <h4 className="font-semibold text-sm text-primary">Pending Requests · {pending.reduce((sum,r)=>sum+r.hours,0).toFixed(2)}h</h4>
      {!pending.length && <p className="text-xs text-secondary">No requests awaiting approval.</p>}
      {pending.map(r=><p key={r.id} className="text-sm text-secondary">{r.entry_date || r.session_date} · {r.title} · {r.hours.toFixed(2)}h · Pending approval</p>)}
    </>}
  </section>;
}
