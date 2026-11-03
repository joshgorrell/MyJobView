import { ArrowRight } from 'lucide-react';
import { recordCount, recordTotal, SALES_LIST_LABELS, type SalesLists, type SalesListKey } from '../../lib/salesDashboardRecords';

export function SalesResultsSummary({ lists, onSelect, allSales = false }: { allSales?: boolean; lists: SalesLists; onSelect: (key: SalesListKey) => void }) {
  const cards: { key: SalesListKey; money?: boolean; scope?: string }[] = [
    { key: 'won', money: true }, { key: 'lost', money: true }, { key: 'created' }, { key: 'sent' },
    { key: 'contacts' }, { key: 'connections' }, { key: 'stale', money: true, scope: 'All unresolved expired proposals' },
    { key: 'followups', scope: 'Due today or overdue' }, { key: 'untouched', scope: 'All active leads never contacted' }, { key: 'feedback', scope: 'Selected period; initial reason missing' },
  ];
  return <section className="mb-6 space-y-4">
    <h2 className="font-semibold text-white">{allSales ? 'Sales Results & Activity' : 'My Results & Activity'}</h2>
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{cards.map(({ key, money, scope }) => <button key={key} onClick={() => onSelect(key)} className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-500 focus-visible:outline-blue-500 shadow-sm">
      <span className="flex items-center justify-between text-xs font-medium text-gray-600 gap-2">{SALES_LIST_LABELS[key]}<ArrowRight className="w-3.5 h-3.5 shrink-0 text-blue-600" /></span>
      <span className={`block text-2xl font-bold mt-2 ${key === 'won' ? 'text-green-700' : key === 'lost' ? 'text-red-700' : key === 'stale' ? 'text-amber-700' : 'text-gray-900'}`}>{recordCount(lists[key])}</span>
      {money && <span className="block text-sm font-semibold text-gray-700">{recordTotal(lists[key]).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</span>}
      {scope && <span className="block text-xs text-gray-500 mt-1">{scope}</span>}
    </button>)}</div>
  </section>;
}
