import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Clock, Briefcase, History } from 'lucide-react';
import { DailyClock } from './DailyClock';
import { TimeAdjustmentRequestModal } from './TimeAdjustmentRequestModal';
import { useEmployeeTimePolicy } from '../../hooks/useEmployeeTimePolicy';

type TimeSection = 'daily' | 'job' | 'mine';
type PersonalEntry = { id: string; entry_date: string; clock_in: string; clock_out: string | null; total_hours: number | null; kind: 'Daily' | 'Job'; break_minutes?: number | null };

export function EmployeeTimeClock({ onNavigate }: { onNavigate: (page: string) => void }) {
  const policy = useEmployeeTimePolicy();
  const { profile } = useAuth();
  const [section, setSection] = useState<TimeSection>('job');
  const [correctionEntry, setCorrectionEntry] = useState<PersonalEntry | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
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
      supabase.from('time_entries').select('id, entry_date, clock_in, clock_out, total_hours').eq('technician_id', profile.id).order('entry_date', { ascending: false }).limit(20),
    ]).then(([daily, job]) => {
      if (cancelled) return;
      if (daily.error || job.error) { setHistoryError(true); return; }
      const combined: PersonalEntry[] = [
        ...(daily.data ?? []).map(e => ({ ...e, kind: 'Daily' as const })),
        ...(job.data ?? []).map(e => ({ ...e, kind: 'Job' as const })),
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
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Job Clock</h2>
          <p className="text-sm text-gray-600">Job time is recorded against a project or service work order. It does not start or stop your daily payroll clock.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onNavigate('tech_center')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Open Technician Work Center</button>
            <button type="button" onClick={() => onNavigate('work_orders')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">Browse Work Orders</button>
          </div>
        </div>
      )}
      {current === 'mine' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">My Time</h2>
          <p className="text-sm text-gray-600">Your recent daily and job time entries. Select Request Correction on a Daily Clock entry to request a time adjustment. Time-off requests remain available from Daily Clock when enabled.</p>
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
