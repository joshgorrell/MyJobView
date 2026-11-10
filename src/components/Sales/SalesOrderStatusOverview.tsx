import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { loadProjectSummaries } from '../../lib/projectOverview';

type Order = {
  id: string; order_number: string; status: string; contract_total: number;
  created_at: string; project_id?: string | null;
  contact?: { full_name?: string } | null;
  sales_rep?: { full_name?: string } | null;
};
type Metrics = { estimated: number; actual: number; invoiced: number; due: number };
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const number = (value: unknown) => Number(value) || 0;
const OPEN = new Set(['pending_deposit', 'pending_po', 'planning', 'active']);

export function SalesOrderStatusOverview({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('overrun');
  const openOrders = useMemo(() => orders.filter(o => OPEN.has(o.status)), [orders]);
  const ids = openOrders.map(o => o.id).join(',');
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!ids || !profile?.organization_id) { setMetrics({}); return; }
      setLoading(true); setError('');
      try {
        const next: Record<string, Metrics> = {};
        for (const order of openOrders) next[order.id] = { estimated: 0, actual: 0, invoiced: 0, due: 0 };
        const projectIds = [...new Set(openOrders.map(o => o.project_id).filter((id): id is string => !!id))];
        const [invoicesResult, projectSummaries] = await Promise.all([
          supabase.from('invoices').select('sales_order_id,total,amount_due,status').in('sales_order_id', openOrders.map(o => o.id)),
          projectIds.length ? loadProjectSummaries(profile.organization_id, projectIds) : Promise.resolve([])
        ]);
        if (invoicesResult.error) throw invoicesResult.error;

        for (const invoice of invoicesResult.data || []) {
          const item = next[invoice.sales_order_id];
          if (!item || invoice.status === 'void' || invoice.status === 'cancelled') continue;
          item.invoiced += number(invoice.total);
          item.due += number(invoice.amount_due);
        }
        const byProject = new Map(projectSummaries.map(summary => [summary.project.id, summary]));
        for (const order of openOrders) {
          const project = order.project_id ? byProject.get(order.project_id) : null;
          if (project) {
            next[order.id].estimated = project.goalHours ?? 0;
            next[order.id].actual = project.fieldHours;
          }
        }
        if (!cancelled) setMetrics(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load order balances');
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [ids, profile?.organization_id]);
  const rows = openOrders.map(order => {
    const m = metrics[order.id];
    const pct = m?.estimated ? m.actual / m.estimated * 100 : null;
    return { order, m, pct, unbilled: m ? Math.max(0, number(order.contract_total) - m.invoiced) : 0 };
  }).sort((a,b) => {
    if (sort === 'unbilled') return b.unbilled - a.unbilled;
    if (sort === 'due') return (b.m?.due || 0) - (a.m?.due || 0);
    if (sort === 'oldest') return a.order.created_at.localeCompare(b.order.created_at);
    return (b.pct ?? -1) - (a.pct ?? -1);
  });
  const totals = rows.reduce((a,r) => ({
    value: a.value + number(r.order.contract_total),
    unbilled: a.unbilled + r.unbilled,
    due: a.due + (r.m?.due || 0)
  }), { value: 0, unbilled: 0, due: 0 });
  return <div className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        ['Open Orders', String(rows.length)],
        ['Order Value', loading ? '…' : money(totals.value)],
        ['Unbilled', loading ? '…' : money(totals.unbilled)],
        ['Amount Due', loading ? '…' : money(totals.due)]
      ].map(([label,value]) => <div key={label} className="rounded-lg border border-subtle bg-surface p-3">
        <div className="text-xs text-muted">{label}</div><div className="font-bold text-primary text-lg">{value}</div>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted">Field labor used versus field labor target (same calculation as Project Management). This is budget consumption, not physical completion.</p>
      <select aria-label="Sort open sales orders" value={sort} onChange={e=>setSort(e.target.value)} className="bg-surface text-primary border border-subtle rounded-lg p-2 text-sm">
        <option value="overrun">Highest labor usage</option><option value="unbilled">Most unbilled</option>
        <option value="due">Largest amount due</option><option value="oldest">Oldest orders</option>
      </select>
    </div>
    {error && <p role="alert" className="text-danger text-sm">Status figures unavailable: {error}</p>}
    <div className="rounded-xl border border-subtle overflow-x-auto">
      <table className="w-full min-w-[790px] text-sm">
        <thead className="bg-elevated text-muted text-xs"><tr>
          <th className="text-left p-3">Sales Order / Customer</th><th className="text-left p-3">Sales Rep</th>
          <th className="text-left p-3">Labor Used / Est.</th><th className="text-right p-3">Order Total</th>
          <th className="text-right p-3">Unbilled</th><th className="text-right p-3">Amount Due</th><th className="text-left p-3">Created</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-700/30">
          {rows.map(({order,m,pct,unbilled}) => <tr key={order.id} onClick={()=>onOpen(order.id)} className="cursor-pointer hover:bg-elevated/40">
            <td className="p-3"><div className="font-semibold text-primary">{order.contact?.full_name || 'Unknown customer'}</div><div className="text-xs text-muted">SO-{order.order_number}</div></td>
            <td className="p-3 text-secondary">{order.sales_rep?.full_name || '—'}</td>
            <td className="p-3 min-w-[160px]">{m && pct !== null ? <>
              <div className={`text-xs font-semibold mb-1 ${pct > 100 ? 'text-danger' : pct >= 90 ? 'text-warning' : 'text-primary'}`}>{pct.toFixed(0)}% <span className="font-normal text-muted">({m.actual.toFixed(1)} / {m.estimated.toFixed(1)}h)</span></div>
              <div className="h-2.5 rounded-full bg-elevated overflow-hidden"><div className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{width:`${Math.min(100,pct)}%`}} /></div>
            </> : <span className="text-muted text-xs">No labor estimate</span>}</td>
            <td className="p-3 text-right text-primary">{money(number(order.contract_total))}</td>
            <td className="p-3 text-right font-medium text-primary">{m ? money(unbilled) : '—'}</td>
            <td className="p-3 text-right text-warning">{m ? money(m.due) : '—'}</td>
            <td className="p-3 text-muted whitespace-nowrap">{new Date(order.created_at).toLocaleDateString()}</td>
          </tr>)}
        </tbody>
      </table>
      {!rows.length && <p className="text-muted text-sm p-8 text-center">No open sales orders match your filters.</p>}
    </div>
  </div>;
}
