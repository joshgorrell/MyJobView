import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, FileText, CreditCard, Users, Calendar, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface FinancialMetrics {
  salesInvoiced: number;
  monthlySalesInvoiced: number;
  cashCollected: number;
  accountsReceivable: number;
  paidInvoices: number;
  partialInvoices: number;
  overdueInvoices: number;
  totalCommissions: number;
  recurringRevenue: number;
  activeSubscriptions: number;
}

interface RecentInvoice {
  id: string;
  invoice_number: string;
  contact_name: string;
  total: number;
  status: string;
  due_date: string;
}

export function FinanceDashboard() {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<FinancialMetrics>({
    salesInvoiced: 0,
    monthlySalesInvoiced: 0,
    cashCollected: 0,
    accountsReceivable: 0,
    paidInvoices: 0,
    partialInvoices: 0,
    overdueInvoices: 0,
    totalCommissions: 0,
    recurringRevenue: 0,
    activeSubscriptions: 0
  });
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFinancialData();
  }, [profile]);

  async function loadFinancialData() {
    if (!profile) return;

    try {
      setLoading(true);

      // Calculate current month start/end
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const monthStartDate = monthStart.slice(0, 10);
      const monthEndDate = monthEnd.slice(0, 10);

      // Server-side aggregation for invoice KPIs (replaces unbounded invoice download)
      const { data: invoiceMetrics, error: metricsError } = await supabase
        .rpc('get_finance_dashboard_metrics', {
          p_month_start: monthStartDate,
          p_month_end: monthEndDate
        });

      if (metricsError) throw metricsError;

      const m = invoiceMetrics || {};

      // Recent invoices (limited to 5, replaces slicing from full download)
      const { data: recentInvoicesRaw, error: recentError } = await supabase
        .from('invoices')
        .select('id, invoice_number, total, status, due_date, contact:contacts(full_name)')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentError) throw recentError;

      // Cash collected is based on payment date, not invoice creation date.
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, payment_date')
        .gte('payment_date', monthStartDate)
        .lte('payment_date', monthEndDate);

      const cashCollected = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // Get commissions data
      const { data: commissions } = await supabase
        .from('commission_calculations')
        .select('amount')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const totalCommissions = commissions?.reduce((sum, c) => sum + Number(c.amount || 0), 0) || 0;

      // Get recurring subscriptions data
      const { data: subscriptions } = await supabase
        .from('recurring_subscriptions')
        .select('plan:recurring_plans(amount)')
        .eq('status', 'active');

      const recurringRevenue = subscriptions?.reduce((sum, s: any) =>
        sum + Number(s.plan?.amount || 0), 0) || 0;

      const activeSubscriptions = subscriptions?.length || 0;

      setMetrics({
        salesInvoiced: Number(m.sales_invoiced || 0),
        monthlySalesInvoiced: Number(m.monthly_sales_invoiced || 0),
        cashCollected,
        accountsReceivable: Number(m.accounts_receivable || 0),
        paidInvoices: Number(m.paid_invoices || 0),
        partialInvoices: Number(m.partial_invoices || 0),
        overdueInvoices: Number(m.overdue_invoices || 0),
        totalCommissions,
        recurringRevenue,
        activeSubscriptions
      });

      const recentInvoicesData = (recentInvoicesRaw || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        contact_name: inv.contact?.full_name || 'Unknown',
        total: Number(inv.total || 0),
        status: inv.status,
        due_date: inv.due_date
      }));

      setRecentInvoices(recentInvoicesData);
    } catch (error) {
      console.error('Error loading financial data:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-successSoft text-success';
      case 'submitted':
        return 'bg-infoSoft text-info';
      case 'overdue':
        return 'bg-dangerSoft text-danger';
      case 'draft':
        return 'bg-surface text-primary';
      default:
        return 'bg-surface text-primary';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading financial data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Finance Dashboard</h1>
          <p className="text-muted mt-1">Overview of your financial metrics</p>
        </div>
        <button
          onClick={loadFinancialData}
          className="px-4 py-2 bg-blue-600 text-primary rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Monthly Revenue */}
        <div className="bg-canvas rounded-xl shadow-sm border border-subtle p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-successSoft rounded-lg">
              <TrendingUp className="w-6 h-6 text-success" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted">Sales Invoiced This Month</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(metrics.monthlySalesInvoiced)}</p>
          </div>
        </div>

        {/* Outstanding Invoices */}
        <div className="bg-canvas rounded-xl shadow-sm border border-subtle p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-warningSoft rounded-lg">
              <AlertCircle className="w-6 h-6 text-warning" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted">Accounts Receivable</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(metrics.accountsReceivable)}</p>
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-canvas rounded-xl shadow-sm border border-subtle p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-infoSoft rounded-lg">
              <CreditCard className="w-6 h-6 text-info" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted">Cash Collected This Month</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(metrics.cashCollected)}</p>
          </div>
        </div>

        {/* Recurring Revenue */}
        <div className="bg-canvas rounded-xl shadow-sm border border-subtle p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-accentSoft rounded-lg">
              <Calendar className="w-6 h-6 text-accent" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted">Recurring Subscription Value</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(metrics.recurringRevenue)}</p>
            <p className="text-xs text-muted">{metrics.activeSubscriptions} active subscriptions</p>
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-canvas rounded-xl shadow-sm border border-subtle p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-muted" />
            <p className="text-sm font-medium text-secondary">Sales Invoiced (All Time)</p>
          </div>
          <p className="text-xl font-bold text-primary">{formatCurrency(metrics.salesInvoiced)}</p>
        </div>

        <div className="bg-canvas rounded-xl shadow-sm border border-subtle p-6">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-5 h-5 text-muted" />
            <p className="text-sm font-medium text-secondary">Paid Invoices</p>
          </div>
          <p className="text-xl font-bold text-primary">{metrics.paidInvoices}</p>
        </div>

        <div className="bg-canvas rounded-xl shadow-sm border border-subtle p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-muted" />
            <p className="text-sm font-medium text-secondary">Commissions (This Month)</p>
          </div>
          <p className="text-xl font-bold text-primary">{formatCurrency(metrics.totalCommissions)}</p>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="bg-canvas rounded-xl shadow-sm border border-subtle">
        <div className="p-6 border-b border-subtle">
          <h2 className="text-lg font-semibold text-primary">Recent Invoices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Invoice #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Due Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-canvas divide-y divide-subtle">
              {recentInvoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted">
                    No invoices found
                  </td>
                </tr>
              ) : (
                recentInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-surface">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-primary">
                      {invoice.contact_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-primary">
                      {formatCurrency(invoice.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(invoice.status)}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                      {invoice.due_date ? formatDate(invoice.due_date) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
