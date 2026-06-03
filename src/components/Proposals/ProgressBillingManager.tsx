import { useState, useEffect } from 'react';
import { DollarSign, Plus, TrendingUp, FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface BillingSummary {
  sales_order_id: string;
  proposal_total: number;
  change_orders_total: number;
  contract_total: number;
  billed_total: number;
  remaining_balance: number;
  billing_progress_percent: number;
  invoices: Invoice[];
  change_orders: ChangeOrder[];
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_title: string;
  source_type: string;
  invoice_date: string;
  due_date: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  billed_from_proposal: boolean;
  includes_change_orders: boolean;
}

interface ChangeOrder {
  id: string;
  change_order_number: string;
  description: string;
  change_amount: number;
  tax_amount: number;
  total_impact: number;
  amount_billed: number;
  billing_status: string;
  approval_status: string;
  approved_at: string;
}

interface ProgressBillingManagerProps {
  proposalId: string;
  salesOrderId: string;
  onCreateInvoice: () => void;
}

export default function ProgressBillingManager({
  proposalId,
  salesOrderId,
  onCreateInvoice
}: ProgressBillingManagerProps) {
  const { profile } = useAuth();
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBillingSummary();
  }, [salesOrderId]);

  async function loadBillingSummary() {
    if (!salesOrderId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase.rpc('get_billing_summary', {
        p_sales_order_id: salesOrderId
      });

      if (error) throw error;

      setBillingSummary(data);
    } catch (error) {
      console.error('Error loading billing summary:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'partial':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'overdue':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'sent':
        return <FileText className="w-4 h-4 text-blue-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'overdue':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'sent':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  function getBillingStatusColor(status: string) {
    switch (status) {
      case 'unbilled':
        return 'bg-gray-100 text-gray-800';
      case 'partially_billed':
        return 'bg-yellow-100 text-yellow-800';
      case 'fully_billed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading billing information...</p>
        </div>
      </div>
    );
  }

  if (!billingSummary) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-500">Unable to load billing information</p>
      </div>
    );
  }

  const canCreateInvoice = billingSummary.remaining_balance > 0;

  return (
    <div className="space-y-6">
      {/* Billing Summary Dashboard */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Billing Summary
          </h3>
          <button
            onClick={onCreateInvoice}
            disabled={!canCreateInvoice}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              canCreateInvoice
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Plus className="w-4 h-4" />
            Create Progress Invoice
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-xs text-gray-500 mb-1">Original Contract</div>
            <div className="text-xl font-bold text-gray-900">
              {formatCurrency(billingSummary.proposal_total)}
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-xs text-gray-500 mb-1">Change Orders</div>
            <div className="text-xl font-bold text-gray-900">
              {formatCurrency(billingSummary.change_orders_total)}
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-blue-300 bg-blue-50">
            <div className="text-xs text-blue-700 mb-1 font-medium">Total Contract Value</div>
            <div className="text-xl font-bold text-blue-900">
              {formatCurrency(billingSummary.contract_total)}
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-xs text-gray-500 mb-1">Billed to Date</div>
            <div className="text-xl font-bold text-green-600">
              {formatCurrency(billingSummary.billed_total)}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 font-medium">Billing Progress</span>
            <span className="text-gray-900 font-semibold">
              {billingSummary.billing_progress_percent.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(billingSummary.billing_progress_percent, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Remaining: {formatCurrency(billingSummary.remaining_balance)}</span>
            {!canCreateInvoice && (
              <span className="text-green-600 font-medium">Fully Billed</span>
            )}
          </div>
        </div>
      </div>

      {/* Invoices Section */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-700" />
            Invoices ({billingSummary.invoices.length})
          </h3>
        </div>

        {billingSummary.invoices.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No invoices created yet</p>
            <p className="text-gray-400 text-xs mt-1">
              Create your first progress invoice to start billing
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {billingSummary.invoices.map((invoice) => (
              <div key={invoice.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(invoice.status)}
                      <span className="font-semibold text-gray-900">
                        {invoice.invoice_number}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(invoice.status)}`}>
                        {invoice.status}
                      </span>
                      {invoice.invoice_title && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                          {invoice.invoice_title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>Date: {formatDate(invoice.invoice_date)}</span>
                      <span>Due: {formatDate(invoice.due_date)}</span>
                      {invoice.includes_change_orders && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                          Includes Change Orders
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900">
                      {formatCurrency(invoice.total)}
                    </div>
                    {invoice.status === 'partial' && (
                      <div className="text-xs text-gray-500">
                        Paid: {formatCurrency(invoice.amount_paid)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Change Orders Section */}
      {billingSummary.change_orders.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-base font-semibold text-gray-900">
              Change Orders ({billingSummary.change_orders.length})
            </h3>
          </div>

          <div className="divide-y divide-gray-200">
            {billingSummary.change_orders.map((co) => (
              <div key={co.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">
                        {co.change_order_number}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getBillingStatusColor(co.billing_status)}`}>
                        {co.billing_status.replace('_', ' ')}
                      </span>
                      {co.approval_status !== 'approved' && (
                        <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-medium">
                          {co.approval_status}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-1">{co.description}</p>
                    {co.approval_status === 'approved' && co.billing_status !== 'unbilled' && (
                      <div className="text-xs text-gray-500">
                        Billed: {formatCurrency(co.amount_billed)} of {formatCurrency(co.total_impact)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-gray-900">
                      {formatCurrency(co.total_impact)}
                    </div>
                    {co.approval_status === 'approved' && co.billing_status === 'unbilled' && (
                      <div className="text-xs text-orange-600 font-medium">Available to Bill</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!canCreateInvoice && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-900">Contract Fully Billed</p>
            <p className="text-xs text-green-700 mt-1">
              All work has been invoiced. Total billed: {formatCurrency(billingSummary.billed_total)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
