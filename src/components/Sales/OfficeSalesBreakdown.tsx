import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Building2, ChevronDown, ChevronRight, AlertTriangle, TrendingUp, FileText, DollarSign, Percent, X } from 'lucide-react';
import { fetchSalesKpis } from '../../lib/salesKpis';

interface OfficeSummary {
  officeId: string;
  officeName: string;
  orderCount: number;
  contractTotal: number;
  invoicedTotal: number;
  collectedTotal: number;
  pipelineTotal: number;
  proposalCount: number;
  averageSale: number;
  averageMarginPct: number;
  orders: OfficeOrder[];
}

interface OfficeOrder {
  id: string;
  order_number: string;
  contact_name: string;
  rep_name: string;
  created_at: string;
  contract_total: number;
  status: string;
}

interface OfficeSalesBreakdownProps {
  onNavigateToOffice?: (officeId: string, officeName: string) => void;
}

type DateRange = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all_time';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
];

function getDateRange(range: DateRange): { startDate: string | null; endDate: string | null } {
  const now = new Date();
  switch (range) {
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case 'all_time':
      return { startDate: null, endDate: null };
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
  }
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export function OfficeSalesBreakdown({ onNavigateToOffice }: OfficeSalesBreakdownProps) {
  const { profile } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [offices, setOffices] = useState<OfficeSummary[]>([]);
  const [orphanedCount, setOrphanedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedOfficeId, setExpandedOfficeId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [dateRange, profile?.id]);

  async function loadData() {
    if (!profile) return;
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(dateRange);

      // Query all company offices
      const { data: officeData } = await supabase
        .from('company_offices')
        .select('id, office_name')
        .order('office_name');

      // Query sales orders joining contact (for office_id) and rep
      let soQuery = supabase
        .from('sales_orders')
        .select(`
          id,
          order_number,
          contract_total,
          status,
          created_at,
          sales_rep_id,
          contact:contacts(full_name, office_id),
          sales_rep:profiles!sales_orders_sales_rep_id_fkey(full_name),
          invoices(amount_due, status)
        `)
        .not('status', 'in', '(cancelled,void)');

      if (startDate) soQuery = soQuery.gte('created_at', startDate);
      if (endDate) soQuery = soQuery.lte('created_at', endDate);

      // Query proposals (pipeline) by office_id
      let pQuery = supabase
        .from('proposals')
        .select('office_id, total_amount')
        .not('status', 'in', '(cancelled,archived,declined)');

      if (startDate) pQuery = pQuery.gte('created_at', startDate);
      if (endDate) pQuery = pQuery.lte('created_at', endDate);

      const [{ data: soData }, { data: pData }] = await Promise.all([soQuery, pQuery]);

      const orders = soData || [];
      const proposals = pData || [];

      // Count orphaned orders (contact has no office assigned)
      const orphaned = orders.filter(o => !(o.contact as any)?.office_id).length;
      setOrphanedCount(orphaned);

      // Build per-office summaries
      const officeMap = new Map<string, OfficeSummary>();

      for (const office of officeData || []) {
        officeMap.set(office.id, {
          officeId: office.id,
          officeName: office.office_name,
          orderCount: 0,
          contractTotal: 0,
          invoicedTotal: 0,
          collectedTotal: 0,
          pipelineTotal: 0,
          proposalCount: 0,
          averageSale: 0,
          averageMarginPct: 0,
          orders: [],
        });
      }

      for (const order of orders) {
        if (!(order.contact as any)?.office_id) continue;
        const summary = officeMap.get((order.contact as any)?.office_id);
        if (!summary) continue;

        summary.orderCount++;
        summary.contractTotal += order.contract_total || 0;

        const invoices: { amount_due: number; status: string }[] = order.invoices || [];
        const invoiced = invoices.reduce((s: number, inv) => s + (inv.amount_due || 0), 0);
        const collected = invoices
          .filter((inv) => inv.status === 'paid')
          .reduce((s: number, inv) => s + (inv.amount_due || 0), 0);

        summary.invoicedTotal += invoiced;
        summary.collectedTotal += collected;

        summary.orders.push({
          id: order.id,
          order_number: order.order_number,
          contact_name: (order.contact as any)?.full_name || 'Unknown',
          rep_name: (order.sales_rep as any)?.full_name || '—',
          created_at: order.created_at,
          contract_total: order.contract_total || 0,
          status: order.status,
        });
      }

      for (const p of proposals) {
        if (!p.office_id) continue;
        const summary = officeMap.get(p.office_id);
        if (!summary) continue;
        summary.pipelineTotal += p.total_amount || 0;
        summary.proposalCount++;
      }

      // Sort by contractTotal desc, filter out empty offices
      const result = Array.from(officeMap.values())
        .filter(o => o.orderCount > 0 || o.proposalCount > 0)
        .sort((a, b) => b.contractTotal - a.contractTotal);

      // Fetch per-office KPIs (average sale + margin)
      for (const office of result) {
        try {
          const officeKpis = await fetchSalesKpis({ type: 'office', officeId: office.officeId }, dateRange);
          office.averageSale = officeKpis.averageSale;
          office.averageMarginPct = officeKpis.averageMarginPct;
        } catch {
          // KPI fetch failure is non-fatal
        }
      }

      setOffices(result);
    } catch (err) {
      console.error('Error loading office sales data:', err);
    } finally {
      setLoading(false);
    }
  }

  const grandTotal = offices.reduce((s, o) => s + o.contractTotal, 0);
  const grandOrders = offices.reduce((s, o) => s + o.orderCount, 0);
  const grandInvoiced = offices.reduce((s, o) => s + o.invoicedTotal, 0);
  const grandCollected = offices.reduce((s, o) => s + o.collectedTotal, 0);
  const grandPipeline = offices.reduce((s, o) => s + o.pipelineTotal, 0);

  const STATUS_COLORS: Record<string, string> = {
    pending_deposit: 'text-yellow-400',
    pending_po: 'text-orange-400',
    planning: 'text-blue-400',
    active: 'text-green-400',
    complete: 'text-gray-300',
    closed: 'text-gray-500',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400 text-sm">Loading office sales data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + date range */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-0.5">Sales by Office</h1>
          <p className="text-gray-400 text-sm">Revenue and pipeline broken down by office location</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DATE_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                dateRange === opt.value
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orphaned records warning */}
      {orphanedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-amber-300 text-sm">
            <span className="font-semibold">{orphanedCount} order{orphanedCount !== 1 ? 's' : ''}</span> have no office assigned and are excluded from totals below.
          </p>
        </div>
      )}

      {offices.length === 0 ? (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-12 text-center">
          <Building2 className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white mb-1">No Data for This Period</h3>
          <p className="text-gray-400 text-sm">No sales orders or proposals found for the selected date range.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total Sold', value: fmt(grandTotal), sub: `${grandOrders} orders`, icon: DollarSign, color: 'text-green-400' },
              { label: 'Total Invoiced', value: fmt(grandInvoiced), sub: 'invoiced to date', icon: FileText, color: 'text-blue-400' },
              { label: 'Collected', value: fmt(grandCollected), sub: 'paid invoices', icon: DollarSign, color: 'text-emerald-400' },
              { label: 'Pipeline', value: fmt(grandPipeline), sub: 'open proposals', icon: TrendingUp, color: 'text-amber-400' },
            ].map(card => (
              <div key={card.label} className="bg-gray-800/60 rounded-xl border border-gray-700/60 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{card.label}</span>
                </div>
                <div className="text-xl font-bold text-white">{card.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Office rows table */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 overflow-hidden">
            {/* Desktop header */}
            <div className="hidden md:grid grid-cols-[auto_1fr_repeat(4,minmax(0,120px))_40px] gap-0 border-b border-gray-700/60">
              <div className="w-10" />
              <div className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Office</div>
              <div className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium text-right">Orders</div>
              <div className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium text-right">Sold</div>
              <div className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium text-right">Avg Sale</div>
              <div className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium text-right">Margin</div>
              <div className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium text-right">Invoiced</div>
              <div className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium text-right">Pipeline</div>
              <div />
            </div>

            <div className="divide-y divide-gray-700/40">
              {offices.map(office => {
                const isExpanded = expandedOfficeId === office.officeId;
                const pct = grandTotal > 0 ? (office.contractTotal / grandTotal) * 100 : 0;

                return (
                  <div key={office.officeId}>
                    {/* Office summary row */}
                    <div
                      className="hover:bg-gray-700/30 cursor-pointer transition-colors"
                      onClick={() => setExpandedOfficeId(isExpanded ? null : office.officeId)}
                    >
                      {/* Mobile layout */}
                      <div className="md:hidden p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            }
                            <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            <span className="font-semibold text-white text-sm truncate">{office.officeName}</span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-white font-bold text-sm">{fmt(office.contractTotal)}</div>
                            <div className="text-gray-500 text-xs">{office.orderCount} order{office.orderCount !== 1 ? 's' : ''}</div>
                          </div>
                        </div>
                        <div className="mt-2 ml-10">
                          <div className="w-full bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>Pipeline: {fmt(office.pipelineTotal)}</span>
                            <span>{pct.toFixed(1)}% of total</span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>Avg Sale: {office.averageSale > 0 ? fmt(office.averageSale) : '--'}</span>
                            <span className={office.averageMarginPct >= 40 ? 'text-green-400' : office.averageMarginPct >= 25 ? 'text-amber-400' : ''}>
                              Margin: {office.averageMarginPct > 0 ? `${office.averageMarginPct.toFixed(1)}%` : '--'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden md:grid grid-cols-[auto_1fr_repeat(6,minmax(0,110px))_40px] gap-0 items-center min-h-[56px]">
                        <div className="w-10 flex items-center justify-center">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-gray-400" />
                            : <ChevronRight className="w-4 h-4 text-gray-400" />
                          }
                        </div>
                        <div className="px-4 py-3 min-w-0">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            <span className="font-semibold text-white text-sm truncate">{office.officeName}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 bg-gray-700 rounded-full h-1">
                              <div
                                className="bg-blue-500 h-1 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0">{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="px-4 py-3 text-right">
                          <span className="text-gray-300 text-sm">{office.orderCount}</span>
                        </div>
                        <div className="px-4 py-3 text-right">
                          <span className="text-white font-semibold text-sm">{fmt(office.contractTotal)}</span>
                        </div>
                        <div className="px-4 py-3 text-right">
                          <span className="text-emerald-400 text-sm font-medium">{office.averageSale > 0 ? fmt(office.averageSale) : '--'}</span>
                        </div>
                        <div className="px-4 py-3 text-right">
                          <span className={`text-sm font-medium ${office.averageMarginPct >= 40 ? 'text-green-400' : office.averageMarginPct >= 25 ? 'text-amber-400' : office.averageMarginPct > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                            {office.averageMarginPct > 0 ? `${office.averageMarginPct.toFixed(1)}%` : '--'}
                          </span>
                        </div>
                        <div className="px-4 py-3 text-right">
                          <span className="text-blue-300 text-sm">{fmt(office.invoicedTotal)}</span>
                        </div>
                        <div className="px-4 py-3 text-right">
                          <span className="text-amber-400 text-sm">{fmt(office.pipelineTotal)}</span>
                        </div>
                        <div className="px-3 py-3">
                          {onNavigateToOffice && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onNavigateToOffice(office.officeId, office.officeName); }}
                              className="text-gray-600 hover:text-blue-400 transition-colors"
                              title="View orders for this office"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded order detail */}
                    {isExpanded && (
                      <div className="bg-gray-900/50 border-t border-gray-700/40">
                        {/* Detail header */}
                        <div className="flex items-center justify-between px-4 pt-3 pb-2">
                          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                            {office.orders.length} Sales Order{office.orders.length !== 1 ? 's' : ''}
                          </span>
                          {onNavigateToOffice && (
                            <button
                              onClick={() => onNavigateToOffice(office.officeId, office.officeName)}
                              className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                            >
                              View all in Sales Orders
                            </button>
                          )}
                        </div>

                        {office.orders.length === 0 ? (
                          <p className="px-4 pb-4 text-gray-500 text-sm">No orders found for this period.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs min-w-[480px]">
                              <thead>
                                <tr className="text-gray-500 uppercase tracking-wider">
                                  <th className="text-left px-4 py-2 font-medium">Customer</th>
                                  <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Rep</th>
                                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Date</th>
                                  <th className="text-left px-4 py-2 font-medium">Status</th>
                                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-700/30">
                                {office.orders.map(order => (
                                  <tr key={order.id} className="hover:bg-gray-700/20 transition-colors">
                                    <td className="px-4 py-2">
                                      <div className="text-gray-200 font-medium truncate max-w-[160px]">{order.contact_name}</div>
                                      <div className="text-gray-600 font-mono text-xs">SO-{order.order_number}</div>
                                    </td>
                                    <td className="px-4 py-2 text-gray-400 hidden sm:table-cell truncate max-w-[120px]">{order.rep_name}</td>
                                    <td className="px-4 py-2 text-gray-500 hidden md:table-cell whitespace-nowrap">
                                      {new Date(order.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-2">
                                      <span className={`capitalize ${STATUS_COLORS[order.status] || 'text-gray-400'}`}>
                                        {order.status.replace('_', ' ')}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-right text-white font-semibold whitespace-nowrap">
                                      {fmt(order.contract_total)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-gray-600/40">
                                  <td colSpan={4} className="px-4 py-2 text-gray-400 font-semibold text-right hidden md:table-cell">Office Total</td>
                                  <td colSpan={3} className="px-4 py-2 text-gray-400 font-semibold text-right md:hidden">Office Total</td>
                                  <td className="px-4 py-2 text-right text-white font-bold">{fmt(office.contractTotal)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                        <div className="h-2" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Grand total footer */}
            <div className="border-t-2 border-gray-600/60 bg-gray-800/80">
              {/* Mobile */}
              <div className="md:hidden flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <span className="font-bold text-white text-sm">Grand Total</span>
                  <span className="text-gray-400 text-xs">({grandOrders} orders)</span>
                </div>
                <span className="font-bold text-green-400 text-base">{fmt(grandTotal)}</span>
              </div>
              {/* Desktop */}
              <div className="hidden md:grid grid-cols-[auto_1fr_repeat(4,minmax(0,120px))_40px] gap-0 items-center min-h-[48px]">
                <div className="w-10" />
                <div className="px-4 py-3">
                  <span className="font-bold text-white text-sm">Grand Total</span>
                  <span className="text-gray-500 text-xs ml-2">({offices.length} office{offices.length !== 1 ? 's' : ''})</span>
                </div>
                <div className="px-4 py-3 text-right">
                  <span className="text-white font-bold text-sm">{grandOrders}</span>
                </div>
                <div className="px-4 py-3 text-right">
                  <span className="text-green-400 font-bold text-sm">{fmt(grandTotal)}</span>
                </div>
                <div className="px-4 py-3 text-right">
                  <span className="text-blue-300 font-semibold text-sm">{fmt(grandInvoiced)}</span>
                </div>
                <div className="px-4 py-3 text-right">
                  <span className="text-amber-400 font-semibold text-sm">{fmt(grandPipeline)}</span>
                </div>
                <div />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
