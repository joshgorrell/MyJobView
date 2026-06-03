import { useState, useEffect } from 'react';
import { DollarSign, Clock, TrendingUp, AlertCircle, RefreshCw, BarChart2, CheckCircle, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface InvoiceStatsData {
  totalOpen: number;
  totalOverdue: number;
  totalPaid30Days: number;
  avgDaysToPaid: number | null;
  recurringCount: number;
  recurringMonthlyRevenue: number;
  aging: {
    current: number;
    days1_30: number;
    days31_60: number;
    days61_90: number;
    over90: number;
  };
  agingAmounts: {
    current: number;
    days1_30: number;
    days31_60: number;
    days61_90: number;
    over90: number;
  };
  statusBreakdown: {
    draft: number;
    sent: number;
    partial: number;
    paid: number;
    overdue: number;
    void: number;
  };
  topCustomersBalance: Array<{ name: string; balance: number }>;
  openInvoiceCount: number;
  totalInvoices: number;
}

export function InvoiceStats() {
  const [stats, setStats] = useState<InvoiceStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const [invoicesResult, recurringResult] = await Promise.all([
        supabase.from('invoices').select(`
          id, status, total, amount_paid, amount_due, invoice_date, due_date,
          contacts:contact_id (contact_name, first_name, last_name, full_name)
        `),
        supabase.from('recurring_plans').select('id, amount').eq('status', 'active'),
      ]);

      const invoices = invoicesResult.data || [];
      const recurringPlans = recurringResult.data || [];

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      let totalOpen = 0;
      let totalOverdue = 0;
      let totalPaid30Days = 0;
      let paidDaysSum = 0;
      let paidDaysCount = 0;
      let openInvoiceCount = 0;

      const aging = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0 };
      const agingAmounts = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0 };
      const statusBreakdown = { draft: 0, sent: 0, partial: 0, paid: 0, overdue: 0, void: 0 };
      const customerBalances: Record<string, { name: string; balance: number }> = {};

      for (const inv of invoices) {
        const status = inv.status as string;
        if (status in statusBreakdown) {
          statusBreakdown[status as keyof typeof statusBreakdown]++;
        }

        const dueDate = inv.due_date ? new Date(inv.due_date) : null;
        const invoiceDate = new Date(inv.invoice_date);
        const amountDue = Number(inv.amount_due) || 0;
        const total = Number(inv.total) || 0;

        if (['sent', 'partial', 'overdue'].includes(status)) {
          totalOpen += amountDue;
          openInvoiceCount++;

          if (dueDate) {
            const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysOverdue <= 0) {
              aging.current++;
              agingAmounts.current += amountDue;
            } else if (daysOverdue <= 30) {
              aging.days1_30++;
              agingAmounts.days1_30 += amountDue;
            } else if (daysOverdue <= 60) {
              aging.days31_60++;
              agingAmounts.days31_60 += amountDue;
            } else if (daysOverdue <= 90) {
              aging.days61_90++;
              agingAmounts.days61_90 += amountDue;
            } else {
              aging.over90++;
              agingAmounts.over90 += amountDue;
            }
          }
        }

        if (status === 'overdue') {
          totalOverdue += amountDue;
        }

        if (status === 'paid' && dueDate && invoiceDate >= thirtyDaysAgo) {
          totalPaid30Days += total;
        }

        if (status === 'paid' && dueDate) {
          const days = Math.floor((dueDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
          if (days >= 0) {
            paidDaysSum += days;
            paidDaysCount++;
          }
        }

        const contact = inv.contacts as any;
        const customerName = contact?.full_name || contact?.contact_name ||
          `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Unknown';

        if (['sent', 'partial', 'overdue'].includes(status) && amountDue > 0) {
          const key = customerName;
          if (!customerBalances[key]) {
            customerBalances[key] = { name: customerName, balance: 0 };
          }
          customerBalances[key].balance += amountDue;
        }
      }

      const topCustomersBalance = Object.values(customerBalances)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

      const recurringMonthlyRevenue = recurringPlans.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      setStats({
        totalOpen,
        totalOverdue,
        totalPaid30Days,
        avgDaysToPaid: paidDaysCount > 0 ? Math.round(paidDaysSum / paidDaysCount) : null,
        recurringCount: recurringPlans.length,
        recurringMonthlyRevenue,
        aging,
        agingAmounts,
        statusBreakdown,
        topCustomersBalance,
        openInvoiceCount,
        totalInvoices: invoices.length,
      });
    } catch (err) {
      console.error('Error loading invoice stats:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const agingMaxAmount = Math.max(
    stats.agingAmounts.current,
    stats.agingAmounts.days1_30,
    stats.agingAmounts.days31_60,
    stats.agingAmounts.days61_90,
    stats.agingAmounts.over90,
    1
  );

  const totalStatusCount = Object.values(stats.statusBreakdown).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<DollarSign className="w-5 h-5 text-orange-600" />}
          iconBg="bg-orange-100"
          label="Open Balance"
          value={`$${stats.totalOpen.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={`${stats.openInvoiceCount} open invoice${stats.openInvoiceCount !== 1 ? 's' : ''}`}
        />
        <StatCard
          icon={<AlertCircle className="w-5 h-5 text-red-600" />}
          iconBg="bg-red-100"
          label="Overdue Balance"
          value={`$${stats.totalOverdue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={`${stats.statusBreakdown.overdue} overdue invoice${stats.statusBreakdown.overdue !== 1 ? 's' : ''}`}
          valueColor="text-red-600"
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-blue-600" />}
          iconBg="bg-blue-100"
          label="Avg Days to Paid"
          value={stats.avgDaysToPaid !== null ? `${stats.avgDaysToPaid} days` : '—'}
          sub="from invoice to payment"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-green-600" />}
          iconBg="bg-green-100"
          label="Collected (30d)"
          value={`$${stats.totalPaid30Days.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub="invoices paid last 30 days"
          valueColor="text-green-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aging Report */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">Accounts Receivable Aging</h3>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: 'Current', count: stats.aging.current, amount: stats.agingAmounts.current, color: 'bg-green-500' },
              { label: '1–30 Days', count: stats.aging.days1_30, amount: stats.agingAmounts.days1_30, color: 'bg-yellow-400' },
              { label: '31–60 Days', count: stats.aging.days31_60, amount: stats.agingAmounts.days31_60, color: 'bg-orange-400' },
              { label: '61–90 Days', count: stats.aging.days61_90, amount: stats.agingAmounts.days61_90, color: 'bg-red-500' },
              { label: '90+ Days', count: stats.aging.over90, amount: stats.agingAmounts.over90, color: 'bg-red-700' },
            ].map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 font-medium w-24">{row.label}</span>
                  <span className="text-gray-500 text-xs">{row.count} inv.</span>
                  <span className="font-semibold text-gray-900 text-right w-28">
                    ${row.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${row.color}`}
                    style={{ width: `${Math.min(100, (row.amount / agingMaxAmount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">Invoice Status Breakdown</h3>
          </div>
          <div className="p-5 space-y-3">
            {[
              { key: 'draft', label: 'Draft', color: 'bg-gray-400' },
              { key: 'sent', label: 'Sent', color: 'bg-blue-500' },
              { key: 'partial', label: 'Partially Paid', color: 'bg-yellow-400' },
              { key: 'paid', label: 'Paid', color: 'bg-green-500' },
              { key: 'overdue', label: 'Overdue', color: 'bg-red-500' },
              { key: 'void', label: 'Void', color: 'bg-gray-300' },
            ].map((row) => {
              const count = stats.statusBreakdown[row.key as keyof typeof stats.statusBreakdown];
              const pct = Math.round((count / totalStatusCount) * 100);
              return (
                <div key={row.key} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${row.color}`} />
                  <span className="text-sm text-gray-700 w-32">{row.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${row.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 w-8 text-right">{count}</span>
                  <span className="text-xs text-gray-400 w-9 text-right">{pct}%</span>
                </div>
              );
            })}
            <div className="pt-2 border-t border-gray-100 flex justify-between text-xs text-gray-500">
              <span>Total invoices</span>
              <span className="font-semibold text-gray-700">{stats.totalInvoices}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recurring Revenue */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">Recurring Billing</h3>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-3xl font-bold text-gray-900">
                  ${stats.recurringMonthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">Monthly recurring revenue</p>
              </div>
              <div className="w-14 h-14 bg-teal-100 rounded-2xl flex items-center justify-center">
                <RefreshCw className="w-7 h-7 text-teal-600" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.recurringCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">Active plans</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">
                  ${(stats.recurringMonthlyRevenue * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Annual run rate</p>
              </div>
            </div>
          </div>
        </div>

        {/* Top Open Balances */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Eye className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">Top Open Balances</h3>
          </div>
          <div className="p-5">
            {stats.topCustomersBalance.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No open balances</p>
            ) : (
              <div className="space-y-3">
                {stats.topCustomersBalance.map((c, i) => {
                  const maxBalance = stats.topCustomersBalance[0]?.balance || 1;
                  const pct = (c.balance / maxBalance) * 100;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700 font-medium truncate max-w-[180px]">{c.name}</span>
                        <span className="font-semibold text-gray-900 ml-2 flex-shrink-0">
                          ${c.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  sub,
  valueColor = 'text-gray-900',
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-bold mt-0.5 ${valueColor}`}>{value}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>
      </div>
    </div>
  );
}
