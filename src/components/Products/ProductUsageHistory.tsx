import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadProductUsage, type ProductUsage, type UsageType } from './productUsage';

const labels: Record<UsageType, string> = { proposal: 'Proposals', sales_order: 'Sales orders', invoice: 'Invoices', work_order: 'Work orders' };
export function ProductUsageHistory({ productId }: { productId: string }) {
  const [history, setHistory] = useState<ProductUsage[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<UsageType | 'all'>('all');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setHistory([]); setErrors([]); setFilter('all');
    loadProductUsage(supabase, productId).then(result => {
      if (!cancelled) { setHistory(result.items); setErrors(result.errors); setLoading(false); }
    }).catch(() => { if (!cancelled) { setErrors(['Product history could not be loaded.']); setLoading(false); } });
    return () => { cancelled = true; };
  }, [productId, retry]);
  if (loading) return <p role="status" className="p-6 text-sm text-gray-600">Loading product history…</p>;
  const filtered = history.filter(item => filter === 'all' || item.type === filter);
  const count = (type?: UsageType) => new Set(history.filter(item => !type || item.type === type).map(item => item.id.split(':').slice(0, 2).join(':'))).size;
  return <section className="space-y-4 text-gray-900">
    <div><h3 className="text-base font-semibold">History</h3><p className="text-xs text-gray-500 mt-1">Documents using this item that you have permission to view. Converted proposals appear only as sales orders. Sales order scope includes proposal lines and change orders.</p></div>
    {errors.length > 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><p>{errors.join(' ')} Results may be incomplete.</p><button type="button" onClick={() => setRetry(n => n + 1)} className="mt-2 font-semibold underline">Retry history</button></div>}
    <div className="flex flex-wrap gap-2" aria-label="History filters">
      {(['all', ...Object.keys(labels)] as Array<UsageType | 'all'>).map(type => <button key={type} type="button" aria-pressed={filter === type} onClick={() => setFilter(type)} className={`rounded-lg px-3 py-2 text-xs font-medium ${filter === type ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>{type === 'all' ? 'All' : labels[type]} ({count(type === 'all' ? undefined : type)})</button>)}
    </div>
    {!filtered.length ? <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">{errors.length ? 'No records loaded for this filter.' : 'No visible usage found for this filter.'}</p> : <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {filtered.map(item => <article key={item.id} className="p-4 flex flex-wrap justify-between gap-3">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-blue-700">{labels[item.type]}</span><span className="font-semibold break-all">{item.reference}</span><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{item.status}</span></div>
          {item.title && <p className="text-sm mt-1 break-words">{item.title}</p>}<p className="text-sm text-gray-600 mt-1 break-words">{item.customer}</p>{item.source && <p className="text-xs text-gray-500 mt-1">{item.source}</p>}</div>
        <div className="text-right text-xs text-gray-600 shrink-0"><p>Qty: {item.quantity}</p><p className="mt-1">{item.date ? new Date(item.date).toLocaleDateString() : 'Date unavailable'}</p></div>
      </article>)}
    </div>}
  </section>;
}
