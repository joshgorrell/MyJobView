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

      // Get invoices data
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, total, amount_due, status, due_date, invoice_date, created_at, contact:contacts(full_name)')
        .order('created_at', { ascending: false });

      // Sales invoiced and accounts receivable come from invoice accounting fields.
      const salesInvoiced = invoices?.filter(inv => inv.status !== 'draft' && inv.status !== 'void')
        .reduce((sum, inv) => sum + Number(inv.total || 0), 0) || 0;

      const monthlySalesInvoiced = invoices?.filter(inv =>
        inv.status !== 'draft' &&
        inv.status !== 'void' &&
        inv.invoice_date >= monthStartDate &&
        inv.invoice_date <= monthEndDate
      ).reduce((sum, inv) => sum + Number(inv.total || 0), 0) || 0;

      const accountsReceivable = invoices?.filter(inv => inv.status !== 'draft' && inv.status !== 'void')
        .reduce((sum, inv) => sum + Number(inv.amount_due || 0), 0) || 0;

      const paidInvoices = invoices?.filter(inv => inv.status === 'paid').length || 0;
      const partialInvoices = invoices?.filter(inv => inv.status === 'partial').length || 0;
      const overdueInvoices = invoices?.filter(inv => inv.status === 'overdue' || (
        Number(inv.amount_due || 0) > 0 && inv.due_date && inv.due_date < monthStartDate
      )).length || 0;

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
        salesInvoiced,
        monthlySalesInvoiced,
        cashCollected,
        accountsReceivable,
        paidInvoices,
        partialInvoices,
        overdueInvoices,
        totalCommissions,
        recurringRevenue,
        activeSubscriptions
      });

      // Get recent invoices
      const recentInvoicesData = invoices?.slice(0, 5).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        contact_name: inv.contact?.full_name || 'Unknown',
        total: Number(inv.total || 0),
        status: inv.status,
        due_date: inv.due_date
      })) || [];

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
        return 'bg-green-100 text-green-800';
      case 'sent':
        return 'bg-blue-100 text-blue-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading financial data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of your financial metrics</p>
        </div>
        <button
          onClick={loadFinancialData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Monthly Revenue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500">Sales Invoiced This Month</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.monthlySalesInvoiced)}</p>
          </div>
        </div>

        {/* Outstanding Invoices */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertCircle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500">Accounts Receivable</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.accountsReceivable)}</p>
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500">Cash Collected This Month</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.cashCollected)}</p>
          </div>
        </div>

        {/* Recurring Revenue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500">Recurring Subscription Value</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.recurringRevenue)}</p>
            <p className="text-xs text-gray-400">{metrics.activeSubscriptions} active subscriptions</p>
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-gray-600" />
            <p className="text-sm font-medium text-gray-700">Sales Invoiced (All Time)</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(metrics.salesInvoiced)}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-5 h-5 text-gray-600" />
            <p className="text-sm font-medium text-gray-700">Paid Invoices</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{metrics.paidInvoices}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-gray-600" />
            <p className="text-sm font-medium text-gray-700">Commissions (This Month)</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(metrics.totalCommissions)}</p>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Invoices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentInvoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No invoices found
                  </td>
                </tr>
              ) : (
                recentInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.contact_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {formatCurrency(invoice.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(invoice.status)}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
