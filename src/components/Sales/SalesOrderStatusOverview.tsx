import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { loadProjectSummaries } from '../../lib/projectOverview';

type Order = {
  id: string; order_number: string; status: string; contract_total: number;
  created_at: string; project_id?: string | null; proposal_id?: string | null; original_contract_total?: number | null;
  contact?: { full_name?: string } | null;
  sales_rep?: { full_name?: string } | null;
};
type Metrics = { estimated: number; actual: number; invoiced: number; due: number; contract: number; pm: string };
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const number = (value: unknown) => Number(value) || 0;
const OPEN = new Set(['pending_deposit', 'pending_po', 'planning', 'active']);

export function SalesOrderStatusOverview({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('overrun');
  const [pmFilter, setPmFilter] = useState('all');
  const openOrders = useMemo(() => orders.filter(o => OPEN.has(o.status)), [orders]);
  const ids = openOrders.map(o => o.id).join(',');
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!ids || !profile?.organization_id) { setMetrics({}); return; }
      setLoading(true); setError('');
      try {
        const next: Record<string, Metrics> = {};
        for (const order of openOrders) next[order.id] = { estimated: 0, actual: 0, invoiced: 0, due: 0, contract: number(order.contract_total), pm: '' };
        const projectIds = [...new Set(openOrders.map(o => o.project_id).filter((id): id is string => !!id))];
        const [invoicesResult, projectSummaries, proposalsResult, changesResult] = await Promise.all([
          supabase.from('invoices').select('sales_order_id,total,amount_due,status').in('sales_order_id', openOrders.map(o => o.id)),
          projectIds.length ? loadProjectSummaries(profile.organization_id, projectIds) : Promise.resolve([]),
          supabase.from('proposals').select('id,total').in('id', openOrders.map(o => o.proposal_id).filter((id): id is string => !!id).length ? openOrders.map(o => o.proposal_id).filter((id): id is string => !!id) : ['00000000-0000-0000-0000-000000000000']),
          supabase.from('change_orders').select('sales_order_id,status,is_billable,change_amount,tax_amount').in('sales_order_id', openOrders.map(o => o.id))
        ]);
        if (invoicesResult.error) throw invoicesResult.error;
        if (proposalsResult.error) throw proposalsResult.error;
        if (changesResult.error) throw changesResult.error;
        const proposalTotals = new Map((proposalsResult.data || []).map(p => [p.id, number(p.total)]));
        for (const order of openOrders) {
          const base = order.proposal_id && proposalTotals.has(order.proposal_id) ? proposalTotals.get(order.proposal_id)! : number(order.original_contract_total ?? order.contract_total);
          const changes = (changesResult.data || []).filter(co => co.sales_order_id === order.id && co.status === 'approved' && co.is_billable !== false);
          next[order.id].contract = base + changes.reduce((sum, co) => sum + (number(co.change_amount) < 0 ? number(co.change_amount) - Math.abs(number(co.tax_amount)) : Math.abs(number(co.change_amount)) + number(co.tax_amount)), 0);
        }

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
            next[order.id].pm = project.pm || 'Unassigned';
          }
        }
        if (!cancelled) setMetrics(next);
      } catch (e) {
        if (!cancelled) { setMetrics({}); setError(e instanceof Error ? e.message : 'Unable to load order balances'); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [ids, profile?.organization_id]);
  const rows = openOrders.map(order => {
    const m = metrics[order.id];
    const pct = m?.estimated ? m.actual / m.estimated * 100 : null;
    return { order, m, pct, unbilled: m ? Math.max(0, m.contract - m.invoiced) : 0 };
  }).filter(r => pmFilter === 'all' || r.m?.pm === pmFilter).sort((a,b) => {
    if (sort === 'unbilled') return b.unbilled - a.unbilled;
    if (sort === 'due') return (b.m?.due || 0) - (a.m?.due || 0);
    if (sort === 'oldest') return a.order.created_at.localeCompare(b.order.created_at);
    return (b.pct ?? -1) - (a.pct ?? -1);
  });
  const pms = [...new Set(Object.values(metrics).map(m => m.pm).filter(Boolean))].sort();
  const totals = rows.reduce((a,r) => ({
    value: a.value + (r.m?.contract ?? 0),
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
      <div className="flex flex-wrap gap-2">
      <select aria-label="Filter by project manager" value={pmFilter} onChange={e => setPmFilter(e.target.value)} className="bg-surface text-primary border border-subtle rounded-lg p-2 text-sm">
        <option value="all">All Project Managers</option>
        {pms.map(pm => <option key={pm} value={pm}>{pm}</option>)}
      </select>
      <select aria-label="Sort open sales orders" value={sort} onChange={e=>setSort(e.target.value)} className="bg-surface text-primary border border-subtle rounded-lg p-2 text-sm">
        <option value="overrun">Highest labor usage</option><option value="unbilled">Most unbilled</option>
        <option value="due">Largest amount due</option><option value="oldest">Oldest orders</option>
      </select>
      </div>
    </div>
    {error && <p role="alert" className="text-danger text-sm">Status figures unavailable: {error}</p>}
    {loading && <p role="status" className="text-muted text-sm">Refreshing labor and billing figures…</p>}
    <div className="md:hidden space-y-3">
      {rows.map(({ order, m, pct, unbilled }) => <button type="button" key={order.id} onClick={() => onOpen(order.id)} className="w-full text-left rounded-xl border border-subtle bg-surface p-4 space-y-3 hover:bg-elevated/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><div className="font-semibold text-primary truncate">{order.contact?.full_name || 'Unknown customer'}</div><div className="text-xs text-muted">SO-{order.order_number} · {new Date(order.created_at).toLocaleDateString()}</div></div>
          <span className="text-xs text-info whitespace-nowrap">View order →</span>
        </div>
        <div className="text-xs text-muted">Rep: {order.sales_rep?.full_name || '—'} · PM: {m?.pm || '—'}</div>
        <div>
          <div className="flex justify-between items-center gap-2 text-xs mb-1"><span className="text-muted">Field labor budget used</span><span className={pct !== null && pct > 100 ? 'font-bold text-danger' : pct !== null && pct >= 90 ? 'font-bold text-warning' : 'font-semibold text-primary'}>{pct !== null ? `${pct.toFixed(0)}% (${m?.actual.toFixed(1)} / ${m?.estimated.toFixed(1)}h)` : 'No estimate'}</span></div>
          <div className="h-2.5 rounded-full bg-elevated overflow-hidden">{pct !== null && <div className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-subtle pt-3">
          <div><div className="text-xs text-muted">Order</div><div className="text-sm font-semibold text-primary">{m ? money(m.contract) : '—'}</div></div>
          <div><div className="text-xs text-muted">Unbilled</div><div className="text-sm font-semibold text-primary">{m ? money(unbilled) : '—'}</div></div>
          <div><div className="text-xs text-muted">Due</div><div className="text-sm font-semibold text-warning">{m ? money(m.due) : '—'}</div></div>
        </div>
      </button>)}
    </div>
    <div className="hidden md:block rounded-xl border border-subtle overflow-x-auto">
      <table className="w-full min-w-[790px] text-sm">
        <thead className="bg-elevated text-muted text-xs"><tr>
          <th className="text-left p-3">Sales Order / Customer</th><th className="text-left p-3">Sales Rep</th><th className="text-left p-3">Project Manager</th>
          <th className="text-left p-3">Labor Used / Est.</th><th className="text-right p-3">Order Total</th>
          <th className="text-right p-3">Unbilled</th><th className="text-right p-3">Amount Due</th><th className="text-left p-3">Created</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-700/30">
          {rows.map(({order,m,pct,unbilled}) => <tr key={order.id} onClick={()=>onOpen(order.id)} className="cursor-pointer hover:bg-elevated/40">
            <td className="p-3"><div className="font-semibold text-primary">{order.contact?.full_name || 'Unknown customer'}</div><div className="text-xs text-muted">SO-{order.order_number}</div></td>
            <td className="p-3 text-secondary">{order.sales_rep?.full_name || '—'}</td><td className="p-3 text-secondary">{m?.pm || '—'}</td>
            <td className="p-3 min-w-[160px]">{m && pct !== null ? <>
              <div className={`text-xs font-semibold mb-1 ${pct > 100 ? 'text-danger' : pct >= 90 ? 'text-warning' : 'text-primary'}`}>{pct.toFixed(0)}% <span className="font-normal text-muted">({m.actual.toFixed(1)} / {m.estimated.toFixed(1)}h)</span></div>
              <div className="h-2.5 rounded-full bg-elevated overflow-hidden"><div className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{width:`${Math.min(100,pct)}%`}} /></div>
            </> : <span className="text-muted text-xs">No labor estimate</span>}</td>
            <td className="p-3 text-right text-primary">{m ? money(m.contract) : '—'}</td>
            <td className="p-3 text-right font-medium text-primary">{m ? money(unbilled) : '—'}</td>
            <td className="p-3 text-right text-warning">{m ? money(m.due) : '—'}</td>
            <td className="p-3 text-muted whitespace-nowrap">{new Date(order.created_at).toLocaleDateString()}</td>
          </tr>)}
        </tbody>
      </table>
      {!rows.length && !loading && !error && <p className="text-muted text-sm p-8 text-center">No open sales orders match your filters.</p>}
    </div>
  </div>;
}
