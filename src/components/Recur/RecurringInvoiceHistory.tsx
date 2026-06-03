import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, CheckCircle, XCircle, Clock, Send } from 'lucide-react';

interface RecurringInvoice {
  id: string;
  subscription_id: string;
  invoice_id: string | null;
  billing_period_start: string;
  billing_period_end: string;
  amount: number;
  status: string;
  scheduled_date: string;
  generated_at: string | null;
  error_message: string | null;
  recurring_subscriptions: {
    contacts: {
      contact_name: string;
    };
  };
}

export default function RecurringInvoiceHistory() {
  const [invoices, setInvoices] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadInvoiceHistory();
  }, []);

  async function loadInvoiceHistory() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('recurring_invoices')
        .select(`
          *,
          recurring_subscriptions(
            contacts(contact_name)
          )
        `)
        .order('scheduled_date', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error('Error loading invoice history:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredInvoices = filterStatus === 'all'
    ? invoices
    : invoices.filter(inv => inv.status === filterStatus);

  const statusIcons: Record<string, React.ElementType> = {
    scheduled: Clock,
    generated: CheckCircle,
    sent: Send,
    paid: CheckCircle,
    failed: XCircle,
  };

  const statusColors: Record<string, string> = {
    scheduled: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
    generated: 'text-green-400 bg-green-500/20 border-green-500/30',
    sent: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
    paid: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
    failed: 'text-red-400 bg-red-500/20 border-red-500/30',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading invoice history...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white">Billing History</h2>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm"
          >
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="generated">Generated</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
          <FileText className="mx-auto text-gray-600 mb-4" size={48} />
          <p className="text-gray-400">
            {filterStatus === 'all' ? 'No billing history yet' : `No ${filterStatus} invoices`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredInvoices.map((invoice) => {
            const StatusIcon = statusIcons[invoice.status] || Clock;

            return (
              <div
                key={invoice.id}
                className="bg-gray-800 rounded-lg p-6 border border-gray-700"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">
                        {invoice.recurring_subscriptions?.contacts?.contact_name || 'Unknown Contact'}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${statusColors[invoice.status]}`}>
                        <StatusIcon size={14} />
                        {invoice.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">
                      Billing Period: {new Date(invoice.billing_period_start).toLocaleDateString()} - {new Date(invoice.billing_period_end).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">${invoice.amount.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400 mb-1">Scheduled Date</p>
                    <p className="text-white">
                      {new Date(invoice.scheduled_date).toLocaleDateString()}
                    </p>
                  </div>
                  {invoice.generated_at && (
                    <div>
                      <p className="text-gray-400 mb-1">Generated At</p>
                      <p className="text-white">
                        {new Date(invoice.generated_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {invoice.invoice_id && (
                    <div>
                      <p className="text-gray-400 mb-1">Invoice ID</p>
                      <p className="text-white font-mono text-xs">
                        {invoice.invoice_id.substring(0, 8)}...
                      </p>
                    </div>
                  )}
                </div>

                {invoice.error_message && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-sm text-red-400">
                      <strong>Error:</strong> {invoice.error_message}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
