import { useState } from 'react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { recordCount, type SalesRecord } from '../../lib/salesDashboardRecords';

export function SalesRecordList({ title, subtitle, records, onBack, onOpen }: { title: string; subtitle: string; records: SalesRecord[]; onBack: () => void; onOpen: (record: SalesRecord) => void }) {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const filtered = records.filter(r => `${r.title} ${r.customer} ${r.status} ${r.detail || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="rounded-xl bg-white border border-gray-200 p-4 sm:p-6 text-gray-900">
    <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-blue-700 mb-4"><ArrowLeft className="w-4 h-4" /> Back to dashboard</button>
    <h2 className="text-xl font-semibold">{title} <span className="text-gray-500">({recordCount(records)})</span></h2>
    <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    <label className="flex items-center gap-2 border border-gray-300 rounded-lg p-2 my-4"><Search className="w-4 h-4 text-gray-500" /><input aria-label="Search sales records" value={search} onChange={e => { setSearch(e.target.value); setLimit(50); }} placeholder="Search customer, number, or status" className="w-full min-w-0 outline-none bg-white text-gray-900" /></label>
    {filtered.length === 0 && <p className="py-8 text-center text-gray-500">No matching records.</p>}
    <div className="divide-y divide-gray-200">{filtered.slice(0, limit).map(record => <div key={`${record.kind}:${record.id}`}>
      <button onClick={() => record.kind === 'source' ? setExpandedSource(expandedSource === record.id ? null : record.id) : onOpen(record)} className="w-full flex items-start gap-3 text-left p-3 rounded-lg hover:bg-blue-50 focus-visible:outline-blue-600">
        <div className="flex-1 min-w-0"><p className="font-semibold break-words">{record.title}</p><p className="text-sm text-gray-600 break-words">{record.customer}</p><p className="text-xs text-gray-500 mt-1">{record.status.replace(/_/g, ' ')} · {record.date.slice(0, 10)}{record.detail && record.kind !== 'source' ? ` · ${record.detail}` : ''}</p></div>
        {record.amount !== undefined && <span className="text-sm font-semibold whitespace-nowrap">{record.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>}<ArrowRight className="w-4 h-4 text-blue-600 shrink-0 mt-1" />
      </button>
      {expandedSource === record.id && <p className="p-4 text-sm bg-blue-50 rounded-lg">{record.detail}</p>}
    </div>)}</div>
    {filtered.length > limit && <button className="mt-4 text-blue-700 font-medium" onClick={() => setLimit(n => n + 50)}>Show 50 more ({filtered.length - limit} remaining)</button>}
  </section>;
}
