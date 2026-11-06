import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Clock, Briefcase, History } from 'lucide-react';
import { DailyClock } from './DailyClock';
import { MyTimeLeaveRequest } from './MyTimeLeaveRequest';
import { TimeAdjustmentRequestModal } from './TimeAdjustmentRequestModal';
import { useEmployeeTimePolicy } from '../../hooks/useEmployeeTimePolicy';
import { AssignedSessionsWidget } from '../Production/AssignedSessionsWidget';
import { formatDateInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';

const TechnicianWorkCenter = lazy(() => import('../Production/TechnicianWorkCenter').then(m => ({ default: m.TechnicianWorkCenter })));

type TimeSection = 'daily' | 'job' | 'mine';
type PersonalEntry = { id: string; entry_date: string; clock_in: string; clock_out: string | null; total_hours: number | null; kind: 'Daily' | 'Job' | 'Shop' | 'Training'; break_minutes?: number | null };

export function EmployeeTimeClock({ onNavigate, onOpenWorkOrder }: { onNavigate: (page: string) => void; onOpenWorkOrder: (workOrderId: string) => void }) {
  const policy = useEmployeeTimePolicy();
  const { profile } = useAuth();
  const [section, setSection] = useState<TimeSection>('job');
  const [correctionEntry, setCorrectionEntry] = useState<PersonalEntry | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [timeType, setTimeType] = useState<'work_order' | 'shop_time' | 'training'>('work_order');
  const [assignedJobs, setAssignedJobs] = useState<{ id: string; work_order_number: string; title: string; assigned_to: string | null; scheduled_date: string | null; scheduled_start_time: string | null; status: string }[]>([]);
  const [today, setToday] = useState('');
  const [activeWorkOrderId, setActiveWorkOrderId] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState(false);
  useEffect(() => {
    if (section !== 'job' || !profile?.id) return;
    let cancelled = false;
    setJobsLoading(true); setJobsError(false);
    const localDatePromise = getOrganizationTimezone().then(zone => formatDateInTimezone(new Date().toISOString(), zone));
    Promise.all([
      localDatePromise,
      supabase.from('work_orders').select('id, work_order_number, title, assigned_to, scheduled_date, scheduled_start_time, status')
        .eq('assigned_to', profile.id).in('status', ['assigned', 'pending', 'in_progress', 'completed'])
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('time_entries').select('work_order_id')
        .eq('technician_id', profile.id).is('clock_out', null)
        .in('status', ['draft', 'submitted']).order('clock_in', { ascending: false }).limit(1).maybeSingle(),
    ]).then(async ([localToday, jobsResult, activeResult]) => {
      if (!cancelled) setToday(localToday);
      if (jobsResult.error || activeResult.error) throw jobsResult.error || activeResult.error;
      const { data: scheduledToday, error: scheduledError } = await supabase.from('work_orders')
        .select('id, work_order_number, title, assigned_to, scheduled_date, scheduled_start_time, status')
        .eq('assigned_to', profile.id).eq('scheduled_date', localToday)
        .order('scheduled_start_time', { ascending: true });
      if (scheduledError) throw scheduledError;
      const jobs = [...(scheduledToday ?? []), ...(jobsResult.data ?? []).filter(job => !(scheduledToday ?? []).some(todayJob => todayJob.id === job.id))];
      const activeId = activeResult.data?.work_order_id;
      if (activeId && !jobs.some(job => job.id === activeId)) {
        const { data: activeJob, error } = await supabase.from('work_orders')
          .select('id, work_order_number, title, assigned_to, scheduled_date, scheduled_start_time, status').eq('id', activeId).maybeSingle();
        if (error) throw error;
        if (activeJob) jobs.unshift(activeJob);
      }
      if (cancelled) return;
      setAssignedJobs(jobs);
      setActiveWorkOrderId(activeId || null);

    }).catch(() => { if (!cancelled) setJobsError(true); })
      .finally(() => { if (!cancelled) setJobsLoading(false); });
    return () => { cancelled = true; };
  }, [section, profile?.id, historyRevision]);
  const [entries, setEntries] = useState<PersonalEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    if (section !== 'mine' || !profile?.id) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(false);
    Promise.all([
      supabase.from('daily_clock_entries').select('id, entry_date, clock_in, clock_out, total_hours, break_minutes').eq('technician_id', profile.id).order('entry_date', { ascending: false }).limit(20),
      supabase.from('time_entries').select('id, entry_date, clock_in, clock_out, total_hours, entry_type').eq('technician_id', profile.id).order('entry_date', { ascending: false }).limit(20),
    ]).then(([daily, job]) => {
      if (cancelled) return;
      if (daily.error || job.error) { setHistoryError(true); return; }
      const combined: PersonalEntry[] = [
        ...(daily.data ?? []).map(e => ({ ...e, kind: 'Daily' as const })),
        ...(job.data ?? []).map(e => ({ ...e, kind: (e.entry_type === 'shop_time' ? 'Shop' : e.entry_type === 'training' ? 'Training' : 'Job') as PersonalEntry['kind'] })),
      ];
      setEntries(combined.sort((a, b) => b.clock_in.localeCompare(a.clock_in)).slice(0, 30));
    }).catch(() => { if (!cancelled) setHistoryError(true); }).finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [section, profile?.id, historyRevision]);
  const sections: { id: TimeSection; label: string; icon: typeof Clock }[] = [
    { id: 'daily', label: 'Daily Clock', icon: Clock },
    { id: 'job', label: 'Job Clock', icon: Briefcase },
    { id: 'mine', label: 'My Time', icon: History },
  ];
  const current = sections.some(item => item.id === section) ? section : sections[0].id;

  if (!policy.ready) return <div className="p-4 text-gray-500">Loading time configuration…</div>;

  return (
    <div className="min-w-0 space-y-3">
      <div role="tablist" aria-label="Time Clock" className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-gray-900 p-1">
        {sections.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={current === id}
            onClick={() => setSection(id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${current === id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {current === 'daily' && (policy.dailyClock ? <DailyClock /> : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5" role="status">
          <h2 className="font-semibold text-gray-700">Daily Clock not required</h2>
          <p className="mt-2 text-sm text-gray-600">Your employee time settings do not require you to clock in and out for the day. Daily clocking is disabled for your account. You can still use Job Clock for assigned work and My Time to review your entries.</p>
        </div>
      ))}
      {current === 'job' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="font-semibold text-gray-900">Job Clock</h2>
            <p className="text-sm text-gray-600">Clock directly against an assigned work order using the existing start/stop workflow. Job time is separate from your daily payroll clock.</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700">Time Type
              <select value={timeType} onChange={event => setTimeType(event.target.value as typeof timeType)} className="mt-1 w-full rounded-lg border border-gray-300 p-2">
                <option value="work_order">Work Order</option>
                <option value="shop_time">Shop Time</option>
                <option value="training">Training Time</option>
              </select>
            </label>
            {timeType === 'work_order' ? <>
              <h3 className="font-semibold text-gray-900">Today's Scheduled Work Orders</h3>
              {jobsLoading && <p className="text-sm text-gray-500">Loading work orders…</p>}
              {jobsError && <p role="alert" className="text-sm text-red-700">Unable to load work orders.</p>}
              {(() => {
                const todayJobs = assignedJobs.filter(job => (job.scheduled_date === today || job.id === activeWorkOrderId) && job.status !== 'completed');
                const completedToday = assignedJobs.filter(job => job.scheduled_date === today && job.status === 'completed');
                return <>
                  {!jobsLoading && !jobsError && todayJobs.length === 0 && <p className="text-sm text-gray-600">No assigned work orders scheduled for today. Open Production to view team assignments.</p>}
                  {todayJobs.sort((a,b) => Number(b.id === activeWorkOrderId) - Number(a.id === activeWorkOrderId) || (a.scheduled_start_time || '').localeCompare(b.scheduled_start_time || '')).map(job => <button type="button" key={job.id} onClick={() => onOpenWorkOrder(job.id)} className={`w-full rounded-lg border p-3 text-left hover:border-blue-400 hover:bg-blue-50 ${job.id === activeWorkOrderId ? "border-green-500 bg-green-50" : "border-gray-200"}`}><span className="block font-semibold text-gray-900">{job.id === activeWorkOrderId ? "● Clocked in · " : ""}{job.work_order_number} · {job.title}</span><span className="text-sm text-gray-600">{job.scheduled_start_time?.slice(0,5) || 'Time not specified'} · Open Work Order</span></button>)}
                  {completedToday.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-medium text-gray-700">Completed today ({completedToday.length})</summary><div className="mt-2 space-y-2">{completedToday.map(job => <button type="button" key={job.id} onClick={() => onOpenWorkOrder(job.id)} className="block w-full rounded-lg border p-2 text-left hover:bg-gray-50">{job.work_order_number} · {job.title}</button>)}</div></details>}
                  {assignedJobs.filter(job => job.scheduled_date !== today && job.id !== activeWorkOrderId).length > 0 && <details className="text-sm"><summary className="cursor-pointer font-medium text-gray-700">Other assigned work orders</summary><div className="mt-2 space-y-2">{assignedJobs.filter(job => job.scheduled_date !== today && job.id !== activeWorkOrderId).map(job => <button type="button" key={job.id} onClick={() => onOpenWorkOrder(job.id)} className="block w-full rounded-lg border p-2 text-left hover:bg-gray-50">{job.work_order_number} · {job.title}</button>)}</div></details>}
                </>;
              })()}
            </> : <div className="space-y-2"><p className="text-sm text-gray-600">Use your existing assigned internal sessions to clock in and out. Shop and training sessions follow company approval settings.</p><AssignedSessionsWidget key={timeType} sessionType={timeType === 'shop_time' ? 'shop_time' : 'training'} onRefreshParent={() => setHistoryRevision(value => value + 1)} /></div>}
          </div>
          <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading work orders…</div>}>
            <TechnicianWorkCenter />
          </Suspense>
        </div>
      )}
      {current === 'mine' && (
        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-3 space-y-3">
          <h2 className="font-semibold text-gray-900">My Time</h2>
          <p className="text-sm text-gray-600">Your recent daily, job, shop, and training time entries. Select Request Correction on a Daily Clock entry to request a time adjustment. Same-day leave requests are available below.</p>
          {historyLoading && <p className="text-sm text-gray-500">Loading your time…</p>}
          {historyError && <p role="alert" className="text-sm text-red-700">Time history could not be loaded.</p>}
          {!historyLoading && !historyError && entries.length === 0 && <p className="text-sm text-gray-500">No recent time entries.</p>}
          {!historyLoading && !historyError && entries.map(entry => (
            <div key={`${entry.kind}-${entry.id}`} className="flex items-center justify-between gap-3 border-t border-gray-100 py-3 text-sm">
              <div><span className="font-medium text-gray-900">{entry.kind} time</span><div className="text-gray-500">{entry.entry_date}</div></div>
              <div className="flex flex-col items-end gap-1">
                <span className="font-semibold tabular-nums text-gray-900">{entry.total_hours == null ? 'In progress' : `${Number(entry.total_hours).toFixed(2)} hrs`}</span>
                {entry.kind === 'Daily' && <button type="button" onClick={() => setCorrectionEntry(entry)} className="text-xs font-medium text-blue-700 hover:underline">Request Correction</button>}
              </div>
            </div>
          ))}
          <MyTimeLeaveRequest />
          <button type="button" onClick={() => onNavigate('work_orders')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">Open Work Orders</button>
        </div>
      )}
      {correctionEntry && <TimeAdjustmentRequestModal entry={{ id: correctionEntry.id, entry_date: correctionEntry.entry_date, clock_in: correctionEntry.clock_in, clock_out: correctionEntry.clock_out, total_hours: correctionEntry.total_hours ?? 0, break_minutes: correctionEntry.break_minutes ?? 0 }} onClose={() => setCorrectionEntry(null)} onSubmit={() => { setCorrectionEntry(null); setHistoryRevision(v => v + 1); }} />}
    </div>
  );
}
