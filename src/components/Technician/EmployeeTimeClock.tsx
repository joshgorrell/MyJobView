import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Clock, Briefcase, History } from 'lucide-react';
import { DailyClock } from './DailyClock';
import { TimeAdjustmentRequestModal } from './TimeAdjustmentRequestModal';
import { WorkOrderTimeControl } from '../Production/WorkOrderTimeControl';
import { useEmployeeTimePolicy } from '../../hooks/useEmployeeTimePolicy';

const TechnicianWorkCenter = lazy(() => import('../Production/TechnicianWorkCenter').then(m => ({ default: m.TechnicianWorkCenter })));

type TimeSection = 'daily' | 'job' | 'mine';
type PersonalEntry = { id: string; entry_date: string; clock_in: string; clock_out: string | null; total_hours: number | null; kind: 'Daily' | 'Job' | 'Shop' | 'Training'; break_minutes?: number | null };

export function EmployeeTimeClock({ onNavigate }: { onNavigate: (page: string) => void }) {
  const policy = useEmployeeTimePolicy();
  const { profile } = useAuth();
  const [section, setSection] = useState<TimeSection>('job');
  const [correctionEntry, setCorrectionEntry] = useState<PersonalEntry | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');
  const [assignedJobs, setAssignedJobs] = useState<{ id: string; work_order_number: string; title: string; assigned_to: string | null }[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState(false);
  useEffect(() => {
    if (section !== 'job' || !profile?.id) return;
    let cancelled = false;
    setJobsLoading(true); setJobsError(false);
    supabase.from('work_orders').select('id, work_order_number, title, assigned_to')
      .eq('assigned_to', profile.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setJobsError(true); return; }
        setAssignedJobs(data ?? []);
        setSelectedWorkOrderId(current => current && (data ?? []).some(job => job.id === current) ? current : '');
      }).catch(() => { if (!cancelled) setJobsError(true); })
      .finally(() => { if (!cancelled) setJobsLoading(false); });
    return () => { cancelled = true; };
  }, [section, profile?.id]);
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
    ...(policy.dailyClock ? [{ id: 'daily' as const, label: 'Daily Clock', icon: Clock }] : []),
    { id: 'job', label: 'Job Clock', icon: Briefcase },
    { id: 'mine', label: 'My Time', icon: History },
  ];
  const current = sections.some(item => item.id === section) ? section : sections[0].id;

  if (!policy.ready) return <div className="p-4 text-gray-500">Loading time configuration…</div>;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Time Clock" className="flex gap-1 overflow-x-auto rounded-xl bg-gray-900 p-1">
        {sections.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={current === id}
            onClick={() => setSection(id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${current === id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {current === 'daily' && policy.dailyClock && <DailyClock />}
      {current === 'job' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="font-semibold text-gray-900">Job Clock</h2>
            <p className="text-sm text-gray-600">Clock directly against an assigned work order using the existing start/stop workflow. Job time is separate from your daily payroll clock.</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700">Assigned work order
              <select value={selectedWorkOrderId} onChange={event => setSelectedWorkOrderId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2">
                <option value="">Select a work order</option>
                {assignedJobs.map(job => <option key={job.id} value={job.id}>{job.work_order_number} · {job.title}</option>)}
              </select>
            </label>
            {jobsLoading && <p className="text-sm text-gray-500">Loading assigned work orders…</p>}
            {jobsError && <p role="alert" className="text-sm text-red-700">Unable to load assigned work orders.</p>}
            {!jobsLoading && !jobsError && assignedJobs.length === 0 && <p className="text-sm text-gray-500">No directly assigned work orders found. Check your work center for team assignments.</p>}
            {selectedWorkOrderId && assignedJobs.some(job => job.id === selectedWorkOrderId) && <WorkOrderTimeControl key={selectedWorkOrderId} workOrderId={selectedWorkOrderId} assignedTo={profile?.id ?? null} onChanged={() => setHistoryRevision(v => v + 1)} />}
          </div>
          <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading work orders…</div>}>
            <TechnicianWorkCenter />
          </Suspense>
        </div>
      )}
      {current === 'mine' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">My Time</h2>
          <p className="text-sm text-gray-600">Your recent daily, job, shop, and training time entries. Select Request Correction on a Daily Clock entry to request a time adjustment. Time-off requests remain available from Daily Clock when enabled.</p>
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
          <button type="button" onClick={() => onNavigate('work_orders')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">Open Work Orders</button>
        </div>
      )}
      {correctionEntry && <TimeAdjustmentRequestModal entry={{ id: correctionEntry.id, entry_date: correctionEntry.entry_date, clock_in: correctionEntry.clock_in, clock_out: correctionEntry.clock_out, total_hours: correctionEntry.total_hours ?? 0, break_minutes: correctionEntry.break_minutes ?? 0 }} onClose={() => setCorrectionEntry(null)} onSubmit={() => { setCorrectionEntry(null); setHistoryRevision(v => v + 1); }} />}
    </div>
  );
}
