import {useState} from 'react';
import {ManualJobTimeRequests} from './ManualJobTimeRequests';
import {InternalSessionsManagement} from '../../Dispatch/InternalSessionsManagement';
import {TravelBonusQueue} from '../../Dispatch/TravelBonusQueue';
import {TravelBonusTracking} from '../../Dispatch/TravelBonusTracking';

export function TimeReviewPanel({onPayroll}:{onPayroll:()=>void}) {
  const [view,setView]=useState<'manual'|'internal'|'travel'|'travel_logs'>('manual');
  return <section className="space-y-4">
    <div className="rounded-xl bg-surface border border-subtle p-4 space-y-2">
      <h4 className="font-semibold text-primary">Time and Travel Review</h4>
      <p className="text-sm text-secondary">Review requests and completed internal time here. Pending requests remain excluded from pay. Attendance variance, jurisdiction exceptions and corrections are reviewed within the selected payroll period.</p>
      <button onClick={onPayroll} className="text-sm text-blue-600 underline">Open payroll exceptions and reconciliation</button>
    </div>
    <nav aria-label="Time review queues" className="flex flex-wrap gap-2">
      {([['manual','Manual Job Time'],['internal','Shop / Training'],['travel','Travel Bonus Requests'],['travel_logs','Travel Logs']] as const).map(([key,label])=><button key={key} onClick={()=>setView(key)} aria-pressed={view===key} className={`rounded-lg px-3 py-2 text-sm ${view===key?'bg-blue-600 text-white':'border border-subtle bg-surface text-primary'}`}>{label}</button>)}
    </nav>
    {view==='manual' && <ManualJobTimeRequests/>}
    {view==='internal' && <InternalSessionsManagement/>}
    {view==='travel' && <TravelBonusQueue/>}
    {view==='travel_logs' && <TravelBonusTracking/>}
  </section>;
}
