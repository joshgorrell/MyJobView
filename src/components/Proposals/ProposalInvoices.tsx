import { useState, useEffect } from 'react';
import { FileText, ExternalLink, DollarSign, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { RecordPaymentModal } from '../Invoices/RecordPaymentModal';

interface ProposalInvoicesProps {
  proposalId: string;
  contactId: string;
  contactEmail?: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  invoice_date: string;
  due_date: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  notes: string;
}

export function ProposalInvoices({ proposalId, contactId, contactEmail }: ProposalInvoicesProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    loadInvoices();
  }, [proposalId, contactId]);

  async function loadInvoices() {
    try {
      setLoading(true);

      // Load invoices for this proposal
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setInvoices(data || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
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

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  function getInvoiceTypeLabel(type: string) {
    switch (type) {
      case 'deposit':
        return 'Deposit';
      case 'progress':
        return 'Progress';
      case 'final':
        return 'Final';
      default:
        return 'Standard';
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading invoices...
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="p-6 text-center">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">No invoices yet</p>
        <p className="text-gray-400 text-xs mt-1">
          Invoices will appear here when the proposal is approved
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {paymentInvoice && (
        <RecordPaymentModal
          invoice={{
            id: paymentInvoice.id,
            invoice_number: paymentInvoice.invoice_number,
            contact_id: contactId,
            total: paymentInvoice.total,
            amount_paid: paymentInvoice.amount_paid,
            amount_due: paymentInvoice.amount_due,
            contact_email: contactEmail,
          }}
          onClose={() => setPaymentInvoice(null)}
          onSuccess={() => {
            setPaymentInvoice(null);
            loadInvoices();
          }}
        />
      )}

      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-t-lg">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Related Invoices
        </h3>
        <span className="text-xs text-gray-500">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-2 px-4 pb-4">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {getStatusIcon(invoice.status)}
                  <span className="font-semibold text-gray-900">{invoice.invoice_number}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(invoice.status)}`}>
                    {invoice.status}
                  </span>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                    {getInvoiceTypeLabel(invoice.invoice_type)}
                  </span>
                </div>
                {invoice.notes && (
                  <p className="text-xs text-gray-600 mt-1">{invoice.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                {invoice.status !== 'paid' && invoice.amount_due > 0 && (
                  <button
                    onClick={() => setPaymentInvoice(invoice)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 rounded-lg text-xs font-medium transition-colors"
                    title="Record payment"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Record Payment
                  </button>
                )}
                <button
                  onClick={() => window.open(`/invoices/${invoice.id}`, '_blank')}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="View Invoice"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Invoice Date
                </div>
                <div className="font-medium text-gray-900">{formatDate(invoice.invoice_date)}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Due Date
                </div>
                <div className="font-medium text-gray-900">{formatDate(invoice.due_date)}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Total
                </div>
                <div className="font-semibold text-gray-900">{formatCurrency(invoice.total)}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {invoice.status === 'paid' ? 'Paid' : 'Amount Due'}
                </div>
                <div className={`font-semibold ${invoice.status === 'paid' ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(invoice.status === 'paid' ? invoice.amount_paid : invoice.amount_due)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
