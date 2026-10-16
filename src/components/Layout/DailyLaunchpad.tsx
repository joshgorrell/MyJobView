import { MyJobTimeView } from '../Technician/MyJobTimeView';
import { createPortal } from 'react-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Timer, RefreshCw, Briefcase, CalendarCheck, Users, History, ArrowUpRight, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployeeTimePolicy } from '../../hooks/useEmployeeTimePolicy';
import { formatDateInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';
import { ManualJobTimeRequestModal } from '../Technician/ManualJobTimeRequestModal';
import { RequestInternalTimeModal } from '../Technician/RequestInternalTimeModal';
import { MyTimeView } from '../Technician/MyTimeView';
import { MyTimeOff } from '../Dispatch/MyTimeOff';
import { TeamTimeOffPanel } from '../Shared/TeamTimeOffPanel';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { WorkOrderTimeControl } from '../Production/WorkOrderTimeControl';
import { TimeClockModal } from './TimeClockModal';
const Calendar = lazy(() => import('../Appointments/AppointmentsCalendar').then(m => ({ default: m.AppointmentsCalendar })));

export function DailyLaunchpad({ onClose, onNavigate }: { onClose: () => void; onNavigate?: (tab: string, params?: Record<string, string>) => void }) {
  const { profile } = useAuth();
  const policy = useEmployeeTimePolicy();
  const [tab, setTab] = useState<'work' | 'calendar' | 'time' | 'pto' | 'team'>('work');
  const [jobs, setJobs] = useState<any[]>([]);
  const [activeJob, setActiveJob] = useState<{ id: string; title: string } | null>(null);
  const [day, setDay] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<'manual' | 'internal' | null>(null);
  const [settings, setSettings] = useState<any>(null);
  async function load() {
    if (!profile) return;
    setLoading(true); setError('');
    try {
      const today = formatDateInTimezone(new Date().toISOString(), await getOrganizationTimezone());
      const [orders, config, active] = await Promise.all([
        supabase.from('work_orders').select('id,work_order_number,title,status,scheduled_start_time,scheduled_end_time,contact:contacts!work_orders_contact_id_fkey(full_name),project:projects(name,contact:contacts!projects_contact_id_fkey(full_name))')
          .eq('organization_id', profile.organization_id).eq('assigned_to', profile.id).eq('scheduled_date', today)
          .not('status', 'in', '(cancelled,archived,split)').order('scheduled_start_time', { nullsFirst: false }),
        supabase.from('company_settings').select('id,shop_time_request_enabled,training_time_request_enabled,time_request_requires_approval').eq('organization_id', profile.organization_id).maybeSingle(),
        supabase.from('time_entries').select('work_order_id,work_order:work_orders(title)').eq('technician_id', profile.id).is('clock_out', null).in('status', ['draft', 'submitted']).limit(1).maybeSingle(),
      ]);
      if (orders.error) throw orders.error;
      if (active.error) throw active.error;
      setJobs(orders.data || []); setDay(today);
      const current = active.data as any;
      setActiveJob(current?.work_order_id ? { id: current.work_order_id, title: current.work_order?.title || 'Active job' } : null);
      if (!config.error) setSettings(config.data);
    } catch (error: any) { setError(error.message || 'Unable to load your daily work.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    if (!profile) return;
    const channel = supabase.channel('time-hub-jobs').on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', filter: `technician_id=eq.${profile.id}` }, load).subscribe();
    return () => { void channel.unsubscribe(); };
  }, [profile?.id]);
  function openWorkOrder(id: string) { if (onNavigate) { onNavigate('work_orders', { workOrderId: id }); onClose(); } }
  const tabs = [
    { key: 'work', label: 'Today', icon: Timer }, { key: 'pto', label: 'Time Off', icon: CalendarCheck },
    { key: 'team', label: 'Team', icon: Users }, { key: 'time', label: 'History', icon: History },
    { key: 'calendar', label: 'Calendar', icon: Briefcase },
  ] as const;
  return <QuickActionModal title="Time Clock" subtitle="Your day, your jobs, your time off" icon={<Timer className="h-5 w-5" />} accentColor="from-cyan-700 to-blue-800" onClose={onClose}>
    <div className="p-3 sm:p-5 space-y-4">
      <nav aria-label="Time Clock views" className="grid grid-cols-5 gap-1 rounded-xl bg-elevated p-1">
        {tabs.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setTab(key)} aria-pressed={tab === key} className={`min-h-14 min-w-0 rounded-lg flex flex-col items-center justify-center gap-1 text-[11px] sm:text-sm transition-colors ${tab === key ? 'bg-blue-600 text-white shadow-sm' : 'text-secondary hover:bg-surface'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </nav>
      {tab === 'work' && <>
        {policy.loading ? <p role="status">Loading your clock configuration…</p> : !policy.ready ? <p role="alert">Your time configuration could not be loaded. Reopen Time Clock to retry.</p> : policy.dailyClock ? <TimeClockModal embedded isOpen onClose={onClose} /> : <div className="rounded-2xl border border-subtle bg-elevated p-4"><p className="font-semibold">Ready for your next job?</p><p className="text-sm text-secondary mt-1">Your configuration does not require a daily clock. Record job time below.</p></div>}
        <div className="flex items-center justify-between"><div><h3 className="font-semibold text-primary">Today’s Jobs</h3><p className="text-xs text-secondary">{day}</p></div><button onClick={load} disabled={loading} aria-label="Refresh today’s work" className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-elevated"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        {activeJob && !jobs.some(j => j.id === activeJob.id) && <section className="rounded-xl border border-blue-300 p-3 space-y-2"><h4 className="font-semibold">{activeJob.title}</h4><WorkOrderTimeControl workOrderId={activeJob.id} assignedTo={profile?.id || null} onChanged={load} /></section>}
        {!loading && !error && !jobs.length && <p className="rounded-xl border border-dashed border-subtle p-4 text-sm text-secondary">No jobs scheduled today. You can still record project time below.</p>}
        {jobs.map(job => <section key={job.id} className="rounded-xl border border-subtle p-3 space-y-3 bg-surface">
          <button onClick={() => openWorkOrder(job.id)} className="flex gap-3 items-center justify-between text-left w-full min-h-11"><div className="min-w-0"><p className="font-semibold text-sm break-words">{job.work_order_number} · {job.title}</p><p className="text-xs text-secondary">{job.contact?.full_name || job.project?.contact?.full_name || job.project?.name || ''}</p></div><ArrowUpRight className="h-4 w-4 shrink-0 text-secondary" /></button>
          <p className="text-xs text-secondary">{job.scheduled_start_time?.slice(0, 5) || 'Time not set'}{job.scheduled_end_time ? `–${job.scheduled_end_time.slice(0, 5)}` : ''}</p>
          <WorkOrderTimeControl workOrderId={job.id} assignedTo={profile?.id || null} onChanged={load} />
        </section>)}
        <div className="grid sm:grid-cols-2 gap-2 border-t border-subtle pt-4">
          {policy.ready && <button onClick={() => setRequest('manual')} className="min-h-11 rounded-xl bg-blue-600 text-white px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2"><Plus className="h-4 w-4" />Record Manual Job Time</button>}
          {settings && (settings.shop_time_request_enabled || settings.training_time_request_enabled) && <button onClick={() => setRequest('internal')} className="min-h-11 rounded-xl border border-subtle px-3 py-3 text-sm">Request Shop / Training Time</button>}
        </div>
      </>}
      {tab === 'pto' && <MyTimeOff compact />}
      {tab === 'team' && <TeamTimeOffPanel />}
      {tab === 'time' && <div className="space-y-5"><MyTimeView />{policy.basis === 'daily_clock' && <section><h3 className="font-semibold mb-3">Job Time & Requests</h3><MyJobTimeView /></section>}</div>}
      {tab === 'calendar' && <Suspense fallback={<p>Loading daily calendar…</p>}><Calendar personalOnly onWorkOrderSelect={openWorkOrder} /></Suspense>}
    </div>
    {request === 'manual' && createPortal(<ManualJobTimeRequestModal onClose={() => setRequest(null)} onSubmitted={load} />, document.body)}
    {request === 'internal' && settings && createPortal(<RequestInternalTimeModal companySettings={settings} onClose={() => setRequest(null)} onSubmitted={load} />, document.body)}
  </QuickActionModal>;
}
export function DailyLaunchpadButton({ onOpen }: { onOpen: () => void }) {
  return <button onClick={onOpen} aria-label="Open Time Clock" title="Time Clock" className="w-11 h-11 md:w-9 md:h-9 flex shrink-0 items-center justify-center rounded-lg text-secondary hover:bg-elevated"><Timer className="w-5 h-5" /></button>;
}
