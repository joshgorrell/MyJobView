import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CalendarDays, X, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployeeTimePolicy } from '../../hooks/useEmployeeTimePolicy';
import { formatDateInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';
import { ManualJobTimeRequestModal } from '../Technician/ManualJobTimeRequestModal';
import { RequestInternalTimeModal } from '../Technician/RequestInternalTimeModal';
import { MyTimeView } from '../Technician/MyTimeView';
const Calendar = lazy(()=>import('../Appointments/AppointmentsCalendar').then(m=>({default:m.AppointmentsCalendar})));

export function DailyLaunchpad({onClose,onNavigate}: {onClose:()=>void; onNavigate?:(tab:string,params?:Record<string,string>)=>void}) {
  const dialogRef=useRef<HTMLDivElement>(null);
  const {profile} = useAuth();
  const policy = useEmployeeTimePolicy();
  const [tab,setTab] = useState<'work'|'calendar'|'time'>('work');
  const [jobs,setJobs] = useState<any[]>([]);
  const [day,setDay] = useState('');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [request,setRequest] = useState<'manual'|'internal'|null>(null);
  const [settings,setSettings] = useState<any>(null);
  async function load() {
    if(!profile) return;
    setLoading(true);setError('');
    try {
      const today = formatDateInTimezone(new Date().toISOString(),await getOrganizationTimezone());
      const [orders,config] = await Promise.all([
        supabase.from('work_orders').select('id,work_order_number,title,status,scheduled_start_time,scheduled_end_time,contact:contacts!work_orders_contact_id_fkey(full_name),project:projects(name,contact:contacts!projects_contact_id_fkey(full_name))')
          .eq('organization_id',profile.organization_id).eq('assigned_to',profile.id).eq('scheduled_date',today)
          .order('scheduled_start_time',{nullsFirst:false}),
        supabase.from('company_settings').select('id,shop_time_request_enabled,training_time_request_enabled,time_request_requires_approval').maybeSingle(),
      ]);
      if(orders.error) throw orders.error;
      setJobs(orders.data || []);setDay(today);
      if(!config.error) setSettings(config.data);
    } catch(error:any) {setError(error.message || 'Unable to load your daily work.');}
    finally {setLoading(false);}
  }
  useEffect(()=>{ void load(); },[profile?.id]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close=(e:KeyboardEvent)=>{
      if(request) return;
      if(e.key==='Escape') onClose();
      if(e.key==='Tab') {
        const controls=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')||[]).filter(el=>el.getClientRects().length);
        const first=controls[0],last=controls[controls.length-1];
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',close);
    return ()=>{window.removeEventListener('keydown',close);document.body.style.overflow=oldOverflow;previous?.focus();};
  },[request,onClose]);
  function openWorkOrder(id:string) {if(onNavigate){onNavigate('work_orders',{workOrderId:id});onClose();}}
  return <div className="fixed inset-0 z-50 bg-black/60 p-2 sm:p-6 flex items-center justify-center" onClick={onClose}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Command Center" className="bg-surface text-primary border border-subtle rounded-xl w-full max-w-5xl max-h-[94dvh] overflow-auto" onClick={e=>e.stopPropagation()}>
      <div className="sticky top-0 z-10 bg-surface border-b border-subtle p-4 flex items-center justify-between"><div><h2 className="font-semibold text-lg">Command Center</h2><p className="text-xs text-secondary">Your daily work, calendar and time</p></div><button aria-label="Close Command Center" onClick={onClose} className="p-2"><X className="w-5 h-5" /></button></div>
      <div className="p-4 space-y-4">
        <nav aria-label="Daily views" className="flex gap-2">{[['work',"Today’s Work"],['calendar','Daily Calendar'],['time','My Time']].map(([key,label])=><button key={key} onClick={()=>setTab(key as typeof tab)} aria-pressed={tab===key} className={`px-3 py-2 rounded-lg text-sm ${tab===key?'bg-blue-600 text-white':'bg-elevated text-primary'}`}>{label}</button>)}</nav>
        {tab==='work' && <>
          <div className="flex justify-between items-center"><span className="text-sm text-secondary">{day}</span><button onClick={load} disabled={loading} aria-label="Refresh today’s work" className="p-2"><RefreshCw className="w-4 h-4" /></button></div>
          {loading ? <p>Loading today’s work…</p> : error ? <p role="alert" className="text-red-600">{error}</p> : !jobs.length ? <p className="text-sm text-secondary">No Work Orders scheduled for you today. Check your Daily Calendar for other scheduled activities.</p> : jobs.map(job=><button key={job.id} onClick={()=>openWorkOrder(job.id)} className="w-full rounded-xl border border-subtle p-3 text-left hover:bg-elevated flex justify-between gap-3">
            <div className="min-w-0"><p className="font-semibold text-sm truncate">{job.work_order_number} · {job.title}</p><p className="text-sm text-secondary truncate">{job.contact?.full_name || job.project?.contact?.full_name || job.project?.name || ''}</p></div><div className="text-right shrink-0 text-xs text-secondary"><p>{job.scheduled_start_time?.slice(0,5) || 'Time not set'}{job.scheduled_end_time ? `–${job.scheduled_end_time.slice(0,5)}`:''}</p><p className="capitalize">{job.status.replaceAll('_',' ')}</p></div>
          </button>)}
          <p className="text-xs text-secondary">Open a Work Order for time, parts, notes, photos and completion.</p>
        </>}
        {tab==='calendar' && <Suspense fallback={<p>Loading daily calendar…</p>}><Calendar personalOnly onWorkOrderSelect={openWorkOrder} /></Suspense>}
        {tab==='time' && <MyTimeView />}
        <div className="flex flex-wrap gap-2 border-t border-subtle pt-3">
          {policy.ready && policy.basis==='work_allocation' && <button onClick={()=>setRequest('manual')} className="rounded-lg bg-blue-600 text-white px-3 py-2 text-sm">Request Manual Job Time</button>}
          {settings && (settings.shop_time_request_enabled || settings.training_time_request_enabled) && <button onClick={()=>setRequest('internal')} className="rounded-lg border border-subtle px-3 py-2 text-sm">Request Shop / Training Time</button>}
        </div>
      </div>
      {request==='manual' && <ManualJobTimeRequestModal onClose={()=>setRequest(null)} onSubmitted={load} />}
      {request==='internal' && settings && <RequestInternalTimeModal companySettings={settings} onClose={()=>setRequest(null)} onSubmitted={load} />}
    </div>
  </div>;
}
export function DailyLaunchpadButton({onOpen}:{onOpen:()=>void}) {
  return <button onClick={onOpen} aria-label="Open Command Center" title="Command Center" className="w-11 h-11 md:w-9 md:h-9 flex shrink-0 items-center justify-center rounded-lg text-secondary hover:bg-elevated"><CalendarDays className="w-5 h-5" /></button>;
}
