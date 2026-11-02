import { useState } from 'react';
import { Clock, Briefcase, History } from 'lucide-react';
import { DailyClock } from './DailyClock';
import { useEmployeeTimePolicy } from '../../hooks/useEmployeeTimePolicy';

type TimeSection = 'daily' | 'job' | 'mine';

export function EmployeeTimeClock({ onNavigate }: { onNavigate: (page: string) => void }) {
  const policy = useEmployeeTimePolicy();
  const [section, setSection] = useState<TimeSection>('job');
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
          <button type="button" onClick={() => onNavigate('work_orders')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Open Work Orders</button>
        </div>
      )}
      {current === 'mine' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">My Time</h2>
          <p className="text-sm text-gray-600">Review your recorded job time and available time-related actions in your assigned work orders.</p>
          <button type="button" onClick={() => onNavigate('work_orders')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">View Work Orders</button>
        </div>
      )}
    </div>
  );
}
